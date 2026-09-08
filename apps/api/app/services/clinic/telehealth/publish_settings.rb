module Clinic
  module Telehealth
    module PublishSettings
      module_function

      def call(practice:, actor:, request_key:, expected_version:, draft_version:)
        membership = Clinic::Authorization.authorize!(actor: actor, practice: practice, action: "telehealth.configure", any_site: true)
        setting = Setting.find_by!(practice_id: practice.id)
        outcome = Clinic::Idempotency.execute(practice: practice, actor: actor, operation_code: "telehealth.settings.publish",
          request_key: request_key, resource: setting, authorization_action: "telehealth.configure",
          authorization: -> {
            Clinic::Authorization.authorize!(actor: actor, practice: practice, action: "telehealth.configure", any_site: true)
          },
          payload: { expected_version: expected_version, draft_version: draft_version }, result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { PolicyVersion.find_by(practice_id: practice.id, id: receipt.resource_id) }) do
          setting.with_lock do
            raise ActiveRecord::StaleObjectError.new(setting, "update") unless setting.lock_version == expected_version.to_i
            policy = setting.policy_versions.lock.find_by!(version: draft_version, status: "draft")
            policy.update!(status: "published", published_by_membership_id: membership.id, published_at: Time.current)
            prior = setting.active_policy_version
            prior.update!(status: "retired", retired_at: Time.current) if prior && prior.id != policy.id
            setting.update!(active_policy_version_id: policy.id, updated_by_membership_id: membership.id)
            policy
          end
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end
    end
  end
end
