require "json"

module Clinic
  module Telehealth
    module PatientIdempotency
      Outcome = Data.define(:receipt, :value, :replayed)
      module_function

      def execute(identity:, visit:, operation_code:, request_key:, payload:, result_kind:)
        validate_context!(identity, visit)
        key = request_key.to_s
        unless key.match?(Clinic::Idempotency::KEY_PATTERN)
          raise Error.new("A valid request key is required.", code: "invalid_request_key", status: :bad_request, field: "request_key")
        end
        canonical = Clinic::Idempotency.send(:canonical_payload, payload)
        key_id = Clinic::Idempotency.send(:active_digest_key_id)
        digest = Clinic::Idempotency.send(:digest_for_canonical, canonical, Clinic::Idempotency::DIGEST_ALGORITHM, key_id: key_id)
        ApplicationRecord.transaction do
          ApplicationRecord.connection.execute(
            ApplicationRecord.sanitize_sql_array([ "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", "telehealth:#{identity.id}:#{key}" ])
          )
          locked_identity = Clinic::PatientPortal::Identity.available.lock.find_by(id: identity.id, practice_id: visit.practice_id,
            patient_id: visit.patient_id)
          raise Clinic::Authorization::Denied unless locked_identity
          receipt = PatientReceipt.find_by(practice_id: visit.practice_id, portal_identity_id: identity.id, request_key: key)
          if receipt
            same = receipt.visit_id == visit.id && receipt.operation_code == operation_code && receipt.payload_digest == digest
            raise Clinic::Idempotency::Conflict unless same
            return Outcome.new(receipt: receipt, value: resolve_result(receipt, visit), replayed: true)
          end
          value = yield
          receipt = PatientReceipt.create!(practice_id: visit.practice_id, portal_identity_id: identity.id, visit_id: visit.id,
            request_key: key, operation_code: operation_code, payload_digest: digest, digest_key_id: key_id,
            digest_algorithm: "HMAC-SHA256", outcome: "committed", result_kind: result_kind,
            result_id: value.respond_to?(:id) ? value.id : visit.id,
            result_version: value.respond_to?(:lock_version) ? value.lock_version : visit.lock_version)
          Outcome.new(receipt: receipt, value: value, replayed: false)
        end
      end

      def validate_context!(identity, visit)
        valid = identity&.active? && identity.practice_id == visit.practice_id && identity.patient_id == visit.patient_id
        raise Clinic::Authorization::Denied unless valid
      end

      def resolve_result(receipt, visit)
        case receipt.result_kind
        when "checkin" then visit.checkins.find(receipt.result_id)
        when "consent" then visit.consents.find(receipt.result_id)
        when "participant" then visit.participants.find(receipt.result_id)
        when "visit" then visit.reload
        end
      end
    end
  end
end
