module Clinic
  module Telehealth
    module Scribe
      module RenewScribeCapture
        module_function

        def call(visit:, actor:, request_key:, expected_version:, capture_epoch:, owner_token:)
          Clinic::Idempotency.execute(practice: visit.practice, actor:,
            operation_code: "telehealth.scribe.renew", request_key:,
            payload: { visit_id: visit.id, expected_version: Integer(expected_version, exception: false),
              capture_epoch: Integer(capture_epoch, exception: false) }, resource: visit,
            authorization_action: "telehealth.scribe.renew",
            result_resource: ->(value) { value },
            resource_resolver: ->(practice:, receipt:) {
              Clinic::Telehealth::Visit.find_by(practice_id: practice.id, id: receipt.resource_id)
            }) do
            visit.lock!
            Support.verify_expected_version!(visit, expected_version)
            ValidateCaptureEpoch.call(visit:, actor:, capture_epoch:, owner_token:)
            visit.update!(scribe_capture_lease_expires_at: Time.current + Support::LEASE_DURATION)
            visit
          end.value || visit.reload
        end
      end
    end
  end
end
