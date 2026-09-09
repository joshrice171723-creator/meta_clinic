class RoleVersionPermission < ApplicationRecord
  belongs_to :role_version
  belongs_to :permission

  validates :permission_id, uniqueness: { scope: :role_version_id }
  before_update { throw :abort }
  before_destroy { throw :abort }
end
