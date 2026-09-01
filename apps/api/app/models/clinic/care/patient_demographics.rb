module Clinic
  module Care
    class PatientDemographics < ApplicationRecord
      self.table_name = "clinic_patient_demographics"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :patient, class_name: "Clinic::Care::Patient"

      enum :sex, { female: "female", male: "male", intersex: "intersex", unknown: "unknown", not_recorded: "not_recorded" }, prefix: true, validate: true
      validates :patient_id, presence: true, uniqueness: { scope: :practice_id }
      validates :primary_language, presence: true, length: { maximum: 80 }
      validates :date_of_birth, comparison: { less_than_or_equal_to: -> { Date.current } }, allow_nil: true
      validates :interpreter_required, inclusion: { in: [ true, false ] }
    end
  end
end
