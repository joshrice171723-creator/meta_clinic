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
        operating_hours: ordered_operating_hours(site).map { |hour| operating_hour(hour) },
        hour_exceptions: ordered_hour_exceptions(site).map { |exception| hour_exception(exception) },
        rooms: ordered_rooms(site).map { |room| room(room) }
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

    def self.ordered_operating_hours(site)
      return site.operating_hours.sort_by { |hour| [ hour.day_of_week, hour.id ] } if site.association(:operating_hours).loaded?

      site.operating_hours.order(:day_of_week, :id).to_a
    end

    def self.ordered_hour_exceptions(site)
      return site.hour_exceptions.sort_by { |exception| [ exception.date, exception.id ] } if site.association(:hour_exceptions).loaded?

      site.hour_exceptions.order(:date, :id).to_a
    end

    def self.ordered_rooms(site)
      return site.rooms.sort_by { |room| [ room.code, room.id ] } if site.association(:rooms).loaded?

      site.rooms.order(:code, :id).to_a
    end

    def self.department(department)
      { id: department.id, code: department.code }
    end

    def self.visit_type(visit_type)
      { id: visit_type.id, code: visit_type.code, retired_at: visit_type.retired_at }
    end
  end
end
