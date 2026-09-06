module Clinic
  module Workforce
    class Shift < ApplicationRecord
      self.table_name = "clinic_workforce_shifts"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :schedule_draft, class_name: "Clinic::Workforce::ScheduleDraft"
      belongs_to :employment, class_name: "Clinic::Workforce::Employment"

      before_validation { self.public_id ||= SecureRandom.uuid }
      validates :public_id, presence: true, uniqueness: { scope: :practice_id }
      validates :timezone, :local_start, :local_end, presence: true
      validates :start_occurrence, :end_occurrence, inclusion: { in: %w[only first second] }
      validates :break_minutes, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
      validates :role_name, length: { maximum: 120 }, allow_blank: true
      validate :positive_interval
      validate :same_practice

      private

      def positive_interval
        errors.add(:ends_at, "must be after the start") if starts_at && ends_at && ends_at <= starts_at
        if starts_at && ends_at && break_minutes && break_minutes >= ((ends_at - starts_at) / 60)
          errors.add(:break_minutes, "must be shorter than the shift")
        end
      end

      def same_practice
        errors.add(:schedule_draft, "must belong to this practice") if schedule_draft && schedule_draft.practice_id != practice_id
        errors.add(:employment, "must belong to this practice") if employment && employment.practice_id != practice_id
      end
    end
  end
end
