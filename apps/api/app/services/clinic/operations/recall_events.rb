module Clinic
  module Operations
    module RecallEvents
      module_function

      ACTIONS = %w[record_outreach snooze exclude complete reopen].freeze

      def record(practice:, actor:, follow_up:, action:, request_key:, expected_version:, attributes:,
        at: Current.business_time)
        action = action.to_s
        raise ArgumentError, "The recall action is unsupported." unless ACTIONS.include?(action)

        authorize!(practice, actor, follow_up, encounter: follow_up.encounter)
        member = membership!(practice, actor)
        input = normalize(action, attributes)
        result = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "care.recall.#{action}", request_key:,
          resource: follow_up, authorization_action: "encounters.write",
          authorization: -> { authorize!(practice, actor, follow_up, encounter: follow_up.encounter) },
          payload: { follow_up_id: follow_up.id, action:, expected_version:, event: input },
          result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) {
            Clinic::RecallEvent.find_by(practice_id: practice.id, id: receipt.resource_id)
          }
        ) do
          current = Clinic::EncounterFollowUp.where(practice_id: practice.id).lock.find(follow_up.id)
          encounter = Clinic::Encounter.where(practice_id: practice.id, patient_id: current.patient_id)
            .lock.find(current.encounter_id)
          authorize!(practice, actor, current, encounter:)
          stale!(current, expected_version)
          ensure_allowed!(current, action, at:)
          previous_state = current.state
          occurred_at = input[:occurred_at] || at
          validate_event_time!(occurred_at, encounter:, at:)
          if action == "snooze" && input.fetch(:snoozed_until) <= occurred_at
            raise ArgumentError, "Choose a snooze date after the event time."
          end

          case action
          when "complete"
            current.update!(
              state: "completed", outcome: input.fetch(:completion_evidence),
              completed_at: occurred_at, completed_by_membership_id: member.id,
              updated_by_membership_id: member.id, follow_up_appointment_id: nil
            )
          when "reopen"
            if current.state == "completed"
              current.update!(
                state: "needed", outcome: "", completed_at: nil, completed_by_membership_id: nil,
                updated_by_membership_id: member.id, follow_up_appointment_id: nil
              )
            else
              advance_source_version!(current, member)
            end
          else
            # Every accepted operational event advances the shared version so
            # another writer holding the prior version must reconcile first.
            advance_source_version!(current, member)
          end

          Clinic::RecallEvent.create!(
            practice:, patient_id: current.patient_id, encounter_id: current.encounter_id,
            follow_up: current, actor_membership: member, event_type: event_type(action), request_key:,
            previous_clinical_state: previous_state, resulting_clinical_state: current.state,
            source_version: current.lock_version, occurred_at: occurred_at,
            channel: input[:channel], reason: input[:reason], snoozed_until: input[:snoozed_until],
            completion_evidence: input[:completion_evidence]
          )
        end
        result.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def normalize(action, attributes)
        values = attributes.to_h.deep_symbolize_keys
        # Keep nil when the caller omits the timestamp. The server time is
        # assigned only inside the idempotent transaction, never in its digest.
        result = { occurred_at: values[:occurred_at].present? ? parse_time(values[:occurred_at], "event time") : nil }
        case action
        when "record_outreach"
          channel = values[:channel].to_s
          raise ArgumentError, "Choose how the outreach attempt occurred." unless Clinic::RecallEvent::CHANNELS.include?(channel)

          result[:channel] = channel
          result[:reason] = optional_text(values[:reason], maximum: 1_000)
        when "snooze"
          result[:reason] = required_text(values[:reason], "snooze reason", maximum: 1_000)
          result[:snoozed_until] = parse_time(values[:snoozed_until], "snooze date")
        when "exclude", "reopen"
          result[:reason] = required_text(values[:reason], "reason", maximum: 1_000)
        when "complete"
          result[:completion_evidence] = required_text(values[:completion_evidence], "completion outcome", maximum: 4_000)
        end
        result
      end

      def ensure_allowed!(follow_up, action, at:)
        control = latest_control(follow_up)
        deferred = control&.event_type == "excluded" ||
          (control&.event_type == "snoozed" && control.snoozed_until > at)
        if action == "reopen"
          unless follow_up.state == "completed" || deferred
            raise ArgumentError, "Only a completed or deferred recall can be reopened."
          end
          return
        end
        raise ArgumentError, "Reopen this deferred recall before recording another action." if deferred
        unless Clinic::EncounterFollowUp::OPEN_STATES.include?(follow_up.effective_state)
          raise ArgumentError, "Only an active follow-up can receive this recall action."
        end
      end

      def event_type(action)
        { "record_outreach" => "outreach_recorded", "snooze" => "snoozed",
          "exclude" => "excluded", "complete" => "completed", "reopen" => "reopened" }.fetch(action)
      end

      def authorize!(practice, actor, follow_up, encounter:)
        raise Clinic::Authorization::Denied unless follow_up.practice_id == practice.id
        unless encounter.practice_id == practice.id && encounter.patient_id == follow_up.patient_id &&
            encounter.id == follow_up.encounter_id
          raise Clinic::Authorization::Denied
        end

        if encounter.site
          Clinic::Authorization.authorize!(actor:, practice:, action: "patients.read", site: encounter.site)
          Clinic::Authorization.authorize!(actor:, practice:, action: "encounters.write", site: encounter.site)
        else
          ability = Ability.new(actor, practice:)
          unless ability.practice_scope_for?("patients.read") && ability.practice_scope_for?("encounters.write")
            raise Clinic::Authorization::Denied
          end
          Clinic::Authorization.authorize!(actor:, practice:, action: "patients.read", any_site: true)
          Clinic::Authorization.authorize!(actor:, practice:, action: "encounters.write", any_site: true)
        end
      end

      def latest_control(follow_up)
        Clinic::RecallEvent.where(
          practice_id: follow_up.practice_id, follow_up_id: follow_up.id,
          source_version: follow_up.lock_version,
          event_type: Clinic::Operations::RecallWorklist::CONTROL_EVENTS
        ).order(id: :desc).first
      end

      def validate_event_time!(occurred_at, encounter:, at:)
        return if occurred_at <= at + 5.minutes && occurred_at >= encounter.started_at

        raise ArgumentError, "The recall event time must be after the encounter and cannot be in the future."
      end

      def advance_source_version!(follow_up, member)
        if follow_up.updated_by_membership_id == member.id
          follow_up.touch
        else
          follow_up.update!(updated_by_membership_id: member.id)
        end
      end

      def membership!(practice, actor)
        Clinic::Membership.active.find_by!(practice_id: practice.id, user_id: actor.id)
      end

      def stale!(follow_up, expected_version)
        expected = Integer(expected_version.to_s, 10)
        raise ActiveRecord::StaleObjectError.new(follow_up, "update") unless follow_up.lock_version == expected
      rescue ArgumentError
        raise ArgumentError, "The expected recall version is invalid."
      end

      def required_text(value, label, maximum:)
        text = value.to_s.strip
        raise ArgumentError, "Provide a #{label} of #{maximum} characters or fewer." unless text.length.between?(1, maximum)

        text
      end

      def optional_text(value, maximum:)
        text = value.to_s.strip
        raise ArgumentError, "The recall note is too long." if text.length > maximum

        text.presence
      end


      def parse_time(value, label)
        Time.iso8601(value.to_s)
      rescue ArgumentError
        raise ArgumentError, "Choose a valid #{label}."
      end
    end
  end
end
