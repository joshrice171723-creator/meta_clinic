module Clinic
  module Telehealth
    # Access revocation changes local authority synchronously. Provider ejection
    # is an outbox operation whose eventual outcome remains independently visible.
    module RevokeMembershipAccess
      module_function

      def call(membership:, reason: "membership_access_revoked", force: false, now: Time.current)
        return 0 unless membership && Participant.table_exists?

        relation = active_participants.where(practice_id: membership.practice_id, membership_id: membership.id)
        reconcile_relation(relation, reason: reason, force: force, now: now)
      end

      def for_user(user:, reason: "account_access_revoked", force: false, now: Time.current)
        return 0 unless Participant.table_exists?

        memberships = Clinic::Membership.where(user_id: user.id).select(:id)
        identities = Clinic::PatientPortal::Identity.where(user_id: user.id).select(:id)
        relation = active_participants.where(membership_id: memberships)
          .or(active_participants.where(portal_identity_id: identities))
        reconcile_relation(relation, reason: reason, force: force, now: now)
      end

      def reconcile(now: Time.current, limit: 100)
        # Scan every live participant in bounded batches. Limiting only the first
        # page would indefinitely miss revoked participants behind valid ones.
        reconcile_relation(active_participants, reason: "effective_access_expired", now: now,
          batch_size: limit.to_i.clamp(1, 1000))
      end

      def active_participants
        Participant.active_record.joins(:visit)
          .where(clinic_telehealth_visits: { status: %w[scheduled in_progress ending] })
      end

      def reconcile_relation(relation, reason:, force: false, now:, batch_size: 100)
        changed = 0
        relation.includes(:portal_identity, :membership, visit: [ :appointment, :practice ])
          .find_each(batch_size: batch_size) do |participant|
          visit = participant.visit
          visit.appointment.with_lock do
            visit.lock!
            participant.lock!
            next if participant.removed? || participant.revoked_at.present?

            ability = participant.membership && Ability.new(participant.membership.user,
              practice: visit.practice, at: Current.business_time)
            allowed = !force && participant_allowed?(participant, ability)
            if allowed
              if visit.scribe_capture_owner_participant_id == participant.id &&
                  !ability&.allowed_permission?("scribe.write", site: visit.appointment.site)
                fence_capture!(visit)
                changed += 1
              end
              next
            end

            participant.join_grants.where(revoked_at: nil).find_each do |grant|
              grant.update_columns(revoked_at: now, revocation_reason: reason)
            end
            participant.update!(status: "removed", revoked_at: now, revocation_reason: reason)
            fence_capture!(visit) if visit.scribe_capture_owner_participant_id == participant.id || participant.patient?
            room = visit.current_room_attempt
            if room && !room.status.in?(%w[ended failed])
              visit.commands.find_or_create_by!(dedupe_key: "access-eject:#{visit.access_generation}:#{participant.id}") do |command|
                command.practice_id = visit.practice_id
                command.participant = participant
                command.room_attempt = room
                command.kind = "eject_participant"
                command.status = "pending"
                command.access_generation = visit.access_generation
                command.available_at = now
              end
            end
            # Increment projection version even when there was no active capture.
            visit.touch
            changed += 1
          end
        end
        changed
      end

      def participant_allowed?(participant, ability)
        if participant.patient?
          identity = participant.portal_identity&.reload
          return identity&.active? && identity.user.active? && identity.patient_id == participant.visit.patient_id
        end

        membership = participant.membership&.reload
        return false unless membership&.active? && membership.user.active? && ability&.membership

        site = participant.visit.appointment.site
        ability.allowed_permission?("telehealth.participate", site: site) &&
          (!participant.clinician? || ability.allowed_permission?("telehealth.host", site: site))
      end

      def fence_capture!(visit)
        return unless visit.scribe_capture_owner_participant_id

        visit.update!(scribe_capture_owner_participant_id: nil, scribe_capture_owner_token_digest: nil,
          scribe_capture_lease_expires_at: nil, scribe_capture_epoch: visit.scribe_capture_epoch + 1)
      end
    end
  end
end
