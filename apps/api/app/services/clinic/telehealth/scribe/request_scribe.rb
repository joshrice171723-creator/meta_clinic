module Clinic
  module Telehealth
    module Scribe
      module RequestScribe
        module_function

        def call(visit:, actor:, request_key:, expected_version:)
          Support.authorize_host!(visit:, actor:)
          Support.authorize_staff!(visit:, actor:, action: "scribe.write")
          payload = { visit_id: visit.id, expected_version: Integer(expected_version, exception: false) }
          outcome = Clinic::Idempotency.execute(practice: visit.practice, actor:,
            operation_code: "telehealth.scribe.request", request_key:, payload:, resource: visit,
            authorization_action: "telehealth.scribe.request",
            result_resource: ->(value) { value },
            resource_resolver: ->(practice:, receipt:) {
              Clinic::Telehealth::Visit.find_by(practice_id: practice.id, id: receipt.resource_id)
            }) do
            visit.lock!
            Support.verify_expected_version!(visit, expected_version)
            BindScribeEncounter.call(visit:, actor:)
            SyncScribeConsent.call(visit:, actor:)
            Support.record_audit!(visit:, actor:, action: "requested")
            visit.reload
          end
          outcome.value || visit.reload
        end
      end
    end
  end
end
