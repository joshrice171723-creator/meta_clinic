module Clinic
  module Telehealth
    class Checkin < ApplicationRecord
      self.table_name = "clinic_telehealth_checkins"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :visit, class_name: "Clinic::Telehealth::Visit"
      belongs_to :participant, class_name: "Clinic::Telehealth::Participant"
      belongs_to :supersedes_checkin, class_name: "Clinic::Telehealth::Checkin", optional: true
      encrypts :location_payload
      encrypts :callback_phone

      validates :sequence, :access_generation, numericality: { only_integer: true, greater_than: 0 }
      validates :submitted_at, presence: true
      validate :participant_is_visit_patient

      def location
        location_payload.present? ? JSON.parse(location_payload) : nil
      rescue JSON::ParserError
        nil
      end

      private

      def participant_is_visit_patient
        errors.add(:participant, "must be the patient for this visit") unless participant&.patient? && participant.visit_id == visit_id
      end
    end
  end
end
