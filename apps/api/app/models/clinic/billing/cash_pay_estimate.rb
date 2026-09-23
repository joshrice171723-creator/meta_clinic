module Clinic
  module Billing
    class CashPayEstimate < ApplicationRecord
      self.table_name = "clinic_cash_pay_estimates"
      include Clinic::TenantScoped
      include Clinic::Auditable
      belongs_to :patient, class_name: "Clinic::Care::Patient", optional: true
      belongs_to :supersedes, class_name: "Clinic::Billing::CashPayEstimate", optional: true
      has_many :lines, class_name: "Clinic::Billing::CashPayEstimateLine", dependent: :restrict_with_error
      validates :classification, inclusion: { in: %w[general_estimate gfe_candidate issued_gfe] }
      validates :status, inclusion: { in: %w[draft issued superseded void] }
      validates :currency, format: { with: /\A[A-Z]{3}\z/ }
      validates :revision, numericality: { only_integer: true, greater_than: 0 }
      validates :correction_reason, length: { maximum: 500 }, allow_nil: true
      validate :issued_snapshot
      validate :correction_lineage
      validate :preserve_issued_snapshot, on: :update
      private
      def issued_snapshot
        return unless status == "issued"
        errors.add(:issued_at, "is required when issued") unless issued_at
        errors.add(:policy_version, "is required for an issued GFE") if classification == "issued_gfe" && policy_version.blank?
      end

      def correction_lineage
        if supersedes_id.present? != correction_reason.present?
          errors.add(:correction_reason, "is required for a correction")
        end
        errors.add(:supersedes, "must belong to this practice") if supersedes && supersedes.practice_id != practice_id
      end

      def preserve_issued_snapshot
        return unless status_in_database.in?(%w[issued superseded])

        changed = changes_to_save.keys - %w[status updated_at lock_version]
        errors.add(:base, "An issued estimate snapshot cannot be changed.") if changed.any?
        if will_save_change_to_status? && !(status_in_database == "issued" && status == "superseded")
          errors.add(:status, "can only move from issued to superseded")
        end
      end
    end
  end
end
