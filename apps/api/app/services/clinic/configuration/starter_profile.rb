module Clinic
  module Configuration
    # Code-owned recipes compose existing domain records; they never select care.
    class StarterProfile
      PRESETS = {
        "behavioral_health" => {
          "id" => "behavioral-health", "version" => 1, "components" => [],
          "visits" => {
            "initial" => { "name" => "Behavioral health initial visit", "form_id" => "behavioral-health-initial-v1" },
            "follow_up" => { "name" => "Behavioral health follow-up", "form_id" => "behavioral-health-follow-up-v1" }
          }
        },
        "weight_loss" => {
          "id" => "weight-management", "version" => 1,
          "components" => %w[weight_context],
          "visits" => {
            "initial" => { "name" => "Weight-loss initial visit", "form_id" => "weight-management-initial-v1" },
            "follow_up" => { "name" => "Weight-loss follow-up", "form_id" => "weight-management-follow-up-v1" }
          }
        }
      }.freeze

      def self.apply(practice:, clinic_type:, previous:)
        recipe = PRESETS[clinic_type]
        return previous if previous.present?
        return {} unless recipe

        visits = recipe.fetch("visits").transform_values do |definition|
          visit = if clinic_type == "behavioral_health"
            practice.visit_types.active.find_by(code: definition.fetch("name")) || practice.visit_types.create!(code: definition.fetch("name"))
          else
            practice.visit_types.create!(code: definition.fetch("name"))
          end
          definition.merge("visit_type_id" => visit.id)
        end
        recipe.except("visits").merge("visits" => visits)
      end

      def self.form_id(practice:, appointment: nil)
        setup = PracticeFeatures.snapshot(practice:).fetch(:starter_profile)
        visits = setup.fetch("visits", {})
        definition = visits.values.find { |visit| visit["visit_type_id"] == appointment&.visit_type_id }
        definition&.fetch("form_id", nil) || Care::PrevisitIntake::FORM_ID
      end

      def self.service_available?(practice:, service:)
        features = PracticeFeatures.snapshot(practice:)
        !features[:finalized] || features[:service_scope].include?(service)
      end

      def self.require_service!(practice:, service:)
        return if service_available?(practice:, service:)
        raise ArgumentError, "This service is not available for new work. Ask the clinic configuration team; existing work and unrelated care remain available."
      end
    end
  end
end
