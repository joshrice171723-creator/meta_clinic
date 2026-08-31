class MemberSession < ApplicationRecord
  MAX_DURATION = 12.hours

  belongs_to :user
  validates :expires_at, presence: true

  def unexpired?
    expires_at.future? && created_at > MAX_DURATION.ago
  end
end
