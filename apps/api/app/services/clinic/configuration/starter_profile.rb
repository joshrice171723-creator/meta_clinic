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

      VISIT_SERVICES = {
        "psychiatric_evaluation" => "psychiatric_evaluation",
        "adhd_evaluation" => "adhd_evaluation",
        "medication_follow_up" => "medication_management",
        "refill_review" => "medication_management",
        "therapy_referral_coordination" => "therapy_referral_coordination",
        "individual_therapy" => "individual_therapy",
        "urgent_clinical_follow_up" => "urgent_clinical_follow_up"
      }.freeze

      def self.apply(practice:, clinic_type:, service_scope: [], previous:)
        recipe = PRESETS[clinic_type]
        return {} unless recipe
        return previous if previous.present? && previous["id"] != recipe.fetch("id")

        selected_visits = recipe.fetch("visits").reject do |key, _definition|
          VISIT_SERVICES.key?(key) && !service_scope.include?(VISIT_SERVICES.fetch(key))
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
        ready?(site, features) && features[:service_scope].include?(service) &&
          PracticeFeatures::SERVICE_OPTIONS_BY_SPECIALTY.fetch(features[:clinic_type], []).include?(service)
      end


      def self.ready?(site, features)
        site && site.status == "active" && features[:site_specialty_configured] && features[:finalized]
      end

      # Saved preset identities, including retired versions, distinguish specialty
      # visit types from shared custom types without guessing from editable names.
      # ponytail: scans profile history; index preset identities if revision volume makes this hot.
      def self.available_visit_type_ids(practice:, site:, features: nil, at: Current.business_time, require_ready: true)
        return PracticeFeatures.snapshot(practice:, site:, at:).fetch(:available_visit_type_ids) unless features
        return [] unless site && features[:site_specialty_configured]
        return [] if require_ready && !ready?(site, features)

        owners = Hash.new { |values, id| values[id] = [] }
        PracticeFeatureVersion.for_practice(practice).where(effective_from: ..at)
          .pluck(:optional_features).each do |saved|
            saved.fetch("starter_profile", {}).fetch("visits", {}).each do |key, visit|
              next unless visit["visit_type_id"]
              owners[visit["visit_type_id"].to_i] << [saved["clinic_type"], VISIT_SERVICES[key]]
            end
          end
        practice.visit_types.active.pluck(:id).select do |id|
          owners[id].empty? || owners[id].any? do |specialty, service|
            specialty == features[:clinic_type] &&
              (service.nil? || features[:service_scope].include?(service))
          end
        end
      end

      def self.visit_available?(practice:, site:, visit_type:)
        return false unless site && visit_type && site.practice_id == practice.id && visit_type.practice_id == practice.id

        PracticeFeatures.snapshot(practice:, site:)[:available_visit_type_ids].include?(visit_type.id)
      end

      def self.require_visit!(practice:, site:, visit_type:)
        return if visit_available?(practice:, site:, visit_type:)

        raise ArgumentError, "This visit type is not available at this location. Complete location setup and choose an enabled service."
      end

      def self.require_service!(practice:, service:, site: nil)
        return if service_available?(practice:, service:, site:)
        raise ArgumentError, "This service is not available for new work. Ask the clinic configuration team; existing work and unrelated care remain available."
      end
    end
  end
end
