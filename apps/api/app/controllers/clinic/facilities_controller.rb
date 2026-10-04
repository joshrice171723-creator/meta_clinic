module Clinic
  class FacilitiesController < ApiController
    before_action -> { require_capability_with_legacy("facilities.read", "appointments.book", any_site: true) }, only: :index
    before_action -> { require_capability_with_legacy("facilities.write", "appointments.write") }, only: %i[create update create_department update_department]

    def index
      type = enum_param!(params[:type].presence || "sites", field: :type, allowed: %w[sites rooms departments visit_types])
      query = query_param
      records = case type
      when "sites" then accessible_clinic_sites
      when "rooms" then current_practice.rooms
      when "departments" then current_practice.departments
      when "visit_types" then current_practice.visit_types
      end
      if type == "visit_types" && params[:available_only].to_s == "true"
        site = params[:site_id].present? ? accessible_clinic_sites.find(requested_id!(params[:site_id], :site_id)) : current_clinic_site
        ids = Configuration::StarterProfile.available_visit_type_ids(practice: current_practice, site:)
        records = records.where(id: ids)
      elsif type == "rooms" && params[:site_id].present?
        site = accessible_clinic_sites.find(requested_id!(params[:site_id], :site_id))
        records = records.where(site:)
      end
      records = records.where(id: current_clinic_site&.id || -1) if type == "sites" && params[:selected_only].to_s == "true"
      records = records.where("code ILIKE ?", "%#{records.model.sanitize_sql_like(query)}%") if query.present?
      records = records.includes(:operating_hours, :hour_exceptions, :rooms) if type == "sites" && params[:detail].to_s == "true"

      serializer = case type
      when "sites" then ->(record) { FacilitySerializer.site(record, detail: params[:detail].to_s == "true") }
      when "rooms" then ->(record) { FacilitySerializer.room(record) }
      when "departments" then ->(record) { FacilitySerializer.department(record) }
      when "visit_types" then ->(record) { FacilitySerializer.visit_type(record) }
      end
      order = type == "rooms" ? { code: :asc, site_id: :asc, id: :asc } : { code: :asc, id: :asc }
      if type == "visit_types"
        visit_types, pagination = paginated_records(records, order: order)
        render json: {
          visit_types: visit_types.map { |visit_type| serializer.call(visit_type) },
          pagination: pagination,
          can_write: current_ability.practice_scope_for?("facilities.write") ||
            current_ability.practice_scope_for?("appointments.write")
        }
      else
        paginate(records, key: type, serializer: serializer, order: order)
      end
    end

    def create
      site = Configuration::ManageFacilities.call(practice: current_practice, actor: current_user,
        action: "site_create", input: facility_input)
      session[:clinic_site_id] = site.id
      render json: { id: site.id, site: FacilitySerializer.site(site, detail: true) }, status: :created
    end

    def create_department
      department = Configuration::ManageFacilities.call(practice: current_practice, actor: current_user,
        action: "department_create", input: parameter_hash!(:department, %i[code]))
      render json: { department: FacilitySerializer.department(department) }, status: :created
    end

    def update_department
      department = current_practice.departments.find(requested_id!(params[:id], :id))
      department = Configuration::ManageFacilities.call(practice: current_practice, actor: current_user,
        action: "department_update", department:, input: parameter_hash!(:department, %i[code]))
      render json: { department: FacilitySerializer.department(department) }
    end

    def update
      site = current_practice.sites.find(requested_id!(params[:id], :id))
      site = Configuration::ManageFacilities.call(practice: current_practice, actor: current_user,
        action: "site_update", site:, input: facility_input)
      render json: { site: FacilitySerializer.site(site, detail: true) }
    end

    def create_room
      site = current_practice.sites.find(requested_id!(params[:id], :id))
      room = Configuration::ManageFacilities.call(practice: current_practice, actor: current_user,
        action: "room_create", site:, input: parameter_hash!(:room, %i[code kind]))
      render json: { room: FacilitySerializer.room(room) }, status: :created
    end

    def update_room
      site = current_practice.sites.find(requested_id!(params[:id], :id))
      room = site.rooms.find(requested_id!(params[:room_id], :room_id))
      room = Configuration::ManageFacilities.call(practice: current_practice, actor: current_user,
        action: "room_update", site:, room:, input: parameter_hash!(:room, %i[code kind]))
      render json: { room: FacilitySerializer.room(room) }
    end

    private

    def facility_input
      parameter_hash!(
        :site,
        %i[code name status timezone_override address_line1 address_line2 city state postal_code country phone contact_name contact_email],
        nested_arrays: { operating_hours: %i[day_of_week closed open_time close_time], hour_exceptions: %i[date closed open_time close_time reason] }
      )
    end
  end
end
