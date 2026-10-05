module Clinic
  module Workforce
    class SchedulePublication < ApplicationRecord
      self.table_name = "clinic_workforce_schedule_publications"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :schedule_draft, class_name: "Clinic::Workforce::ScheduleDraft"
      belongs_to :published_by, class_name: "Clinic::Membership", foreign_key: :published_by_id, primary_key: :user_id
      belongs_to :supersedes, class_name: "Clinic::Workforce::SchedulePublication", optional: true

      validates :version, numericality: { only_integer: true, greater_than: 0 }
      validates :snapshot_digest, :request_digest, format: { with: /\A[0-9a-f]{64}\z/ }
      validates :idempotency_key, presence: true, length: { maximum: 120 }, uniqueness: { scope: :practice_id }
      validate :snapshot_is_array
      validate :immutable_after_create, on: :update

      scope :latest_first, -> { order(version: :desc, id: :desc) }

      # PaperTrail defines `version`; keep the domain column authoritative.
      def version
        self[:version]
      end

      def version=(value)
        self[:version] = value
      end

      private

      def snapshot_is_array
        errors.add(:shift_snapshot, "must be an array") unless shift_snapshot.is_a?(Array)
      end

      def immutable_after_create
        errors.add(:base, "Published schedules are immutable") if changed?
      end
    end
  end
end
