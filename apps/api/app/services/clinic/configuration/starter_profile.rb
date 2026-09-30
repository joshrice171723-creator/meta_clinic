module Clinic
  module Configuration
    # Code-owned recipes compose existing domain records; they never select care.
    class StarterProfile
      PRESETS = {
        "behavioral_health" => {
          "id" => "behavioral-health", "version" => 3, "components" => [],
          "visits" => {
            "initial" => { "name" => "Behavioral health initial visit", "form_id" => "behavioral-health-initial-v1" },
            "follow_up" => { "name" => "Behavioral health follow-up", "form_id" => "behavioral-health-follow-up-v1" },
            "psychiatric_evaluation" => { "name" => "Psychiatric evaluation", "form_id" => "behavioral-health-initial-v1" },
            "adhd_evaluation" => { "name" => "ADHD evaluation", "form_id" => "behavioral-health-initial-v1" },
            "medication_follow_up" => { "name" => "Medication follow-up", "form_id" => "behavioral-health-follow-up-v1" },
            "refill_review" => { "name" => "Refill review", "form_id" => "behavioral-health-follow-up-v1" },
            "therapy_referral_coordination" => { "name" => "Therapy/referral coordination", "form_id" => "behavioral-health-follow-up-v1" },
            "individual_therapy" => { "name" => "Individual therapy", "form_id" => "behavioral-health-follow-up-v1" },
            "urgent_clinical_follow_up" => { "name" => "Urgent clinical follow-up", "form_id" => "behavioral-health-follow-up-v1" }
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

      def self.apply(practice:, clinic_type:, service_scope: [], previous:)
        recipe = PRESETS[clinic_type]
        return {} unless recipe
        return previous if previous.present? && previous["id"] != recipe.fetch("id")

        selected_visits = recipe.fetch("visits").reject do |key, _definition|
          key == "individual_therapy" && !service_scope.include?("individual_therapy")
        end
        visits = selected_visits.each_with_object({}) do |(key, definition), result|
          linked = (previous || {}).fetch("visits", {})[key]
          visit = if linked&.key?("visit_type_id")
            practice.visit_types.find_by(id: linked.fetch("visit_type_id")) ||
              raise(ArgumentError, "The linked starter visit is unavailable. Review the saved profile before applying it again.")
          else
            practice.visit_types.active.find_by(code: definition.fetch("name")) ||
              practice.visit_types.create!(code: definition.fetch("name"))
          end
          # Linked identity survives rename/retirement; replay never reactivates it.
          result[key] = definition.merge(linked || {}).merge("name" => visit.code, "visit_type_id" => visit.id)
        end
        recipe.except("visits").merge(previous || {}).merge(
          "version" => recipe.fetch("version"),
          "visits" => (previous || {}).fetch("visits", {}).merge(visits)
        )
      end

      def self.form_id(practice:, appointment: nil)
        setup = PracticeFeatures.snapshot(practice:, site: appointment&.site).fetch(:starter_profile)
        visits = setup.fetch("visits", {})
        definition = visits.values.find { |visit| visit["visit_type_id"] == appointment&.visit_type_id }
        definition&.fetch("form_id", nil) || Care::PrevisitIntake::FORM_ID
      end

      def self.service_available?(practice:, service:, site: nil)
        features = PracticeFeatures.snapshot(practice:, site:)
        !features[:finalized] || features[:service_scope].include?(service)
      end

      def self.require_service!(practice:, service:, site: nil)
        return if service_available?(practice:, service:, site:)
        raise ArgumentError, "This service is not available for new work. Ask the clinic configuration team; existing work and unrelated care remain available."
      end
    end
  end
end
