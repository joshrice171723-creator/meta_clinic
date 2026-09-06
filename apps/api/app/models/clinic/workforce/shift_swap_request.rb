module Clinic
  module Workforce
    class ShiftSwapRequest < ApplicationRecord
      self.table_name = "clinic_workforce_shift_swap_requests"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :requester_employment, class_name: "Clinic::Workforce::Employment"
      belongs_to :target_employment, class_name: "Clinic::Workforce::Employment"
      belongs_to :schedule_publication, class_name: "Clinic::Workforce::SchedulePublication"
      belongs_to :requested_by, class_name: "Clinic::Membership", foreign_key: :requested_by_id, primary_key: :user_id
      belongs_to :target_decided_by, class_name: "Clinic::Membership", foreign_key: :target_decided_by_id, primary_key: :user_id, optional: true
      belongs_to :reviewed_by, class_name: "Clinic::Membership", foreign_key: :reviewed_by_id, primary_key: :user_id, optional: true

      before_validation { self.public_id ||= SecureRandom.uuid }
      validates :public_id, presence: true, uniqueness: { scope: :practice_id }
      validates :idempotency_key, presence: true, uniqueness: { scope: :practice_id }
      validates :request_digest, format: { with: /\A[0-9a-f]{64}\z/ }
      validates :offered_shift_public_id, :submitted_at, presence: true
      validates :status, inclusion: { in: %w[submitted accepted declined approved denied cancelled] }
      validates :reason, presence: true, length: { maximum: 500 }
      validates :target_reason, :decision_reason, length: { maximum: 500 }, allow_blank: true
      validates :revision, numericality: { only_integer: true, greater_than: 0 }
      validate :distinct_employees

      def offered_shift
        schedule_publication.shift_snapshot.find { |shift| shift["id"] == offered_shift_public_id }
      end

      private

      def distinct_employees
        errors.add(:target_employment, "must be another employee") if requester_employment_id == target_employment_id
      end
    end
  end
end
