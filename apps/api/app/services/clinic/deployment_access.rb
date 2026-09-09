module Clinic
  class DeploymentAccess
    def self.available_to?(user)
      return true unless Rails.env.production?
      return true if Staging::DemoClinic.available_to?(user)

      membership = user&.clinic_membership
      membership&.active? && user.active? && enabled_practice_ids.include?(membership.practice_id)
    end

    def self.practice_enabled?(practice_id)
      !Rails.env.production? || enabled_practice_ids.include?(practice_id.to_i)
    end

    def self.enabled_practice_ids
      ENV.fetch("APP_CLINIC_PILOT_PRACTICE_IDS", "").split(",")
        .filter_map { |value| Integer(value.strip, exception: false) }.select(&:positive?).uniq.freeze
    end
  end
end
