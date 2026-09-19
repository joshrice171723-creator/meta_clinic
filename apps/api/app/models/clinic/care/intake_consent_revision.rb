module Clinic
  module Care
    class IntakeConsentRevision < ApplicationRecord
      self.table_name = "clinic_intake_consent_revisions"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      PURPOSES = %w[treatment privacy_notice product_counseling ai_recording marketing].freeze
      DECISIONS = %w[recorded declined revoked].freeze
      SOURCES = %w[patient staff_recorded_external_evidence].freeze
      CONTENT_KEYS = %w[decision document_reference document_version source evidence_reference occurred_on product source_document_id].freeze
      TEXT_LIMITS = { "document_reference" => 200, "document_version" => 200,
        "evidence_reference" => 1_000, "product" => 200 }.freeze

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :recorded_by_membership, class_name: "Clinic::Membership"
      encrypts :content

      validates :purpose, inclusion: { in: PURPOSES }
      validates :revision, numericality: { only_integer: true, greater_than: 0 },
        uniqueness: { scope: %i[practice_id patient_id purpose] }
      validates :recorded_at, :content, presence: true
      validates :request_key, format: { with: Clinic::Idempotency::KEY_PATTERN },
        uniqueness: { scope: %i[practice_id recorded_by_membership_id] }
      validate :valid_content
      validate :same_practice

      def payload
        JSON.parse(content)
      end

      def self.normalize_payload(value)
        unless value.is_a?(Hash) && (value.keys - CONTENT_KEYS).empty? &&
            %w[decision document_reference document_version source occurred_on].all? { |key| value.key?(key) }
          raise ArgumentError, "Consent evidence must contain only supported fields, including decision and document details."
        end
        decision = value["decision"]
        raise ArgumentError, "Choose a supported consent evidence decision." unless DECISIONS.include?(decision)
        source = value["source"]
        raise ArgumentError, "Choose a supported evidence source." unless SOURCES.include?(source)
        result = TEXT_LIMITS.to_h do |key, limit|
          text = value[key]
          unless text.nil? || (text.is_a?(String) && text.length <= limit)
            raise ArgumentError, "#{key.humanize} must be text of at most #{limit} characters."
          end
          [key, text&.strip&.presence]
        end
        raise ArgumentError, "Document reference and version are required." if result["document_reference"].blank? || result["document_version"].blank?
        source_document_id = value["source_document_id"]
        unless source_document_id.nil? || (source_document_id.is_a?(Integer) && source_document_id.positive?)
          raise ArgumentError, "Source document must be a valid patient document."
        end
        occurred_on = value["occurred_on"]
        occurred_on_date = Date.iso8601(occurred_on) if occurred_on.is_a?(String)
        raise ArgumentError, "Evidence date is required." unless occurred_on_date
        raise ArgumentError, "Evidence date cannot be in the future." if occurred_on_date > Current.business_time.to_date
        if decision == "recorded" && source_document_id.nil? && result["evidence_reference"].blank?
          raise ArgumentError, "Recorded acceptance requires an existing document or external evidence reference."
        end
        result.merge("decision" => decision, "source" => source, "occurred_on" => occurred_on,
          "source_document_id" => source_document_id)
      rescue Date::Error
        raise ArgumentError, "Evidence date must use YYYY-MM-DD."
      end

      private

      def valid_content
        self.class.normalize_payload(payload)
      rescue JSON::ParserError, TypeError, ArgumentError
        errors.add(:content, "must contain valid consent evidence")
      end

      def same_practice
        errors.add(:patient, "must belong to this clinic") if patient && patient.practice_id != practice_id
        if recorded_by_membership && recorded_by_membership.practice_id != practice_id
          errors.add(:recorded_by_membership, "must belong to this clinic")
        end
      end
    end
  end
end
