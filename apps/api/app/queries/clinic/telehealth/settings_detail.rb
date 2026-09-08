module Clinic
  module Telehealth
    module SettingsDetail
      module_function

      def call(practice:, actor:)
        Clinic::Authorization.authorize!(actor: actor, practice: practice, action: "telehealth.configure", any_site: true)
        setting = Setting.where(practice_id: practice.id).includes(:active_policy_version, :policy_versions, :practice).first
        rules = VisitTypeRule.where(practice_id: practice.id).includes(:visit_type).order(:visit_type_id, :site_id)
        { practice: practice, setting: setting,
          draft: setting&.policy_versions&.select(&:draft?)&.max_by(&:version), rules: rules }
      end
    end
  end
end
