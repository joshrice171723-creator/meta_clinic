class Current < ActiveSupport::CurrentAttributes
  attribute :business_date

  def self.business_date
    super || Date.current
  end

  def self.business_time
    clock = Time.current
    date = business_date
    Time.zone.local(date.year, date.month, date.day, clock.hour, clock.min, clock.sec, clock.usec)
  end
end
