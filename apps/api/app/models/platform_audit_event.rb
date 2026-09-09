class PlatformAuditEvent < ApplicationRecord
  validates :actor_session_reference, :action_code, :outcome, :occurred_at, presence: true
  before_update { throw :abort }
  before_destroy { throw :abort }
end
