module Clinic
  class DeploymentAccess
    def self.available_to?(user)
      return true unless Rails.env.production?
      return true if Staging::DemoClinic.available_to?(user)

      !!(user&.active? && user.clinic_memberships.active.any? { |membership| practice_enabled?(membership.practice_id) })
    end

    def self.practice_enabled?(practice_id)
      return true unless Rails.env.production?
      return true if GuidedDemoAccess.hosted? && Development::DemoLesson.exists?(practice_id:)
      return true if enabled_practice_ids.include?(practice_id.to_i)

      DemoContent.enabled? && Clinic::Practice.where(id: practice_id, platform_managed: true).exists?
    end

    def self.enabled_practice_ids
      ENV.fetch("APP_CLINIC_PILOT_PRACTICE_IDS", "").split(",")
        .filter_map { |value| Integer(value.strip, exception: false) }.select(&:positive?).uniq.freeze
    end
  end
end
