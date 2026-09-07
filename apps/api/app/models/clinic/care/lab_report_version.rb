module Clinic
  module Care
    class LabReportVersion < ApplicationRecord
      self.table_name = "clinic_lab_report_versions"
      include Clinic::TenantScoped

      STATUSES = %w[preliminary final amended corrected cancelled].freeze
      IMMUTABLE_ATTRIBUTES = %w[
        practice_id patient_id lab_report_id version_number title status collected_at issued_at results_payload
        entry_kind content_digest recorded_by_membership_id recorded_at
      ].freeze

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :lab_report, class_name: "Clinic::Care::LabReport", inverse_of: :report_versions
      belongs_to :recorded_by_membership, class_name: "Clinic::Membership"
      belongs_to :reviewed_by_membership, class_name: "Clinic::Membership", optional: true

      encrypts :title, :results_payload
      enum :status, STATUSES.index_with(&:itself), prefix: true, validate: true
      enum :entry_kind, { manual: "manual" }, prefix: true, validate: true
      attr_readonly(*IMMUTABLE_ATTRIBUTES)
      has_paper_trail(
        on: %i[create update], versions: { class_name: "Clinic::ModelVersion" },
        meta: {
          practice_id: :practice_id,
          actor_reference: ->(_record) { PaperTrail.request.whodunnit },
          request_id: ->(_record) { PaperTrail.request.controller_info&.[](:request_id) },
          occurred_at: ->(_record) { Time.current },
          changed_fields: ->(record) { record.saved_changes.keys }
        }
      )

      validates :patient, :lab_report, :version_number, :title, :status, :collected_at, :issued_at,
        :results_payload, :entry_kind, :content_digest, :recorded_by_membership, :recorded_at, presence: true
      validates :version_number, numericality: { only_integer: true, greater_than: 0 }, uniqueness: { scope: %i[practice_id lab_report_id] }
      validates :title, length: { maximum: 200 }
      validates :content_digest, length: { is: 64 }, format: { with: /\A\h{64}\z/ }
      validate :related_records_belong_to_context
      validate :review_pair_is_complete
      validate :issued_after_collection
      before_update :review_only_once
      before_destroy { throw :abort }

      def results
        value = JSON.parse(results_payload)
        raise TypeError unless value.is_a?(Array)

        value
      rescue JSON::ParserError, TypeError
        raise ArgumentError, "Stored lab results are unavailable."
      end

      private

      def related_records_belong_to_context
        errors.add(:lab_report, "must belong to this practice") if lab_report && lab_report.practice_id != practice_id
        errors.add(:lab_report, "must belong to this patient") if lab_report && lab_report.patient_id != patient_id
        [ recorded_by_membership, reviewed_by_membership ].compact.each do |membership|
          errors.add(:base, "Lab report staff must belong to this practice") if membership.practice_id != practice_id
        end
      end

      def review_pair_is_complete
        return if reviewed_at.present? == reviewed_by_membership.present?

        errors.add(:reviewed_at, "and reviewer must be recorded together")
      end

      def issued_after_collection
        return unless collected_at && issued_at && issued_at < collected_at

        errors.add(:issued_at, "cannot be before collection")
      end

      def review_only_once
        immutable_change = IMMUTABLE_ATTRIBUTES.any? { |attribute| will_save_change_to_attribute?(attribute) }
        if immutable_change || (reviewed_at_was.present? && (will_save_change_to_reviewed_at? || will_save_change_to_reviewed_by_membership_id?))
          errors.add(:base, "Lab report version payload and review evidence are immutable")
          throw :abort
        end
      end
    end
  end
end
