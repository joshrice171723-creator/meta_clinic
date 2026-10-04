module Clinic
  module Configuration
    class ManageFacilities
      include Clinic::Api::RequestParameters

      def self.call(practice:, actor:, action:, site: nil, room: nil, department: nil, input:, request_key: nil, expected_updated_at: nil)
        new(practice:, actor:).call(action:, site:, room:, department:, input:, request_key:, expected_updated_at:)
      end

      def initialize(practice:, actor:)
        @practice, @actor = practice, actor
      end

      def call(action:, input:, site: nil, room: nil, department: nil, request_key: nil, expected_updated_at: nil)
        authorize!(site: %w[room_create room_update].include?(action) ? site : nil)
        input = input.to_h.with_indifferent_access
        resource = room || department || site
        execute = -> do
          ApplicationRecord.transaction do
            result = case action
            when "site_create"
              created = @practice.sites.create!(site_attributes(input))
              save_hours(created, input)
              %w[Room\ 1 Room\ 2].each { |code| created.rooms.create!(practice: @practice, code:, kind: "physical") }
              created
            when "site_update"
              current = @practice.sites.lock.find(site.id)
              assert_version!(current, expected_updated_at)
              current.update!(site_attributes(input, existing: current))
              if input.key?(:operating_hours) || input.key?(:hour_exceptions)
                save_hours(current, input)
                current.touch
              end
              current
            when "department_create"
              @practice.departments.find_or_create_by!(code: required_string!(input[:code], field: :code, maximum: 80))
            when "department_update"
              current = @practice.departments.lock.find(department.id)
              assert_version!(current, expected_updated_at)
              current.update!(code: required_string!(input[:code], field: :code, maximum: 80))
              current
            when "room_create"
              current = @practice.sites.find(site.id)
              current.rooms.create!(practice: @practice,
                code: required_string!(input[:code], field: :code, maximum: 80),
                kind: enum_param!(input[:kind].presence || "physical", field: :kind, allowed: %w[physical telehealth]))
            when "room_update"
              current_site = @practice.sites.find(site.id)
              current = current_site.rooms.lock.find(room.id)
              assert_version!(current, expected_updated_at)
              next_kind = input.key?(:kind) ? enum_param!(input[:kind], field: :kind, allowed: %w[physical telehealth]) : current.kind
              if next_kind != current.kind && current.appointments.exists?
                raise ArgumentError, "A room with appointments cannot change type. Add another room instead."
              end
              current.update!(code: input.key?(:code) ? required_string!(input[:code], field: :code, maximum: 80) : current.code, kind: next_kind)
              current
            else raise ArgumentError, "Unsupported facility operation."
            end
            AuditRecorder.record!(practice: @practice, actor: @actor,
              action_code: action == "department_create" ? "facilities.department.configure" : "facilities.#{action}",
              outcome: :committed, resource_version_ref: "#{result.class.name}/#{result.id}")
            result
          end
        end
        return execute.call if request_key.nil?
        outcome = Clinic::Idempotency.execute(practice: @practice, actor: @actor,
          operation_code: "facilities.#{action}", request_key:, resource:,
          payload: { site_id: site&.id, room_id: room&.id, department_id: department&.id,
            expected_updated_at: expected_updated_at&.iso8601(6), attributes: input },
          authorization_action: "facilities.write",
          authorization: -> { authorize!(site: %w[room_create room_update].include?(action) ? site : nil) },
          result_resource: ->(record) { record },
          resource_resolver: ->(practice:, receipt:) {
            klass = { "site_create" => Clinic::Site, "site_update" => Clinic::Site,
              "room_create" => Clinic::Room, "room_update" => Clinic::Room,
              "department_create" => Clinic::Department, "department_update" => Clinic::Department }.fetch(action)
            klass.where(practice:).find_by(id: receipt.resource_id)
          }, &execute)
        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      private

      def authorize!(site: nil)
        Clinic::Authorization.authorize_with_legacy!(practice: @practice, actor: @actor,
          action: "facilities.write", legacy_action: "appointments.write", site:)
      end

      def assert_version!(record, expected)
        raise ActiveRecord::StaleObjectError.new(record, "configure facility") if expected && record.updated_at != expected
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
        if !existing || attributes.fetch(:status, existing&.status) == "active"
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
          Clinic::SiteOperatingHour.where(practice_id: @practice.id, site_id: site.id).delete_all
          rows.each { |row| site.operating_hours.create!(row.merge(practice_id: @practice.id)) }
        end
        return unless input.key?(:hour_exceptions)

        rows = Array(input[:hour_exceptions]).map { |row| normalize_exception(row) }
        raise ArgumentError, "A facility can have only one exception per date." unless rows.map { |row| row[:date] }.uniq.length == rows.length
        Clinic::SiteHourException.where(practice_id: @practice.id, site_id: site.id).delete_all
        rows.each { |row| site.hour_exceptions.create!(row.merge(practice_id: @practice.id)) }
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
end
