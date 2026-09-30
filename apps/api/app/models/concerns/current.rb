class Current < ActiveSupport::CurrentAttributes
  attribute :business_date, :workspace_tools_owner_session, :business_time_snapshot

  def self.business_date
    super || Date.current
  end

  def self.business_time
    return business_time_snapshot if business_time_snapshot

    clock = Time.current
    date = business_date
    Time.zone.local(date.year, date.month, date.day, clock.hour, clock.min, clock.sec, clock.usec)
  end
end
