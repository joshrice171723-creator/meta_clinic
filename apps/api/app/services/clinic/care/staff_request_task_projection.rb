module Clinic
  module Care
    class StaffRequestTaskProjection
      ACTIVE_REQUEST_STATES = %w[open acknowledged in_progress].freeze

      class << self
        def sync!(request:, actor_membership: nil)
          request = Clinic::StaffMessageRequest.includes(message: :conversation).find(request.id)
          context = patient_context(request.message)
          return unless context

          source_type, source_id = source_identity(request.message, context)
          task = Clinic::ClinicalTask.find_or_initialize_by(
            practice_id: request.practice_id,
            source_type:,
            source_id:
          )
          return if task.new_record? && !ACTIVE_REQUEST_STATES.include?(request.state)

          assign_context(task, request, context)
          apply_state(task, request, actor_membership)
          task.save!
          task
        end

        private

        def patient_context(message)
          case message.linked_object_type
          when "patient_reminder"
            reminder = Clinic::PatientReminder.find_by(
              practice_id: message.practice_id,
              id: message.linked_object_id
            )
            return unless reminder

            appointment = reminder.source_type == "Clinic::Appointment" || reminder.source_type == "appointment" ?
              Clinic::Appointment.find_by(practice_id: reminder.practice_id, id: reminder.source_id) : nil
            { patient: reminder.patient, encounter: appointment&.encounter, site: appointment&.site, reminder: }
          when "appointment"
            appointment = Clinic::Appointment.find_by(practice_id: message.practice_id, id: message.linked_object_id)
            appointment && { patient: appointment.patient, encounter: appointment.encounter, site: appointment.site }
          when "encounter"
            encounter = Clinic::Encounter.find_by(practice_id: message.practice_id, id: message.linked_object_id)
            encounter && { patient: encounter.patient, encounter:, site: encounter.site }
          end
        end

        def source_identity(message, context)
          context[:reminder] ? [ "reminder", context.fetch(:reminder).id ] : [ "message", message.request.id ]
        end

        def assign_context(task, request, context)
          task.assign_attributes(
            patient: context.fetch(:patient),
            encounter: context[:encounter],
            site: context[:site],
            task_kind: "staff_request",
            pool_code: pool_for(request.message),
            assigned_to_membership: request.assignee_membership,
            due_at: request.due_at,
            recorded_by_membership: request.message.sender_membership
          )
        end

        def pool_for(message)
          return "front_desk" if message.linked_object_type == "appointment"
          return "front_desk" if message.requested_action.to_s.match?(/reschedul|appoint/i)

          "clinical"
        end

        def apply_state(task, request, actor_membership)
          case request.state
          when "open"
            task.assign_attributes(state: "open", resolution_code: nil,
              completed_by_membership: nil, completed_at: nil)
          when "acknowledged"
            task.assign_attributes(state: "claimed", resolution_code: nil,
              completed_by_membership: nil, completed_at: nil)
          when "in_progress"
            task.assign_attributes(state: "in_progress", resolution_code: nil,
              completed_by_membership: nil, completed_at: nil)
          when "resolved"
            task.assign_attributes(state: "completed",
              resolution_code: normalized_resolution(request.resolution_code),
              completed_by_membership: actor_membership || request.assignee_membership,
              completed_at: request.resolved_at || Current.business_time)
          when "declined", "expired"
            task.assign_attributes(state: "cancelled", resolution_code: nil,
              completed_by_membership: nil, completed_at: nil)
          end
        end

        def normalized_resolution(value)
          value.to_s == "no_action_needed" ? "no_action_needed" : "completed"
        end
      end
    end
  end
end
