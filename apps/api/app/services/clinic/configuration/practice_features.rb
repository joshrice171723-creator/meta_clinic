require "digest"

module Clinic
  module Configuration
    module PracticeFeatures
      CORE = %w[
        patients scheduling encounters clinical_chart cash_pricing estimates invoices receipts
        payments refunds credits packages memberships
      ].freeze
      OPTIONAL = %w[insurance_workflows].freeze

      module_function

      def snapshot(practice:, at: Current.business_time)
        version = PracticeFeatureVersion.where(practice_id: practice.id)
          .effective_at(at).order(effective_from: :desc, version: :desc).first
        {
          schema_version: "practice-features-v1",
          core: CORE.to_h { |feature| [ feature, true ] },
          optional: { insurance_workflows: version&.insurance_workflows_enabled || false },
          current_version: version&.version || 0,
          effective_from: version&.effective_from&.iso8601,
          reason: version&.reason
        }
      end

      def insurance_enabled?(practice, at: Current.business_time)
        snapshot(practice:, at:).dig(:optional, :insurance_workflows)
      end

      def require_insurance!(practice)
        return if insurance_enabled?(practice)

        raise Clinic::Authorization::Denied, "Insurance workflows are not enabled for this clinic."
      end

      def revise(practice:, actor:, expected_version:, insurance_workflows_enabled:, reason:, request_key:,
        effective_from: Current.business_time)
        member = Clinic::Authorization.authorize!(
          actor:, practice:, action: "facilities.write", any_site: true
        )
        normalized = {
          insurance_workflows_enabled: ActiveModel::Type::Boolean.new.cast(insurance_workflows_enabled),
          reason: reason.to_s.strip,
          effective_from: effective_from.iso8601(6)
        }
        digest = Digest::SHA256.hexdigest(JSON.generate(normalized))

        ApplicationRecord.transaction do
          practice.lock!
          existing = PracticeFeatureVersion.find_by(practice_id: practice.id, request_key:)
          if existing
            raise Clinic::Idempotency::Conflict unless existing.content_digest == digest
            return existing
          end
          relation = PracticeFeatureVersion.where(practice_id: practice.id)
          latest = relation.maximum(:version) || 0
          raise ActiveRecord::StaleObjectError.new(practice, "configure features") unless latest == expected_version

          record = relation.create!(
            practice:, recorded_by_membership: member, version: latest + 1,
            insurance_workflows_enabled: normalized[:insurance_workflows_enabled],
            reason: normalized[:reason], request_key:, content_digest: digest, effective_from:
          )
          Clinic::AuditRecorder.record!(
            practice:, actor:, action_code: "practice_features.revised", outcome: :committed,
            resource_version_ref: "practice_features/#{record.version}"
          )
          record
        end
      rescue ActiveRecord::RecordNotUnique
        retry_record = PracticeFeatureVersion.find_by!(practice_id: practice.id, request_key:)
        raise Clinic::Idempotency::Conflict unless retry_record.content_digest == digest
        retry_record
      end
    end
  end
end
