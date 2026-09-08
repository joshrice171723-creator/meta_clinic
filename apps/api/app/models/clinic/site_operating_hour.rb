module Clinic
  class SiteOperatingHour < ApplicationRecord
    self.table_name = "clinic_site_operating_hours"
    include TenantScoped
    include Auditable

    belongs_to :site, class_name: "Clinic::Site"
    validates :day_of_week, inclusion: { in: 0..6 }
    validates :open_time, :close_time, presence: true, unless: :closed?
    validates :open_time, :close_time, absence: true, if: :closed?
    validate :close_after_open

    private

    def close_after_open
      return if closed? || open_time.blank? || close_time.blank?
      errors.add(:close_time, "must be later than opening time") unless open_time < close_time
    end
  end
end
