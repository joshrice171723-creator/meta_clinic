module Clinic
  module Workforce
    class AdjustmentRequest < ApplicationRecord
      self.table_name = "clinic_workforce_adjustment_requests"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :employment, class_name: "Clinic::Workforce::Employment"
      belongs_to :timecard_version, class_name: "Clinic::Workforce::TimecardVersion"
      belongs_to :requested_by_membership, class_name: "Clinic::Membership"
      belongs_to :reviewed_by_membership, class_name: "Clinic::Membership", optional: true
      belongs_to :resulting_timecard_version, class_name: "Clinic::Workforce::TimecardVersion", optional: true

      validates :status, inclusion: { in: %w[submitted approved denied] }
      validates :correction_type, inclusion: { in: %w[add_segment replace_segment remove_segment] }
      validates :reason, presence: true, length: { maximum: 1000 }
      validates :request_key, presence: true, length: { is: 36 }, uniqueness: { scope: :practice_id }
      validates :payload_digest, presence: true, length: { is: 64 }
      validate :decision_is_complete
      validate :proposed_change_shape
      before_update :prevent_decided_mutation
      before_destroy :prevent_decided_mutation

      private

      def prevent_decided_mutation
        return unless status_was.in?(%w[approved denied])

        errors.add(:base, "Decided adjustments are immutable")
        throw :abort
      end

      def decision_is_complete
        return if status == "submitted"
        errors.add(:reviewed_at, "is required") if reviewed_at.blank?
        errors.add(:reviewed_by_membership, "is required") if reviewed_by_membership.blank?
        errors.add(:decision_reason, "is required") if decision_reason.blank?
      end

      def proposed_change_shape
        changes = proposed_changes.to_h.stringify_keys
        if %w[replace_segment remove_segment].include?(correction_type) && changes["source_segment_id"].blank?
          errors.add(:proposed_changes, "must identify the source interval")
        end
        return if correction_type == "remove_segment"

        %w[site_id started_at_utc ended_at_utc].each do |key|
          errors.add(:proposed_changes, "must include #{key.humanize.downcase}") if changes[key].blank?
        end
        return if errors[:proposed_changes].any?

        started = Time.iso8601(changes.fetch("started_at_utc").to_s)
        ended = Time.iso8601(changes.fetch("ended_at_utc").to_s)
        unless changes.fetch("started_at_utc").to_s.match?(/(?:Z|[+-]\d{2}:\d{2})\z/) && changes.fetch("ended_at_utc").to_s.match?(/(?:Z|[+-]\d{2}:\d{2})\z/)
          errors.add(:proposed_changes, "times must include a UTC offset")
        end
        errors.add(:proposed_changes, "end must be after start") unless ended > started
        site = Clinic::Site.find_by(id: changes["site_id"], practice_id: practice_id)
        errors.add(:proposed_changes, "site must belong to this practice") unless site
        if changes["source_segment_id"].present?
          segment = timecard_version&.time_segments&.find_by(id: changes["source_segment_id"])
          errors.add(:proposed_changes, "source interval must belong to this timecard") unless segment
        end
      rescue ArgumentError
        errors.add(:proposed_changes, "times must be valid ISO timestamps")
      end
    end
  end
end
