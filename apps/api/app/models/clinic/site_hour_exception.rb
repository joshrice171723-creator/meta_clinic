module Clinic
  class SiteHourException < ApplicationRecord
    self.table_name = "clinic_site_hour_exceptions"
    include TenantScoped
    include Auditable

    belongs_to :site, class_name: "Clinic::Site"
    validates :date, presence: true, uniqueness: { scope: [ :practice_id, :site_id ] }
    validates :reason, length: { maximum: 200 }, allow_blank: true
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
