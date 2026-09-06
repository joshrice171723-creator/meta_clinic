module Clinic
  module Workforce
    class ScheduleTemplate < ApplicationRecord
      self.table_name = "clinic_workforce_schedule_templates"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :created_by, class_name: "Clinic::Membership", foreign_key: :created_by_id, primary_key: :user_id
      has_many :schedule_drafts, class_name: "Clinic::Workforce::ScheduleDraft", dependent: :restrict_with_error

      validates :name, presence: true, length: { maximum: 120 }, uniqueness: { scope: %i[practice_id site_id], conditions: -> { where(active: true) } }
      validates :timezone, presence: true, length: { maximum: 80 }
      validates :revision, numericality: { only_integer: true, greater_than: 0 }
      validate :valid_timezone
      validate :definitions_are_array
      validate :same_practice

      private

      def valid_timezone
        TZInfo::Timezone.get(timezone) if timezone.present?
      rescue TZInfo::InvalidTimezoneIdentifier
        errors.add(:timezone, "must be an IANA time zone")
      end

      def definitions_are_array
        errors.add(:shift_definitions, "must be a list") unless shift_definitions.is_a?(Array)
      end

      def same_practice
        errors.add(:site, "must belong to this practice") if site && site.practice_id != practice_id
        errors.add(:created_by, "must belong to this practice") if created_by && created_by.practice_id != practice_id
      end
    end
  end
end
