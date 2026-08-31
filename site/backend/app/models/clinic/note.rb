module Clinic
  class Note < ApplicationRecord
    self.table_name = "clinic_notes"
    belongs_to :practice, class_name: "Clinic::Practice"
    belongs_to :patient, class_name: "Clinic::Patient"
    belongs_to :author, class_name: "User"
    encrypts :body
    validates :body, presence: true, length: { maximum: 8000 }
    validate :same_practice
    before_update { throw :abort }
    before_destroy { throw :abort }

    private

    def same_practice
      errors.add(:patient, "must belong to this practice") if patient && patient.practice_id != practice_id
    end
  end
end
