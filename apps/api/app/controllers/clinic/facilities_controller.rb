module Clinic
  class FacilitiesController < ApiController
    before_action -> { require_capability_with_legacy("facilities.read", "appointments.book", any_site: true) }, only: :index
    before_action -> { require_capability_with_legacy("facilities.write", "appointments.write") }, only: %i[create update create_department]

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
      input = facility_input
      site = current_practice.sites.transaction do
        created_site = current_practice.sites.create!(site_attributes(input))
        save_hours(created_site, input)
        %w[Room\ 1 Room\ 2].each { |code| created_site.rooms.create!(practice: current_practice, code: code, kind: "physical") }
        created_site
      end
      session[:clinic_site_id] = site.id
      render json: { id: site.id, site: FacilitySerializer.site(site, detail: true) }, status: :created
    end

    def create_department
      input = parameter_hash!(:department, %i[code])
      code = required_string!(input[:code], field: :code, maximum: 80)
      department = current_practice.transaction do
        record = current_practice.departments.find_or_create_by!(code: code)
        Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
          action_code: "facilities.department.configure", outcome: :committed,
          resource_version_ref: "clinic-department:#{record.id}")
        record
      end
      render json: { department: FacilitySerializer.department(department) }, status: :created
    end

    def update
      site = current_practice.sites.find(requested_id!(params[:id], :id))
      input = facility_input
      site.transaction do
        site.update!(site_attributes(input, existing: site))
        save_hours(site, input) if input.key?(:operating_hours) || input.key?(:hour_exceptions)
      end
      render json: { site: FacilitySerializer.site(site, detail: true) }
    end

    def create_room
      site = current_practice.sites.find(requested_id!(params[:id], :id))
      require_capability_with_legacy("facilities.write", "appointments.write", site: site)
      input = parameter_hash!(:room, %i[code kind])
      room = site.rooms.create!(
        practice: current_practice,
        code: required_string!(input[:code], field: :code, maximum: 80),
        kind: enum_param!(input[:kind].presence || "physical", field: :kind, allowed: %w[physical telehealth])
      )
      render json: { room: FacilitySerializer.room(room) }, status: :created
    end

    def update_room
      site = current_practice.sites.find(requested_id!(params[:id], :id))
      require_capability_with_legacy("facilities.write", "appointments.write", site: site)
      room = site.rooms.find(requested_id!(params[:room_id], :room_id))
      input = parameter_hash!(:room, %i[code kind])
      next_kind = input.key?(:kind) ? enum_param!(input[:kind], field: :kind, allowed: %w[physical telehealth]) : room.kind
      if next_kind != room.kind && room.appointments.exists?
        raise ArgumentError, "A room with appointments cannot change type. Add another room instead."
      end
      room.update!(
        code: input.key?(:code) ? required_string!(input[:code], field: :code, maximum: 80) : room.code,
        kind: next_kind
      )
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

    def site_attributes(input, existing: nil)
      attributes = {}
      attributes[:code] = if existing && !input.key?(:code)
        existing.code
      else
        required_string!(input[:code], field: :code, maximum: 80)
      end
      attributes[:name] = if existing && !input.key?(:name)
        existing.name
      else
        required_string!(input[:name], field: :name, maximum: 120)
      end
      attributes[:status] = if existing && !input.key?(:status)
        existing.status
      else
        enum_param!(input[:status].presence || "draft", field: :status, allowed: %w[draft active temporarily_closed retired])
      end

      optional_fields = {
        timezone_override: 80,
        address_line1: 120,
        address_line2: 120,
        city: 120,
        state: 120,
        postal_code: 30,
        phone: 40,
        contact_name: 120,
        contact_email: 320
      }
      optional_fields.each do |field, maximum|
        next if existing && !input.key?(field)

        attributes[field] = optional_string(input[field], field: field, maximum: maximum)
      end
      if !existing || input.key?(:country)
        attributes[:country] = optional_string(input[:country], field: :country, maximum: 2)&.upcase || "US"
      end
      effective_address = %i[address_line1 city state postal_code country].to_h do |field|
        [ field, attributes.key?(field) ? attributes[field] : existing&.public_send(field) ]
      end
      if !existing || attributes.fetch(:status, existing.status) == "active"
        missing = effective_address.select { |_field, value| value.to_s.strip.blank? }.keys
        unless missing.empty?
          raise ArgumentError, "A facility requires an address line, city, state, postal code, and country before it can be saved."
        end
      end
      attributes
    end

    def save_hours(site, input)
      if input.key?(:operating_hours)
        rows = Array(input[:operating_hours]).map { |row| normalize_hour(row) }
        raise ArgumentError, "Operating hours must contain one row per day." unless rows.map { |row| row[:day_of_week] }.uniq.length == rows.length
        Clinic::SiteOperatingHour.where(practice_id: current_practice.id, site_id: site.id).delete_all
        rows.each { |row| site.operating_hours.create!(row.merge(practice_id: current_practice.id)) }
      end
      return unless input.key?(:hour_exceptions)

      rows = Array(input[:hour_exceptions]).map { |row| normalize_exception(row) }
      raise ArgumentError, "A facility can have only one exception per date." unless rows.map { |row| row[:date] }.uniq.length == rows.length
      Clinic::SiteHourException.where(practice_id: current_practice.id, site_id: site.id).delete_all
      rows.each { |row| site.hour_exceptions.create!(row.merge(practice_id: current_practice.id)) }
    end

    def normalize_hour(row)
      day = Integer(row[:day_of_week].to_s, 10) rescue nil
      raise ArgumentError, "Each operating-hours day must be between 0 and 6." unless day&.between?(0, 6)
      closed = boolean_param(row[:closed], field: :closed)
      times = normalized_times(row[:open_time], row[:close_time], closed)
      { day_of_week: day, closed: closed }.merge(times)
    end

    def normalize_exception(row)
      date = date_param!(row[:date], field: :date)
      closed = boolean_param(row[:closed], field: :closed)
      times = normalized_times(row[:open_time], row[:close_time], closed)
      { date: date, closed: closed, reason: optional_string(row[:reason], field: :reason, maximum: 200) }.merge(times)
    end

    def normalized_times(open_time, close_time, closed)
      return { open_time: nil, close_time: nil } if closed
      opening = required_string!(open_time, field: :open_time, maximum: 5)
      closing = required_string!(close_time, field: :close_time, maximum: 5)
      unless opening.match?(/\A(?:[01]\d|2[0-3]):[0-5]\d\z/) && closing.match?(/\A(?:[01]\d|2[0-3]):[0-5]\d\z/) && opening < closing
        raise ArgumentError, "Opening and closing times must be valid 24-hour times, with closing later than opening."
      end
      { open_time: opening, close_time: closing }
    end
  end
end
