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
        psychiatric_evaluation adhd_evaluation medication_management therapy_referral_coordination individual_therapy
        urgent_clinical_follow_up
      ].freeze
      ASSESSMENT_SCOPE = %w[
        depression anxiety alcohol_use tobacco_use social_needs fall_risk
        functional_status cognitive_status psychiatry_assessment
      ].freeze
      BEHAVIORAL_HEALTH_SERVICES = %w[psychiatric_evaluation adhd_evaluation individual_therapy].freeze
      SERVICE_OPTIONS_BY_SPECIALTY = CLINIC_TYPES.index_with do |specialty|
        specialty == "behavioral_health" ? SERVICE_SCOPE : SERVICE_SCOPE - BEHAVIORAL_HEALTH_SERVICES
      end.freeze
      ASSESSMENT_OPTIONS_BY_SPECIALTY = CLINIC_TYPES.index_with do |specialty|
        specialty == "behavioral_health" ? ASSESSMENT_SCOPE : ASSESSMENT_SCOPE - %w[psychiatry_assessment]
      end.freeze
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

      def self.snapshot(practice:, site: nil, at: Current.business_time)
        raise ArgumentError, "The location must belong to this clinic." if site && site.practice_id != practice.id

        clinic_version = Clinic::PracticeFeatureVersion.for_practice(practice).where(site_id: nil)
          .where(effective_from: ..at).order(revision: :desc, id: :desc).first
        site_version = if site
          Clinic::PracticeFeatureVersion.for_practice(practice).where(site:)
            .where(effective_from: ..at).order(revision: :desc, id: :desc).first
        end
        version = site ? site_version : clinic_version
        stored = version&.optional_features || {}
        optional = OPTIONAL_DEFAULTS.merge(stored)
        optional["clinic_type"] = nil unless CLINIC_TYPES.include?(optional["clinic_type"])
        optional["service_scope"] = Array(optional["service_scope"]).select { |code| SERVICE_SCOPE.include?(code) }
        optional["assessment_scope"] = Array(optional["assessment_scope"])
          .select { |code| ASSESSMENT_SCOPE.include?(code) }
        site_specialty_configured = site_version.present? && CLINIC_TYPES.include?(site_version.optional_features["clinic_type"])
        configured = if site
          site_specialty_configured
        else
          version.present? && stored.key?("clinic_type") && stored.key?("service_scope")
        end
        features = {
          core: CORE_FEATURES.index_with(true), optional: optional,
          insurance_workflows_enabled: optional.fetch("insurance_workflows", false),
          clinic_type: optional["clinic_type"], service_scope: optional.fetch("service_scope"),
          assessment_scope: optional.fetch("assessment_scope"),
          immunization_administration_enabled: stored["immunization_administration_enabled"] == true &&
            optional.fetch("service_scope").include?("vaccinations"),
          assessment_configured: stored.key?("assessment_scope"),
          starter_profile: stored.fetch("starter_profile", {}),
          finalized: site ? site_version&.optional_features&.dig("finalized_at").present? : stored["finalized_at"].present?,
          finalized_at: site ? site_version&.optional_features&.dig("finalized_at") : stored["finalized_at"],
          selected_services: stored.fetch("selected_services", optional.fetch("service_scope")),
          site_id: site&.id,
          profile_scope: site ? (site_version ? "site" : "unconfigured") : "clinic_default",
          site_specialty_configured: site_specialty_configured,
          site_revision: site_version&.revision || 0,
          change_handoff: "Clinic staff can change availability, hours, prices and forms within this profile. Capability changes require Meta Clinic review; unsupported transitions require a scoped FDE assignment. No request has been sent.",
          configured: configured,
          service_options_by_specialty: SERVICE_OPTIONS_BY_SPECIALTY,
          assessment_options_by_specialty: ASSESSMENT_OPTIONS_BY_SPECIALTY,
          recommended_clinic_type: RECOMMENDED_CLINIC_TYPE,
          recommended_service_scope: RECOMMENDED_SERVICE_SCOPE,
          recommended_assessment_scope: RECOMMENDED_ASSESSMENT_SCOPE,
          revision: site ? (site_version&.revision || 0) : (clinic_version&.revision || 0),
          effective_from: version&.effective_from&.iso8601
        }
        features[:compatible_visit_type_ids] = StarterProfile.available_visit_type_ids(practice:, site:, features:, at:, require_ready: false)
        features[:available_visit_type_ids] = StarterProfile.ready?(site, features) ? features[:compatible_visit_type_ids] : []
        features
      end

      def self.revise(practice:, actor:, request_key:, expected_revision:, insurance_workflows_enabled:,
        site: nil,
        clinic_type:, service_scope:, assessment_scope:, finalize: false, expected_impact_digest: nil)
        raise ArgumentError, "The location must belong to this clinic." if site && site.practice_id != practice.id
        Clinic::Authorization.authorize!(practice: practice, actor: actor.user,
          action: "facilities.write", site: site)
        key = request_key.to_s.strip
        raise ArgumentError, "request_key is required" if key.blank?

        normalized_type = clinic_type.to_s.strip
        raise ArgumentError, "clinic_type is not supported" unless CLINIC_TYPES.include?(normalized_type)

        normalized_scope = Array(service_scope).map { |code| code.to_s.strip }.uniq
        unsupported = normalized_scope - SERVICE_SCOPE
        raise ArgumentError, "service_scope includes unsupported services: #{unsupported.join(', ')}" if unsupported.any?
        incompatible = normalized_scope - SERVICE_OPTIONS_BY_SPECIALTY.fetch(normalized_type)
        if incompatible.any?
          raise ArgumentError, "These services require a behavioral-health location: #{incompatible.join(', ')}."
        end

        normalized_assessments = Array(assessment_scope).map { |code| code.to_s.strip }.uniq
        unsupported_assessments = normalized_assessments - ASSESSMENT_SCOPE
        if unsupported_assessments.any?
          raise ArgumentError,
            "assessment_scope includes unsupported assessments: #{unsupported_assessments.join(', ')}"
        end

        if (normalized_assessments - ASSESSMENT_OPTIONS_BY_SPECIALTY.fetch(normalized_type)).any?
          raise ArgumentError, "Psychiatry assessments require a behavioral-health location."
        end

        optional = {
          "insurance_workflows" => ActiveModel::Type::Boolean.new.cast(insurance_workflows_enabled),
          "clinic_type" => normalized_type,
          "service_scope" => SERVICE_SCOPE.select { |code| normalized_scope.include?(code) },
          "assessment_scope" => ASSESSMENT_SCOPE.select { |code| normalized_assessments.include?(code) }
        }
        digest_input = [ optional, finalize == true ]
        digest_input << expected_impact_digest if expected_impact_digest.present?
        digest = Digest::SHA256.hexdigest(digest_input.to_json)
        practice.with_lock do
          site&.lock!
          existing = Clinic::PracticeFeatureVersion.find_by(practice: practice, site:, request_key: key)
          if existing
            raise Clinic::Idempotency::Conflict unless existing.content_digest == digest
            return snapshot(practice: practice, site:)
          end

          current = snapshot(practice: practice, site:)
          unless current.fetch(:revision) == expected_revision.to_i
            raise ActiveRecord::StaleObjectError.new(practice, "update practice features")
          end

          if current[:finalized] && (normalized_type != current[:clinic_type] ||
            optional["insurance_workflows"] != current[:insurance_workflows_enabled] ||
            (normalized_scope - current[:selected_services]).any?)
            raise ArgumentError, "Protected profile change: request Meta Clinic review. Unsupported transitions require an FDE assignment. Existing care and permitted clinic settings remain available."
          end
          if (current[:finalized] && (current[:service_scope] - normalized_scope).any?) ||
            (current[:assessment_scope] - normalized_assessments).any?
            impact = ServiceDisablePreview.call(practice:, actor: actor.user, site:,
              service_scope: normalized_scope, assessment_scope: normalized_assessments, expected_revision:)
            unless expected_impact_digest.present? && expected_impact_digest == impact.fetch(:impact_digest)
              raise ServiceDisablePreview::Stale, "Service consequences changed or have not been reviewed. Review them again before saving."
            end
            unless impact.fetch(:review_complete)
              raise ServiceDisablePreview::Stale, "Required consequences remain unknown, restricted or unavailable. Restore the removed selection or review its sources with an authorized domain reader before saving."
            end
          end
          old_version = if site
            Clinic::PracticeFeatureVersion.find_by(practice:, site:, revision: current.fetch(:revision)) if current.fetch(:revision).positive?
          else
            Clinic::PracticeFeatureVersion.find_by(practice:, site_id: nil, revision: current.fetch(:revision))
          end
          old = old_version&.optional_features || {}
          optional[LabUnitMappings::KEY] = old[LabUnitMappings::KEY] if old.key?(LabUnitMappings::KEY)
          if old["starter_profile"].present? && normalized_type != old["clinic_type"]
            raise ArgumentError, "This starter profile already has linked records. Request a scoped Meta Clinic review to change the specialty."
          end
          optional["starter_profile"] = StarterProfile.apply(practice: practice, clinic_type: normalized_type,
            service_scope: normalized_scope, previous: old["starter_profile"])
          optional["selected_services"] = current[:finalized] ? current[:selected_services] : normalized_scope
          optional["finalized_at"] = old["finalized_at"]
          optional["finalized_by_membership_id"] = old["finalized_by_membership_id"]
          if finalize == true && !current[:finalized]
            raise ArgumentError, "Choose an active location before finalizing setup." unless site ? site.status == "active" : practice.sites.where(status: "active").exists?
            raise ArgumentError, "Configure an active visit type before finalizing setup." unless practice.visit_types.active.exists?
            optional["finalized_at"] = Current.business_time.iso8601(6)
            optional["finalized_by_membership_id"] = actor.id
          end

          Clinic::PracticeFeatureVersion.create!(
            practice: practice, site:, created_by_membership: actor, revision: current.fetch(:revision) + 1,
            optional_features: optional, effective_from: Current.business_time,
            request_key: key, content_digest: digest
          )
        end
        snapshot(practice: practice, site:)
      end

      def self.site_specialty_selected?(practice:, site:, at: Current.business_time)
        version = Clinic::PracticeFeatureVersion.for_practice(practice).where(site:)
          .where(effective_from: ..at).order(revision: :desc, id: :desc).first
        version.present? && CLINIC_TYPES.include?(version.optional_features["clinic_type"])
      end
    end
  end
end
