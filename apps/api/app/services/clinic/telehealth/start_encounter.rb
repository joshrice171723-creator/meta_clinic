module Clinic
  module Telehealth
    module StartEncounter
      module_function

      def call(visit:, actor:, request_key:, expected_version:)
        AccessPolicy.authorize!(actor_context: { actor: actor, practice: visit.practice }, visit: visit, action: :read)
        Clinic::Authorization.authorize!(actor: actor, practice: visit.practice, action: "encounters.write",
          site: visit.appointment.site)
        outcome = Clinic::Idempotency.execute(practice: visit.practice, actor: actor,
          operation_code: "telehealth.start_encounter", request_key: request_key, resource: visit,
          authorization_action: "encounters.write", payload: { visit_id: visit.id, expected_version: expected_version },
          authorization: -> {
            AccessPolicy.authorize!(actor_context: { actor: actor, practice: visit.practice }, visit: visit, action: :read)
            Clinic::Authorization.authorize!(actor: actor, practice: visit.practice, action: "encounters.write",
              site: visit.appointment.site)
          }, result_resource: ->(encounter) { encounter },
          resource_resolver: ->(practice:, receipt:) { practice.encounters.find_by(id: receipt.resource_id) }) do
          visit.appointment.with_lock do
            visit.lock!
            stale!(visit, expected_version)
            raise Error.new("This video visit cannot start an encounter.", code: "visit_not_startable", status: :conflict) unless visit.scheduled?
            encounter = Clinic::Scheduling::CreateEncounter.call(practice: visit.practice, actor: actor, patient: visit.patient,
              appointment: visit.appointment, started_at: Current.business_time)
            visit.update!(encounter_id: encounter.id)
            encounter
          end
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def stale!(visit, expected_version)
        raise ActiveRecord::StaleObjectError.new(visit, "update") unless visit.lock_version == expected_version.to_i
      end
    end
  end
end
