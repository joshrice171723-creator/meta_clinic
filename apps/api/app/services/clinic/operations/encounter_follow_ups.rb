module Clinic
  module Operations
    module EncounterFollowUps
      module_function

      def show(practice:, actor:, encounter:)
        authorize_read!(practice, actor)
        follow_up = Clinic::EncounterFollowUp.includes(:follow_up_appointment, :assigned_to_membership)
          .find_by(practice_id: practice.id, encounter_id: encounter.id)
        { follow_up: follow_up && serialize(follow_up), options: options(encounter) }
      end

      def record(practice:, actor:, encounter:, request_key:, expected_version:, attributes:)
        authorize_write!(practice, actor, encounter)
        member = membership!(practice, actor)
        input = normalize_record_input(encounter, attributes)
        existing = Clinic::EncounterFollowUp.find_by(practice_id: practice.id, encounter_id: encounter.id)
        outcome = Clinic::Idempotency.execute(
          practice: practice, actor: actor, operation_code: "care.encounter_follow_up.record",
          request_key: request_key, resource: existing || encounter, authorization_action: "encounters.write",
          authorization: -> { authorize_write!(practice, actor, encounter) },
          payload: { encounter_id: encounter.id, expected_version: expected_version, follow_up: input },
          result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { Clinic::EncounterFollowUp.find_by(practice_id: practice.id, id: receipt.resource_id) }
        ) do
          encounter.with_lock do
            follow_up = Clinic::EncounterFollowUp.lock.find_or_initialize_by(
              practice_id: practice.id, encounter_id: encounter.id
            )
            stale!(follow_up, expected_version)
            follow_up.assign_attributes(input.merge(
              patient_id: encounter.patient_id,
              source_kind: follow_up.source_kind.presence || "in_person",
              recorded_by_membership_id: follow_up.recorded_by_membership_id || member.id,
              updated_by_membership_id: member.id,
              outcome: "", completed_at: nil, completed_by_membership_id: nil
            ))
            follow_up.save!
            follow_up
          end
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def transition(practice:, actor:, follow_up:, action:, request_key:, expected_version:, outcome: nil)
        authorize_write!(practice, actor, follow_up.encounter)
        member = membership!(practice, actor)
        action = action.to_s
        raise ArgumentError, "The follow-up action is unsupported." unless action.in?(%w[complete reopen])
        text = normalized_text(outcome, maximum: 4_000)
        raise ArgumentError, "Record an outcome before completing this follow-up." if action == "complete" && text.blank?
        result = Clinic::Idempotency.execute(
          practice: practice, actor: actor, operation_code: "care.encounter_follow_up.#{action}",
          request_key: request_key, resource: follow_up, authorization_action: "encounters.write",
          authorization: -> { authorize_write!(practice, actor, follow_up.encounter) },
          payload: { follow_up_id: follow_up.id, action: action, expected_version: expected_version, outcome: text },
          result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { Clinic::EncounterFollowUp.find_by(practice_id: practice.id, id: receipt.resource_id) }
        ) do
          follow_up = Clinic::EncounterFollowUp.lock.find(follow_up.id)
          stale!(follow_up, expected_version)
          if action == "complete"
            follow_up.update!(state: "completed", outcome: text, completed_at: Current.business_time,
              completed_by_membership_id: member.id, updated_by_membership_id: member.id,
              follow_up_appointment_id: nil)
          else
            follow_up.update!(state: "needed", outcome: "", completed_at: nil,
              completed_by_membership_id: nil, updated_by_membership_id: member.id,
              follow_up_appointment_id: nil)
          end
          follow_up
        end
        result.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def sync_from_wrap_up!(wrap_up:, actor:)
        encounter = wrap_up.encounter
        member = membership!(wrap_up.practice, actor)
        follow_up = Clinic::EncounterFollowUp.lock.find_or_initialize_by(
          practice_id: wrap_up.practice_id, encounter_id: encounter.id
        )
        return follow_up if follow_up.persisted? && follow_up.state == "completed"

        state = wrap_up.follow_up_status == "none" ? "not_required" : wrap_up.follow_up_status
        follow_up.assign_attributes(
          patient_id: encounter.patient_id,
          source_kind: "telehealth",
          state: state,
          plan: wrap_up.follow_up_plan.to_s,
          follow_up_appointment_id: state == "arranged" ? wrap_up.follow_up_appointment_id : nil,
          due_at: state == "arranged" ? wrap_up.follow_up_appointment&.starts_at : nil,
          recorded_by_membership_id: follow_up.recorded_by_membership_id || member.id,
          updated_by_membership_id: member.id,
          outcome: "", completed_at: nil, completed_by_membership_id: nil
        )
        follow_up.save!
        follow_up
      end

      def serialize(follow_up)
        appointment = follow_up.effective_follow_up_appointment
        {
          id: follow_up.id,
          patient_id: follow_up.patient_id,
          encounter_id: follow_up.encounter_id,
          source_kind: follow_up.source_kind,
          status: follow_up.effective_state,
          recorded_status: follow_up.state,
          plan: follow_up.plan,
          outcome: follow_up.outcome,
          due_at: (appointment&.starts_at || follow_up.due_at)&.iso8601(6),
          follow_up_appointment: appointment && appointment_payload(appointment),
          assigned_to_membership_id: follow_up.assigned_to_membership_id,
          completed_at: follow_up.completed_at&.iso8601(6),
          version: follow_up.lock_version,
          updated_at: follow_up.updated_at.iso8601(6)
        }
      end

      def projection(encounter:, fallback_status:, fallback_plan:, fallback_appointment:)
        follow_up = Clinic::EncounterFollowUp.includes(:follow_up_appointment)
          .find_by(practice_id: encounter.practice_id, encounter_id: encounter.id)
        return {
          status: fallback_status,
          plan: fallback_plan,
          appointment: fallback_appointment
        } unless follow_up

        effective_state = follow_up.effective_state
        {
          status: effective_state.in?(%w[not_required completed]) ? "none" : effective_state,
          plan: follow_up.plan,
          appointment: follow_up.effective_follow_up_appointment
        }
      end

      def options(encounter)
        after = encounter.appointment&.ends_at || encounter.ended_at || encounter.started_at
        appointments = Clinic::Appointment.where(practice_id: encounter.practice_id, patient_id: encounter.patient_id,
          status: %w[scheduled confirmed]).where("starts_at > ?", after).where.not(id: encounter.appointment_id)
          .order(:starts_at, :id).limit(25)
        { follow_up_appointments: appointments.map { |appointment| appointment_payload(appointment) } }
      end

      def appointment_payload(appointment)
        {
          id: appointment.id,
          status: appointment.status,
          starts_at: appointment.starts_at.iso8601(6),
          ends_at: appointment.ends_at.iso8601(6),
          visit_modality: appointment.visit_modality
        }
      end

      def normalize_record_input(encounter, attributes)
        value = attributes.to_h.deep_symbolize_keys
        state = value.fetch(:status).to_s
        state = "not_required" if state == "none"
        raise ArgumentError, "The follow-up status is unsupported." unless state.in?(%w[not_required needed arranged])
        plan = normalized_text(value[:plan], maximum: 4_000)
        raise ArgumentError, "Enter a follow-up plan." if state.in?(%w[needed arranged]) && plan.blank?
        appointment = nil
        if state == "arranged"
          appointment_id = Integer(value.fetch(:follow_up_appointment_id).to_s, 10)
          after = encounter.appointment&.ends_at || encounter.ended_at || encounter.started_at
          appointment = Clinic::Appointment.where(practice_id: encounter.practice_id, patient_id: encounter.patient_id,
            status: %w[scheduled confirmed]).where("starts_at > ?", after).find(appointment_id)
        end
        due_at = value[:due_at].present? ? Time.iso8601(value[:due_at].to_s) : nil
        assignee_id = value[:assigned_to_membership_id].present? ? Integer(value[:assigned_to_membership_id].to_s, 10) : nil
        if assignee_id
          Clinic::Membership.active.find_by!(practice_id: encounter.practice_id, id: assignee_id)
        end
        {
          state: state,
          plan: plan,
          follow_up_appointment_id: appointment&.id,
          due_at: appointment&.starts_at || due_at,
          assigned_to_membership_id: assignee_id
        }
      rescue KeyError, ArgumentError => error
        raise ArgumentError, error.message
      end

      def stale!(follow_up, expected_version)
        expected = Integer(expected_version.to_s, 10)
        current = follow_up.persisted? ? follow_up.lock_version : 0
        raise ActiveRecord::StaleObjectError.new(follow_up, "update") unless current == expected
      end

      def normalized_text(value, maximum:)
        text = value.to_s.strip
        raise ArgumentError, "The follow-up text is too long." if text.length > maximum

        text
      end

      def membership!(practice, actor)
        Clinic::Membership.active.find_by!(practice_id: practice.id, user_id: actor.id)
      end

      def authorize_read!(practice, actor)
        Clinic::Authorization.authorize!(actor: actor, practice: practice, action: "patients.read", any_site: true)
      end

      def authorize_write!(practice, actor, encounter)
        Clinic::Authorization.authorize!(actor: actor, practice: practice, action: "patients.read", any_site: true)
        Clinic::Authorization.authorize!(actor: actor, practice: practice, action: "encounters.write", site: encounter.site)
      end
    end
  end
end
