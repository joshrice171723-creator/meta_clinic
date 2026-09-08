module Clinic
  module Telehealth
    module Scribe
      module ReleaseScribeCapture
        module_function

        def call(visit:, actor:, request_key:, expected_version:, capture_epoch:, owner_token:)
          outcome = Clinic::Idempotency.execute(practice: visit.practice, actor:,
            operation_code: "telehealth.scribe.release", request_key:,
            payload: { visit_id: visit.id, expected_version: Integer(expected_version, exception: false),
              capture_epoch: Integer(capture_epoch, exception: false) }, resource: visit,
            authorization_action: "telehealth.scribe.release",
            result_resource: ->(value) { value },
            resource_resolver: ->(practice:, receipt:) {
              Clinic::Telehealth::Visit.find_by(practice_id: practice.id, id: receipt.resource_id)
            }) do
            visit.lock!
            Support.verify_expected_version!(visit, expected_version)
            ValidateCaptureEpoch.call(visit:, actor:, capture_epoch:, owner_token:)
            visit.update!(Support.clear_capture_attributes)
            Support.record_audit!(visit:, actor:, action: "capture_released")
            visit
          end
          outcome.value || visit.reload
        end
      end
    end
  end
end
