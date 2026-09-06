module Clinic
  module Workforce
    class TimeOffRequest < ApplicationRecord
      self.table_name = "clinic_workforce_time_off_requests"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :employment, class_name: "Clinic::Workforce::Employment"
      belongs_to :requested_by, class_name: "Clinic::Membership", foreign_key: :requested_by_id, primary_key: :user_id
      belongs_to :reviewed_by, class_name: "Clinic::Membership", foreign_key: :reviewed_by_id, primary_key: :user_id, optional: true

      before_validation { self.public_id ||= SecureRandom.uuid }
      validates :public_id, presence: true, uniqueness: { scope: :practice_id }
      validates :idempotency_key, presence: true, uniqueness: { scope: :practice_id }
      validates :request_digest, format: { with: /\A[0-9a-f]{64}\z/ }
      validates :starts_at, :ends_at, :timezone, :submitted_at, presence: true
      validates :status, inclusion: { in: %w[submitted approved denied cancelled] }
      validates :reason, presence: true, length: { maximum: 500 }
      validates :decision_reason, length: { maximum: 500 }, allow_blank: true
      validates :revision, numericality: { only_integer: true, greater_than: 0 }
      validate :positive_interval

      scope :overlapping, ->(starts_at, ends_at) { where("starts_at < ? AND ends_at > ?", ends_at, starts_at) }

      private

      def positive_interval
        errors.add(:ends_at, "must be after the start") if starts_at && ends_at && ends_at <= starts_at
      end
    end
  end
end
