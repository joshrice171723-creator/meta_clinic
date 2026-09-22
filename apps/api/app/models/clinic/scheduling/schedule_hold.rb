module Clinic
  module Scheduling
    class ScheduleHold < ApplicationRecord
      self.table_name = "clinic_schedule_holds"
      include Clinic::TenantScoped
      include Clinic::Auditable
      belongs_to :patient, class_name: "Clinic::Care::Patient", optional: true
      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :clinician, class_name: "Clinic::ClinicianProfile"
      belongs_to :room, class_name: "Clinic::Room", optional: true
      validates :state, inclusion: { in: %w[active expired released converted outcome_unknown] }
      validates :request_key, presence: true, length: { maximum: 160 }, uniqueness: { scope: :practice_id }
      validate :context_matches
      def active?(at: Current.business_time) = state == "active" && expires_at > at
      def expire_if_needed!(at: Current.business_time)
        update!(state: "expired") if state == "active" && expires_at <= at
      end
      private
      def context_matches
        errors.add(:base, "Schedule hold context must belong to one practice.") if [ patient, site, clinician, room ].compact.any? { |item| item.practice_id != practice_id }
        errors.add(:room, "must belong to the selected site") if room && room.site_id != site_id
      end
    end
  end
end
