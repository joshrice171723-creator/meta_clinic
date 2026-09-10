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
        behavioral_health custom_ambulatory
      ].freeze
      SERVICE_SCOPE = %w[
        telehealth external_lab_coordination minor_office_procedures in_office_medications
        vaccinations point_of_care_testing infusions controlled_medications patient_supplied_medications
      ].freeze
      RECOMMENDED_CLINIC_TYPE = "primary_care".freeze
      RECOMMENDED_SERVICE_SCOPE = %w[
        telehealth external_lab_coordination minor_office_procedures in_office_medications
      ].freeze
      OPTIONAL_DEFAULTS = {
        "insurance_workflows" => false,
        "clinic_type" => nil,
        "service_scope" => []
      }.freeze

      def self.snapshot(practice:, at: Current.business_time)
        version = Clinic::PracticeFeatureVersion.for_practice(practice)
          .where(effective_from: ..at).order(revision: :desc, id: :desc).first
        stored = version&.optional_features || {}
        optional = OPTIONAL_DEFAULTS.merge(stored)
        optional["clinic_type"] = nil unless CLINIC_TYPES.include?(optional["clinic_type"])
        optional["service_scope"] = Array(optional["service_scope"]).select { |code| SERVICE_SCOPE.include?(code) }
        {
          core: CORE_FEATURES.index_with(true), optional: optional,
          insurance_workflows_enabled: optional.fetch("insurance_workflows", false),
          clinic_type: optional["clinic_type"], service_scope: optional.fetch("service_scope"),
          configured: version.present? && stored.key?("clinic_type") && stored.key?("service_scope"),
          recommended_clinic_type: RECOMMENDED_CLINIC_TYPE,
          recommended_service_scope: RECOMMENDED_SERVICE_SCOPE,
          revision: version&.revision || 0, effective_from: version&.effective_from&.iso8601
        }
      end

      def self.revise(practice:, actor:, request_key:, expected_revision:, insurance_workflows_enabled:,
        clinic_type:, service_scope:)
        key = request_key.to_s.strip
        raise ArgumentError, "request_key is required" if key.blank?

        normalized_type = clinic_type.to_s.strip
        raise ArgumentError, "clinic_type is not supported" unless CLINIC_TYPES.include?(normalized_type)

        normalized_scope = Array(service_scope).map { |code| code.to_s.strip }.uniq
        unsupported = normalized_scope - SERVICE_SCOPE
        raise ArgumentError, "service_scope includes unsupported services: #{unsupported.join(', ')}" if unsupported.any?

        optional = {
          "insurance_workflows" => ActiveModel::Type::Boolean.new.cast(insurance_workflows_enabled),
          "clinic_type" => normalized_type,
          "service_scope" => SERVICE_SCOPE.select { |code| normalized_scope.include?(code) }
        }
        digest = Digest::SHA256.hexdigest(optional.to_json)
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
