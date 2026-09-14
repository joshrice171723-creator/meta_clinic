module Clinic
  module Care
    class PatientDemographics < ApplicationRecord
      self.table_name = "clinic_patient_demographics"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :patient, class_name: "Clinic::Care::Patient"

      encrypts :legal_name, :preferred_name
      enum :sex, { female: "female", male: "male", intersex: "intersex", unknown: "unknown", not_recorded: "not_recorded" }, prefix: true, validate: true
      validates :patient_id, presence: true, uniqueness: { scope: :practice_id }
      validates :primary_language, presence: true, length: { maximum: 80 }
      validates :date_of_birth, comparison: { less_than_or_equal_to: -> { Current.business_date } }, allow_nil: true
      validates :interpreter_required, inclusion: { in: [ true, false ] }, allow_nil: true
      validates :legal_name, :preferred_name, length: { maximum: 160 }, allow_nil: true
      validate :plausible_birth_date, if: -> { new_record? || will_save_change_to_date_of_birth? }

      after_save -> { Clinic::Care::PatientIdentitySearch.refresh!(patient) }

      private

      def plausible_birth_date
        return if date_of_birth_before_type_cast.blank?
        BirthDate.parse!(date_of_birth_before_type_cast)
      rescue ArgumentError => error
        errors.add(:date_of_birth, error.message)
      end
    end
  end
end
