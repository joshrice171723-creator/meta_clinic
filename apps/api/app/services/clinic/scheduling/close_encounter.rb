module Clinic
  module Scheduling
    class CloseEncounter
      def self.call(encounter:, actor:, request_key:, ended_at: nil)
        Authorization.authorize!(actor: actor, practice: encounter.practice, action: "encounters.write", site: encounter.site)

        result = Clinic::Idempotency.execute(
          practice: encounter.practice,
          actor: actor,
          operation_code: "encounters.close",
          request_key: request_key,
          payload: { encounter_id: encounter.id, patient_id: encounter.patient_id, ended_at: ended_at&.iso8601 },
          resource: encounter,
          authorization: -> { Authorization.authorize!(actor: actor, practice: encounter.practice,
            action: "encounters.write", site: encounter.site) },
          authorization_action: "encounters.write",
          result_resource: ->(closed_encounter) { closed_encounter },
          resource_resolver: ->(practice:, receipt:) {
            practice.encounters.where(patient_id: encounter.patient_id).find_by(id: receipt.resource_id)
          }
        ) do
          appointment = encounter.appointment_id && encounter.practice.appointments.lock.find(encounter.appointment_id)
          updated = encounter.practice.encounters.where(patient_id: encounter.patient_id).lock.find(encounter.id)
          updated.close!(ended_at: ended_at || Current.business_time)
          if appointment && %w[scheduled confirmed].include?(appointment.status)
            appointment.update!(status: "completed")
            Clinic::Reminders::ReconcileAppointment.call(appointment: appointment, actor: actor)
          end
          AuditRecorder.record!(practice: encounter.practice, actor: actor, action_code: "encounters.close",
            outcome: :committed, resource_version_ref: "encounter:#{updated.id}:#{updated.updated_at.utc.iso8601(6)}")
          updated
        end
        raise Clinic::Idempotency::OutcomeUnconfirmed if result.receipt.outcome_outcome_unconfirmed?

        result.value || encounter.reload
      end
    end
  end
end
