class MemberSession < ApplicationRecord
  MAX_DURATION = 12.hours
  IDLE_DURATION = 2.hours
  attr_accessor :revocation_action

  belongs_to :user
  validates :expires_at, presence: true
  after_create -> { Identity::SessionAudit.record!(action: "session.created", user_id: user_id) }
  before_destroy -> { Identity::SessionAudit.record!(action: revocation_action || "session.revoked", user_id: user_id) }

  def unexpired?
    expires_at.future? && created_at > MAX_DURATION.ago && idle_expires_at.future?
  end

  def idle_expires_at
    [last_activity_at + IDLE_DURATION, expires_at, created_at + MAX_DURATION].min
  end

  def record_activity!
    with_lock do
      return false unless unexpired? && user.active?

      update!(last_activity_at: Time.current)
      true
    end
  end

  def expire_if_inactive!
    self.class.transaction do
      record = self.class.lock.find_by(id: id)
      if record && !record.unexpired?
        record.revocation_action = "session.expired"
        record.destroy!
      end
    end
  end
end
