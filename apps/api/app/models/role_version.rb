class RoleVersion < ApplicationRecord
  has_many :role_version_permissions, dependent: :restrict_with_error
  has_many :permissions, through: :role_version_permissions
  has_many :role_grants, class_name: "Clinic::RoleGrant", dependent: :restrict_with_error

  validates :role_code, presence: true, length: { maximum: 120 }, uniqueness: { scope: :version }
  validates :version, numericality: { only_integer: true, greater_than: 0 }
  before_update { throw :abort }
  before_destroy { throw :abort }
end
