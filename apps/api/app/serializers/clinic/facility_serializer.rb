module Clinic
  module FacilitySerializer
    def self.site(site, detail: false)
      payload = { id: site.id, code: site.code, timezone_override: site.timezone_override }
      return payload unless detail

      payload.merge(rooms: site.rooms.order(:code, :id).map { |room| room(room) })
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
