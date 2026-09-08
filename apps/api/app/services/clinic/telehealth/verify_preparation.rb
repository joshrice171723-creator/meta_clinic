module Clinic
  module Telehealth
    module VerifyPreparation
      module_function

      def call(visit:, actor:, request_key:, checkin_id:, expected_version:)
        authorize = -> {
          AccessPolicy.authorize!(actor_context: { actor: actor, practice: visit.practice }, visit: visit,
            action: :verify_preparation)
        }
        authorize.call
        outcome = Clinic::Idempotency.execute(practice: visit.practice, actor: actor,
          operation_code: "telehealth.verify_preparation", request_key: request_key, resource: visit,
          authorization_action: "telehealth.prepare.verify", authorization: authorize,
          payload: { visit_id: visit.id, checkin_id: checkin_id.to_i, expected_version: expected_version },
          result_resource: ->(checkin) { checkin },
          resource_resolver: ->(practice:, receipt:) {
            Checkin.find_by(practice_id: practice.id, id: receipt.resource_id)
          }) do
          visit.with_lock do
            raise ActiveRecord::StaleObjectError.new(visit, "update") unless visit.lock_version == expected_version.to_i
            current = CurrentPreparation.call(visit: visit)
            unless current[:checkin]&.id == checkin_id.to_i && current[:reasons].empty?
              raise Error.new("The current preparation is incomplete or changed.", code: "preparation_incomplete")
            end
            Clinic::AuditRecorder.record!(practice: visit.practice, actor: actor,
              action_code: "telehealth.preparation.verify", outcome: :committed,
              resource_version_ref: "telehealth-checkin:#{current[:checkin].id}")
            visit.touch
            current[:checkin]
          end
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end
    end
  end
end
