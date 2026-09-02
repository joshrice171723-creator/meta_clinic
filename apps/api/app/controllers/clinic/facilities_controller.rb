module Clinic
  class FacilitiesController < ApiController
    before_action -> { require_capability_with_legacy("appointments.book", "appointments.write") }

    def index
      type = enum_param!(params[:type].presence || "sites", field: :type, allowed: %w[sites rooms departments visit_types])
      query = query_param
      records = case type
      when "sites" then current_practice.sites
      when "rooms" then current_practice.rooms
      when "departments" then current_practice.departments
      when "visit_types" then current_practice.visit_types
      end
      records = records.where("code ILIKE ?", "%#{records.model.sanitize_sql_like(query)}%") if query.present?

      serializer = case type
      when "sites" then ->(record) { FacilitySerializer.site(record) }
      when "rooms" then ->(record) { FacilitySerializer.room(record) }
      when "departments" then ->(record) { FacilitySerializer.department(record) }
      when "visit_types" then ->(record) { FacilitySerializer.visit_type(record) }
      end
      order = type == "rooms" ? { code: :asc, site_id: :asc, id: :asc } : { code: :asc, id: :asc }
      paginate(records, key: type, serializer: serializer, order: order)
    end
  end
end
