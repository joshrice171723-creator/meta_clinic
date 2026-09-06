module Clinic
  module Workforce
    class ScheduleDraft < ApplicationRecord
      self.table_name = "clinic_workforce_schedule_drafts"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :schedule_template, class_name: "Clinic::Workforce::ScheduleTemplate", optional: true
      belongs_to :created_by, class_name: "Clinic::Membership", foreign_key: :created_by_id, primary_key: :user_id
      has_many :shifts, class_name: "Clinic::Workforce::Shift", dependent: :destroy
      has_many :publications, class_name: "Clinic::Workforce::SchedulePublication", dependent: :restrict_with_error

      validates :week_start_on, :timezone, presence: true
      validates :status, inclusion: { in: %w[draft published superseded] }
      validates :revision, numericality: { only_integer: true, greater_than: 0 }
      validate :week_starts_monday
      validate :valid_timezone
      validate :same_practice

      def editable?
        status == "draft"
      end

      private

      def week_starts_monday
        errors.add(:week_start_on, "must be a Monday") if week_start_on && !week_start_on.monday?
      end

      def valid_timezone
        TZInfo::Timezone.get(timezone) if timezone.present?
      rescue TZInfo::InvalidTimezoneIdentifier
        errors.add(:timezone, "must be an IANA time zone")
      end

      def same_practice
        [ site, schedule_template, created_by ].compact.each do |record|
          errors.add(:base, "Related records must belong to this practice") if record.practice_id != practice_id
        end
      end
    end
  end
end
