require "digest"

module Clinic
  module Configuration
    class PracticeFeatures
      CORE_FEATURES = %w[
        patients scheduling encounters clinical_chart cash_pricing estimates invoices receipts
        card_payments refunds credits packages memberships
      ].freeze
      OPTIONAL_DEFAULTS = { "insurance_workflows" => false }.freeze

      def self.snapshot(practice:, at: Current.business_time)
        version = Clinic::PracticeFeatureVersion.for_practice(practice)
          .where(effective_from: ..at).order(revision: :desc, id: :desc).first
        optional = OPTIONAL_DEFAULTS.merge(version&.optional_features || {})
        {
          core: CORE_FEATURES.index_with(true), optional: optional,
          insurance_workflows_enabled: optional.fetch("insurance_workflows", false),
          revision: version&.revision || 0, effective_from: version&.effective_from&.iso8601
        }
      end

      def self.revise(practice:, actor:, request_key:, expected_revision:, insurance_workflows_enabled:)
        key = request_key.to_s.strip
        raise ArgumentError, "request_key is required" if key.blank?

        optional = { "insurance_workflows" => ActiveModel::Type::Boolean.new.cast(insurance_workflows_enabled) }
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
