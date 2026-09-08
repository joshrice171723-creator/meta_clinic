module Clinic
  module Care
    class PatientSocialHistory < ApplicationRecord
      self.table_name = "clinic_patient_social_histories"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :patient, class_name: "Clinic::Care::Patient"

      encrypts :tobacco_use, :alcohol_use, :exercise_habits, :diet, :occupation, :living_situation, :relevant_social_factors
      validates :patient_id, :effective_from, presence: true
      validates :effective_until, comparison: { greater_than: :effective_from }, allow_nil: true
    end
  end
end
