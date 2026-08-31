module Clinic
  class Membership < ApplicationRecord
    self.table_name = "clinic_memberships"
    belongs_to :practice, class_name: "Clinic::Practice"
    belongs_to :user
    validates :user_id, uniqueness: true
    scope :active, -> { where(active: true) }
  end
end
