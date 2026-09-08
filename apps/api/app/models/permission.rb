class Permission < ApplicationRecord
  has_many :role_version_permissions, dependent: :restrict_with_error
  has_many :role_versions, through: :role_version_permissions

  validates :action_code, presence: true, length: { maximum: 160 }, uniqueness: true
  before_update { throw :abort }
  before_destroy { throw :abort }
end
