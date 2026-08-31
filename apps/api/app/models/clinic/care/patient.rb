module Clinic
  module Care
    class Patient < ApplicationRecord
      self.table_name = "clinic_patients"
      belongs_to :practice, class_name: "Clinic::Practice"
      has_many :notes, class_name: "Clinic::Care::Note", dependent: :restrict_with_error
      encrypts :display_name
      validates :display_name, presence: true, length: { maximum: 120 }
      validates :reference, presence: true, length: { maximum: 32 }, uniqueness: { scope: :practice_id }
    end
  end
end
