module Clinic
  module Telehealth
    module DisableNewVisits
      module_function

      def call(practice:, actor:, request_key:, expected_version:)
        membership = Clinic::Authorization.authorize!(actor: actor, practice: practice, action: "telehealth.configure", any_site: true)
        setting = Setting.find_by!(practice_id: practice.id)
        outcome = Clinic::Idempotency.execute(practice: practice, actor: actor, operation_code: "telehealth.settings.disable",
          request_key: request_key, resource: setting, authorization_action: "telehealth.configure",
          authorization: -> {
            Clinic::Authorization.authorize!(actor: actor, practice: practice, action: "telehealth.configure", any_site: true)
          },
          payload: { expected_version: expected_version }, result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { Setting.find_by(practice_id: practice.id, id: receipt.resource_id) }) do
          setting.with_lock do
            raise ActiveRecord::StaleObjectError.new(setting, "update") unless setting.lock_version == expected_version.to_i
            setting.update!(enabled: false, updated_by_membership_id: membership.id)
            setting
          end
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end
    end
  end
end
