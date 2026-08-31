class Organization < ApplicationRecord
  has_many :practices, class_name: "Clinic::Practice", dependent: :restrict_with_error

  validates :name, presence: true, length: { maximum: 120 }
end
