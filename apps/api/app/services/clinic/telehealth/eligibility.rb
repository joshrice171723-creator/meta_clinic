module Clinic
  module Telehealth
    module Eligibility
      Result = Data.define(:eligible, :code, :rule)
      module_function

      def call(context:, appointment:, policy: nil, region_code: nil)
        setting = Clinic::Telehealth::Setting.find_by(practice_id: appointment.practice_id)
        return Result.new(eligible: false, code: "telehealth_disabled", rule: nil) unless Config.globally_enabled? && setting&.enabled?
        return Result.new(eligible: false, code: "provider_unconfigured", rule: nil) unless Config.configured_for?(setting)
        return Result.new(eligible: false, code: "policy_unavailable", rule: nil) unless policy || setting.active_policy_version&.published?
        return Result.new(eligible: false, code: "clinician_required", rule: nil) unless appointment.booked_clinician_id
        return Result.new(eligible: false, code: "visit_type_required", rule: nil) unless appointment.visit_type_id

        rules = Clinic::Telehealth::VisitTypeRule.where(practice_id: appointment.practice_id, visit_type_id: appointment.visit_type_id)
        rule = rules.find_by(site_id: appointment.site_id) || rules.find_by(site_id: nil)
        return Result.new(eligible: false, code: "visit_type_ineligible", rule: rule) unless rule&.enabled?
        allowed_regions = Array(rule.allowed_region_codes).map { |value| value.to_s.upcase }
        return Result.new(eligible: false, code: "region_unconfigured", rule: rule) if allowed_regions.empty?
        if region_code.present? && !allowed_regions.include?(region_code.to_s.upcase)
          return Result.new(eligible: false, code: "region_ineligible", rule: rule)
        end
        demographics = appointment.patient.demographics
        if rule.min_patient_age_years || rule.max_patient_age_years
          return Result.new(eligible: false, code: "date_of_birth_required", rule: rule) unless demographics&.date_of_birth
          age = context.fetch(:business_date, Current.business_date).year - demographics.date_of_birth.year
          age -= 1 if context.fetch(:business_date, Current.business_date) < demographics.date_of_birth.advance(years: age)
          return Result.new(eligible: false, code: "age_ineligible", rule: rule) if rule.min_patient_age_years && age < rule.min_patient_age_years
          return Result.new(eligible: false, code: "age_ineligible", rule: rule) if rule.max_patient_age_years && age > rule.max_patient_age_years
        end
        Result.new(eligible: true, code: "eligible", rule: rule)
      end
    end
  end
end
