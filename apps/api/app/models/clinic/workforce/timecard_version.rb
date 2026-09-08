module Clinic
  module Workforce
    class TimecardVersion < ApplicationRecord
      self.table_name = "clinic_workforce_timecard_versions"
      include Clinic::TenantScoped
      include Clinic::Auditable

      FINAL_STATUSES = %w[approved superseded].freeze

      belongs_to :employment, class_name: "Clinic::Workforce::Employment"
      belongs_to :previous_version, class_name: name, optional: true
      belongs_to :submitted_by_membership, class_name: "Clinic::Membership", optional: true
      belongs_to :approved_by_membership, class_name: "Clinic::Membership", optional: true
      has_many :time_segments, class_name: "Clinic::Workforce::TimeSegment", dependent: :restrict_with_error
      has_many :adjustment_requests, class_name: "Clinic::Workforce::AdjustmentRequest", dependent: :restrict_with_error

      validates :period_start, :period_end, :source_digest, presence: true
      validates :source_digest, length: { is: 64 }
      validates :version_number, numericality: { only_integer: true, greater_than: 0 },
        uniqueness: { scope: %i[practice_id employment_id period_start] }
      validates :status, inclusion: { in: %w[draft submitted approved superseded] }
      validate :period_is_valid
      validate :approval_is_complete
      validate :submission_is_complete
      before_update :prevent_final_mutation
      before_destroy :prevent_final_mutation

      scope :for_period, ->(start_date, end_date) { where(period_start: start_date, period_end: end_date) }

      def unresolved?
        unresolved_exceptions.present?
      end

      def final?
        FINAL_STATUSES.include?(status)
      end

      private

      def prevent_final_mutation
        return unless status_was.in?(FINAL_STATUSES)

        errors.add(:base, "Approved timecards are immutable")
        throw :abort
      end

      def period_is_valid
        errors.add(:period_end, "must be after the start") if period_start && period_end && period_end <= period_start
      end

      def approval_is_complete
        return unless status == "approved"
        errors.add(:base, "Unresolved timecards cannot be approved") if unresolved?
        errors.add(:approved_at, "is required") if approved_at.blank?
        errors.add(:approved_by_membership, "is required") if approved_by_membership.blank?
      end

      def submission_is_complete
        return unless status.in?(%w[submitted approved])
        errors.add(:submitted_at, "is required") if submitted_at.blank?
        errors.add(:submitted_by_membership, "is required") if submitted_by_membership.blank?
      end
    end
  end
end
