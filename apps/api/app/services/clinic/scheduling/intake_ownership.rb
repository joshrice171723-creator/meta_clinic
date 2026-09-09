module Clinic
  module Scheduling
    module IntakeOwnership
      ROLE = "intake_owner".freeze
      LEASE_DURATION = 15.minutes

      module_function

      def claim(encounter:, actor:, request_key:, expected_token:)
        change!(encounter:, actor:, request_key:, expected_token:, action: :claim)
      end

      def release(encounter:, actor:, request_key:, expected_token:)
        change!(encounter:, actor:, request_key:, expected_token:, action: :release)
      end

      # This is a read projection, not a lease mutation. An expired lease remains
      # visible as stale work until a user explicitly claims it again.
      def board_snapshot(encounters:, at:, viewer_membership_id:, claim_available:)
        encounter_ids = encounters.map(&:id)
        return {} if encounter_ids.empty?

        encounter_by_id = encounters.index_by(&:id)
        participants = Clinic::EncounterParticipant.intake_owners
          .where(practice_id: encounters.first.practice_id, encounter_id: encounter_ids)
          .includes(membership: :clinician_profile)
          .order(:encounter_id, :effective_from, :id).to_a
        employment_by_membership = Clinic::Workforce::Employment.where(
          practice_id: encounters.first.practice_id,
          membership_id: participants.map(&:membership_id).uniq
        ).includes(:staff_member).index_by(&:membership_id)

        participants.group_by(&:encounter_id).transform_values do |rows|
          participant = rows.max_by { |row| [ row.effective_from, row.id ] }
          expires_at = participant.effective_until
          stale = expires_at.blank? || expires_at <= at
          available_to_claim = claim_available.respond_to?(:call) ? claim_available.call(encounter_by_id.fetch(participant.encounter_id)) : claim_available
          {
            participant_id: participant.id.to_s,
            token: participant.id.to_s,
            owner: {
              membership_id: participant.membership_id.to_s,
              display_name: display_name(participant, employment_by_membership)
            },
            lease_expires_at: expires_at&.iso8601(6),
            state: stale ? "stale" : "claimed",
            claim_available: available_to_claim && stale,
            release_available: available_to_claim && !stale && participant.membership_id == viewer_membership_id
          }
        end
      end

      def change!(encounter:, actor:, request_key:, expected_token:, action:)
        practice = encounter.practice
        operation_code = "encounters.intake.#{action}"
        payload = {
          encounter_id: encounter.id,
          expected_token: expected_token,
          action: action.to_s
        }
        outcome = Clinic::Idempotency.execute(
          practice: practice,
          actor: actor,
          operation_code: operation_code,
          request_key: request_key,
          payload: payload,
          resource: encounter,
          authorization: lambda {
            Clinic::Authorization.authorize!(
              actor: actor,
              practice: practice,
              action: "intake.write",
              site: encounter.site
            )
          },
          authorization_action: "intake.write",
          result_resource: ->(participant) { participant },
          resource_resolver: ->(practice:, receipt:) {
            practice.encounter_participants.find_by(id: receipt.resource_id)
          }
        ) do
          now = Current.business_time
          updated = practice.encounters.lock.find(encounter.id)
          raise ArgumentError, "A completed encounter cannot be claimed for intake." if updated.ended_at.present? || updated.status == "completed"

          membership = practice.memberships.active.lock.find_by!(user_id: actor.id)
          current = latest_owner(updated)
          assert_expected_token!(current, expected_token)

          participant = if action == :claim
            claim_current!(encounter: updated, membership: membership, current: current, now: now)
          else
            release_current!(membership: membership, current: current, now: now)
          end
          Clinic::AuditRecorder.record!(
            practice: practice,
            actor: actor,
            action_code: "intake.#{action}",
            outcome: :committed,
            resource_version_ref: "encounter-participant:#{participant.id}:#{participant.updated_at.utc.iso8601(6)}"
          )
          participant
        end
        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

        outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The intake ownership outcome is unavailable.")
      end
      private_class_method :change!

      def latest_owner(encounter)
        encounter.participants.intake_owners.order(id: :desc).first
      end
      private_class_method :latest_owner

      def assert_expected_token!(current, expected_token)
        actual = current&.id&.to_s
        return if expected_token == actual

        raise ActiveRecord::StaleObjectError.new(current || Clinic::EncounterParticipant.new, "intake_ownership")
      end
      private_class_method :assert_expected_token!

      def claim_current!(encounter:, membership:, current:, now:)
        active = current && current.effective_until.present? && current.effective_until > now
        if active && current.membership_id != membership.id
          raise ActiveRecord::StaleObjectError.new(current, "intake_ownership")
        end
        if active
          current.update!(effective_until: now + LEASE_DURATION)
          return current
        end

        encounter.participants.create!(
          practice: encounter.practice,
          patient: encounter.patient,
          membership: membership,
          participation_role: ROLE,
          effective_from: now,
          effective_until: now + LEASE_DURATION
        )
      end
      private_class_method :claim_current!

      def release_current!(membership:, current:, now:)
        unless current&.effective_until&.>(now)
          raise ActiveRecord::StaleObjectError.new(current || Clinic::EncounterParticipant.new, "intake_ownership")
        end
        raise Clinic::Authorization::Denied unless current.membership_id == membership.id

        ends_at = [ now, current.effective_from + 0.000001 ].max
        current.update!(effective_until: ends_at)
        current
      end
      private_class_method :release_current!

      def display_name(participant, employment_by_membership)
        participant.membership.clinician_profile&.display_name.presence ||
          employment_by_membership[participant.membership_id]&.staff_member&.display_name.presence ||
          "Clinic staff"
      end
      private_class_method :display_name
    end
  end
end
