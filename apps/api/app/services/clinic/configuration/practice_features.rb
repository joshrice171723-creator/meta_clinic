require "digest"

module Clinic
  module Configuration
    class PracticeFeatures
      CORE_FEATURES = %w[
        patients scheduling encounters clinical_chart cash_pricing estimates invoices receipts
        card_payments refunds credits packages memberships
      ].freeze
      CLINIC_TYPES = %w[
        primary_care membership_primary_care urgent_care specialty_outpatient
        behavioral_health custom_ambulatory weight_loss
      ].freeze
      SERVICE_SCOPE = %w[
        telehealth external_lab_coordination minor_office_procedures in_office_medications
        vaccinations point_of_care_testing infusions controlled_medications patient_supplied_medications
        prescription_preparation take_home_fulfillment
        psychiatric_evaluation adhd_evaluation medication_management therapy_referral_coordination
        urgent_clinical_follow_up
      ].freeze
      ASSESSMENT_SCOPE = %w[
        depression anxiety alcohol_use tobacco_use social_needs fall_risk
        functional_status cognitive_status psychiatry_assessment
      ].freeze
      RECOMMENDED_CLINIC_TYPE = "primary_care".freeze
      RECOMMENDED_SERVICE_SCOPE = %w[
        telehealth external_lab_coordination minor_office_procedures in_office_medications
      ].freeze
      RECOMMENDED_ASSESSMENT_SCOPE = [].freeze
      OPTIONAL_DEFAULTS = {
        "insurance_workflows" => false,
        "clinic_type" => nil,
        "service_scope" => [],
        "assessment_scope" => []
      }.freeze

      def self.snapshot(practice:, at: Current.business_time)
        version = Clinic::PracticeFeatureVersion.for_practice(practice)
          .where(effective_from: ..at).order(revision: :desc, id: :desc).first
        stored = version&.optional_features || {}
        optional = OPTIONAL_DEFAULTS.merge(stored)
        optional["clinic_type"] = nil unless CLINIC_TYPES.include?(optional["clinic_type"])
        optional["service_scope"] = Array(optional["service_scope"]).select { |code| SERVICE_SCOPE.include?(code) }
        optional["assessment_scope"] = Array(optional["assessment_scope"])
          .select { |code| ASSESSMENT_SCOPE.include?(code) }
        {
          core: CORE_FEATURES.index_with(true), optional: optional,
          insurance_workflows_enabled: optional.fetch("insurance_workflows", false),
          clinic_type: optional["clinic_type"], service_scope: optional.fetch("service_scope"),
          assessment_scope: optional.fetch("assessment_scope"),
          immunization_administration_enabled: stored["immunization_administration_enabled"] == true &&
            optional.fetch("service_scope").include?("vaccinations"),
          assessment_configured: stored.key?("assessment_scope"),
          starter_profile: stored.fetch("starter_profile", {}),
          finalized: stored["finalized_at"].present?, finalized_at: stored["finalized_at"],
          selected_services: stored.fetch("selected_services", optional.fetch("service_scope")),
          change_handoff: "Clinic staff can change availability, hours, prices and forms within this profile. Capability changes require Meta Clinic review; unsupported transitions require a scoped FDE assignment. No request has been sent.",
          configured: version.present? && stored.key?("clinic_type") && stored.key?("service_scope"),
          recommended_clinic_type: RECOMMENDED_CLINIC_TYPE,
          recommended_service_scope: RECOMMENDED_SERVICE_SCOPE,
          recommended_assessment_scope: RECOMMENDED_ASSESSMENT_SCOPE,
          revision: version&.revision || 0, effective_from: version&.effective_from&.iso8601
        }
      end

      def self.revise(practice:, actor:, request_key:, expected_revision:, insurance_workflows_enabled:,
        clinic_type:, service_scope:, assessment_scope:, finalize: false)
        Clinic::Authorization.authorize!(practice: practice, actor: actor.user, action: "facilities.write")
        key = request_key.to_s.strip
        raise ArgumentError, "request_key is required" if key.blank?

        normalized_type = clinic_type.to_s.strip
        raise ArgumentError, "clinic_type is not supported" unless CLINIC_TYPES.include?(normalized_type)

        normalized_scope = Array(service_scope).map { |code| code.to_s.strip }.uniq
        unsupported = normalized_scope - SERVICE_SCOPE
        raise ArgumentError, "service_scope includes unsupported services: #{unsupported.join(', ')}" if unsupported.any?

        normalized_assessments = Array(assessment_scope).map { |code| code.to_s.strip }.uniq
        unsupported_assessments = normalized_assessments - ASSESSMENT_SCOPE
        if unsupported_assessments.any?
          raise ArgumentError,
            "assessment_scope includes unsupported assessments: #{unsupported_assessments.join(', ')}"
        end

        optional = {
          "insurance_workflows" => ActiveModel::Type::Boolean.new.cast(insurance_workflows_enabled),
          "clinic_type" => normalized_type,
          "service_scope" => SERVICE_SCOPE.select { |code| normalized_scope.include?(code) },
          "assessment_scope" => ASSESSMENT_SCOPE.select { |code| normalized_assessments.include?(code) }
        }
        digest = Digest::SHA256.hexdigest([optional, finalize == true].to_json)
        practice.with_lock do
          existing = Clinic::PracticeFeatureVersion.find_by(practice: practice, request_key: key)
          if existing
            raise Clinic::Idempotency::Conflict unless existing.content_digest == digest
            return snapshot(practice: practice)
          end

          current = snapshot(practice: practice)
          unless current.fetch(:revision) == expected_revision.to_i
            raise ActiveRecord::StaleObjectError.new(practice, "update practice features")
          end

          if current[:finalized] && (normalized_type != current[:clinic_type] ||
            optional["insurance_workflows"] != current[:insurance_workflows_enabled] ||
            (normalized_scope - current[:selected_services]).any?)
            raise ArgumentError, "Protected profile change: request Meta Clinic review. Unsupported transitions require an FDE assignment. Existing care and permitted clinic settings remain available."
          end
          old = current[:optional]
          if old["starter_profile"].present? && normalized_type != current[:clinic_type]
            raise ArgumentError, "This starter profile already has linked records. Request a scoped Meta Clinic review to change the specialty."
          end
          optional["starter_profile"] = StarterProfile.apply(practice: practice, clinic_type: normalized_type,
            previous: old["starter_profile"])
          optional["selected_services"] = current[:finalized] ? current[:selected_services] : normalized_scope
          optional["finalized_at"] = old["finalized_at"]
          optional["finalized_by_membership_id"] = old["finalized_by_membership_id"]
          if finalize == true && !current[:finalized]
            raise ArgumentError, "Choose an active location before finalizing setup." unless practice.sites.where(status: "active").exists?
            raise ArgumentError, "Configure an active visit type before finalizing setup." unless practice.visit_types.active.exists?
            optional["finalized_at"] = Current.business_time.iso8601(6)
            optional["finalized_by_membership_id"] = actor.id
          end

          Clinic::PracticeFeatureVersion.create!(
            practice: practice, created_by_membership: actor, revision: current.fetch(:revision) + 1,
            optional_features: optional, effective_from: Current.business_time,
            request_key: key, content_digest: digest
          )
        end
        snapshot(practice: practice)
      end
    end
  end
end
