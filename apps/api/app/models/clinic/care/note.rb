module Clinic
  module Care
    class Note < ApplicationRecord
      self.table_name = "clinic_notes"
      belongs_to :practice, class_name: "Clinic::Practice"
      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :author_membership, class_name: "Clinic::Membership", foreign_key: :author_id, primary_key: :user_id
      belongs_to :author, class_name: "User"
      encrypts :body
      validates :body, presence: true, length: { maximum: 8000 }
      validate :same_practice
      include Clinic::AppendOnly

      private

      def same_practice
        errors.add(:patient, "must belong to this practice") if patient && patient.practice_id != practice_id
      end
    end
  end
end
