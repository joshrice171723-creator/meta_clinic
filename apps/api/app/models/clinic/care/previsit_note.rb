module Clinic
  module Care
    class PrevisitNote < ApplicationRecord
      self.table_name = "clinic_previsit_notes"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      MAX_TEXT_LENGTH = 5_000

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :appointment, class_name: "Clinic::Appointment"
      belongs_to :submitted_by_user, class_name: "User"

      encrypts :encrypted_text

      scope :latest_first, -> { order(version_number: :desc, id: :desc) }

      validates :version_number, numericality: { only_integer: true, greater_than: 0 }
      validates :request_key, presence: true,
        format: { with: Clinic::Idempotency::KEY_PATTERN }
      validates :submitted_at, presence: true
      validates :encrypted_text, length: { maximum: ->(record) {
        record.encrypted_text.to_s.start_with?(PrevisitIntake::PREFIX) ? 512_000 : MAX_TEXT_LENGTH
      } }, allow_blank: true
      validate :text_is_present
      validate :records_belong_to_context

      def text
        PrevisitIntake.render(encrypted_text)
      end

      private

      def text_is_present
        errors.add(:encrypted_text, "must be provided") if encrypted_text.nil?
      end

      def records_belong_to_context
        return unless practice_id

        errors.add(:patient, "must belong to this practice") if patient && patient.practice_id != practice_id
        if appointment
          errors.add(:appointment, "must belong to this practice") if appointment.practice_id != practice_id
          errors.add(:appointment, "must belong to this patient") if appointment.patient_id != patient_id
        end
      end
    end
  end
end
