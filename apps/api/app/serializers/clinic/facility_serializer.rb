module Clinic
  module FacilitySerializer
    def self.site(site, detail: false)
      payload = {
        id: site.id,
        code: site.code,
        name: site.name,
        status: site.status,
        timezone_override: site.timezone_override,
        address_line1: site.address_line1,
        address_line2: site.address_line2,
        city: site.city,
        state: site.state,
        postal_code: site.postal_code,
        country: site.country,
        phone: site.phone,
        contact_name: site.contact_name,
        contact_email: site.contact_email
      }
      return payload unless detail

      payload.merge(
        operating_hours: site.operating_hours.order(:day_of_week, :id).map { |hour| operating_hour(hour) },
        hour_exceptions: site.hour_exceptions.order(:date, :id).map { |exception| hour_exception(exception) },
        rooms: site.rooms.order(:code, :id).map { |room| room(room) }
      )
    end

    def self.operating_hour(hour)
      { id: hour.id, day_of_week: hour.day_of_week, closed: hour.closed, open_time: hour.open_time&.strftime("%H:%M"), close_time: hour.close_time&.strftime("%H:%M") }
    end

    def self.hour_exception(exception)
      { id: exception.id, date: exception.date.iso8601, closed: exception.closed, open_time: exception.open_time&.strftime("%H:%M"), close_time: exception.close_time&.strftime("%H:%M"), reason: exception.reason }
    end

    def self.room(room)
      { id: room.id, site_id: room.site_id, code: room.code }
    end

    def self.department(department)
      { id: department.id, code: department.code }
    end

    def self.visit_type(visit_type)
      { id: visit_type.id, code: visit_type.code, retired_at: visit_type.retired_at }
    end
  end
end
