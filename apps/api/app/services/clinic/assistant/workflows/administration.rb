module Clinic
  module Assistant
    module Workflows
      class Administration
        LIMIT = 25
        PROFILE = Clinic::Configuration::PracticeFeatures
        READS = {
          "configuration.sites" => ["Clinic locations", "Read locations available to this account."],
          "configuration.site" => ["Selected location", "Read the selected location's address, hours, exceptions and rooms."],
          "configuration.departments" => ["Departments", "Read configured clinic departments."],
          "configuration.rooms" => ["Location rooms", "Read rooms at the selected location."],
          "configuration.visit_types" => ["Visit types", "Read clinic visit types and retirement status."],
          "configuration.service_offerings" => ["Service offerings", "Read service offerings configured for the selected location."],
          "configuration.profile" => ["Location profile", "Read saved specialty, services, assessments and setup status."],
          "configuration.profile_impacts" => ["Review profile consequences", "Read permission-scoped consequences before removing selected services or assessments."]
        }.freeze
        SITE_FIELDS = {
          "code" => ["Location code", 80], "name" => ["Location name", 120],
          "timezone_override" => ["Time zone (IANA name)", 80],
          "address_line1" => ["Address line 1", 120], "address_line2" => ["Address line 2", 120],
          "city" => ["City", 120], "state" => ["State", 120], "postal_code" => ["Postal code", 30],
          "country" => ["Country code", 2], "phone" => ["Phone", 40],
          "contact_name" => ["Contact name", 120], "contact_email" => ["Contact email", 320]
        }.freeze
        OFFERING_FIELDS = {
          "name" => ["Service name", "text", 160], "code" => ["Service code", "text", 50],
          "description" => ["Description", "text", 500],
          "contact_instructions" => ["Contact instructions", "text", 500],
          "referral_instructions" => ["Referral instructions", "text", 500],
          "duration_minutes" => ["Duration in minutes", "number", nil],
          "booking_required" => ["Booking required", "boolean", nil],
          "requires_room" => ["Room required", "boolean", nil],
          "public_visible" => ["Visible when published", "boolean", nil],
          "referral_required" => ["Referral required", "boolean", nil]
        }.freeze

        def self.field(key, label, type, required = false, **attributes)
          { key:, label:, type:, required: }.merge(attributes)
        end

        def self.scope_fields
          [field("service_scope", "Selected services", "array", true, max_items: PROFILE::SERVICE_SCOPE.length,
            items: { type: "select", options: PROFILE::SERVICE_SCOPE.map { |code| { value: code, label: code.humanize } } }),
           field("assessment_scope", "Selected assessments", "array", true, max_items: PROFILE::ASSESSMENT_SCOPE.length,
            items: { type: "select", options: PROFILE::ASSESSMENT_SCOPE.map { |code| { value: code, label: code.humanize } } })]
        end

        def self.definitions
          reads = READS.map do |key, (title, description)|
            { key:, title:, description:, domain: "configuration", kind: "read",
              fields: key == "configuration.profile_impacts" ? scope_fields : [],
              patient_required?: false, encounter_required?: false }
          end
          changes = []
          %w[create update].each do |action|
            fields = SITE_FIELDS.map do |key, (label, maximum)|
              field(key, label, "text", action == "create" && %w[code name address_line1 city state postal_code].include?(key), max_length: maximum)
            end
            fields << field("status", "Location status", "select", false, options: %w[draft active temporarily_closed retired])
            changes << ["site_#{action}", "#{action.capitalize} location", "Save supplied address and location settings using the existing facility operation.", fields]
          end
          changes << ["site_hours_save", "Save one day's hours", "Save hours for one weekday and preserve all other weekdays.",
            [field("day_of_week", "Day of week", "select", true,
              options: Date::DAYNAMES.each_with_index.map { |name, day| { value: day.to_s, label: name } }),
             field("closed", "Closed all day", "boolean", true),
             field("open_time", "Opening time (HH:MM)", "text", false, max_length: 5),
             field("close_time", "Closing time (HH:MM)", "text", false, max_length: 5)]]
          changes << ["site_exception_save", "Save a date's hours", "Save an exception for one date and preserve all other dates.",
            [field("date", "Date", "date", true), field("closed", "Closed all day", "boolean", true),
             field("open_time", "Opening time (HH:MM)", "text", false, max_length: 5),
             field("close_time", "Closing time (HH:MM)", "text", false, max_length: 5),
             field("reason", "Reason", "text", false, max_length: 200)]]
          %w[create update].each do |action|
            changes << ["department_#{action}", "#{action.capitalize} department", "Save a named clinic department.",
              (action == "update" ? [field("department", "Department", "record", true)] : []) +
                [field("code", "Department name", "text", true, max_length: 80)]]
            changes << ["room_#{action}", "#{action.capitalize} room", "Save a room at the selected location, preserving the existing appointment restriction on type changes.",
              (action == "update" ? [field("room", "Room", "record", true)] : []) +
                [field("code", "Room name", "text", action == "create", max_length: 80),
                 field("kind", "Room type", "select", false, options: %w[physical telehealth])]]
          end
          changes << ["visit_type_create", "Create visit type", "Create a clinic visit type.",
            [field("code", "Visit type name", "text", true, max_length: 80)]]
          changes << ["visit_type_update", "Update visit type", "Revise the name or active status using the existing visit type operation.",
            [field("visit_type", "Visit type", "record", true), field("code", "Visit type name", "text", false, max_length: 80),
             field("active", "Active", "boolean", false)]]
          changes << ["visit_type_retire", "Retire visit type", "Retire a selected visit type while preserving its history.",
            [field("visit_type", "Visit type", "record", true)]]
          %w[create revise].each do |action|
            fields = (action == "revise" ? [field("offering", "Draft service offering", "record", true)] : []) +
              OFFERING_FIELDS.map { |key, (label, type, maximum)| field(key, label, type, action == "create" && key == "name", **(maximum ? { max_length: maximum } : {})) }
            fields += [field("modality", "Modality", "select", false, options: %w[in_person video either]),
              field("visit_type", "Visit type", "record"), field("billing_service", "Billing service", "record"),
              field("clinician", "Add eligible clinician", "record")]
            changes << ["service_offering_draft_#{action}", "#{action.capitalize} service offering draft",
              "Save a draft for the selected location; publication remains in the service catalog.", fields]
          end
          changes << ["profile_save", "Save location profile", "Save selected specialty, services and assessments with existing protected-change and removal review gates.",
            [field("clinic_type", "Clinic specialty", "select", true, options: PROFILE::CLINIC_TYPES),
             field("insurance_workflows_enabled", "Insurance workflows enabled", "boolean", true)] + scope_fields +
              [field("reviewed_consequences", "I reviewed the profile consequences", "boolean")]]
          changes << ["profile_finalize", "Finalize saved location setup", "Finalize the saved profile after the existing active-location and visit-type requirements are satisfied.", []]
          reads + changes.map do |suffix, title, description, fields|
            { key: "configuration.#{suffix}", title:, description:, domain: "configuration", kind: "change", fields:,
              patient_required?: false, encounter_required?: false }
          end
        end

        def initialize(practice:, actor:, site:, patient:, encounter:)
          @practice, @actor, @site = practice, actor, site
        end

        def authorize!(key:, inputs:)
          definition = definition!(key)
          require_site! unless %w[configuration.sites configuration.departments configuration.visit_types
            configuration.site_create configuration.department_create configuration.department_update
            configuration.visit_type_create configuration.visit_type_update configuration.visit_type_retire].include?(key)
          if key.start_with?("configuration.profile")
            Clinic::Authorization.authorize!(practice: @practice, actor: @actor, site: @site,
              action: key == "configuration.profile" ? "facilities.read" : "facilities.write")
          else
            writing = definition[:kind] == "change"
            global_read = %w[configuration.sites configuration.departments configuration.visit_types].include?(key)
            Clinic::Authorization.authorize_with_legacy!(practice: @practice, actor: @actor,
              action: writing ? "facilities.write" : "facilities.read",
              legacy_action: writing ? "appointments.write" : "appointments.book",
              site: (writing && key.start_with?("configuration.room_")) || (!writing && !global_read) ? @site : nil,
              any_site: !writing && global_read)
          end
        end

        def options(key:, field:, query:, inputs:)
          authorize!(key:, inputs:)
          return [] unless definition!(key)[:fields].any? { |item| item[:key] == field && item[:type] == "record" }
          relation, column = case field
          when "room" then [require_site!.rooms.where(practice: @practice), :code]
          when "department" then [@practice.departments, :code]
          when "visit_type" then [@practice.visit_types, :code]
          when "billing_service" then [@practice.billing_services, :name]
          when "clinician"
            # Display names are encrypted; filter decrypted bounded choices rather
            # than running a text predicate against ciphertext.
            text = query.to_s.strip.downcase
            return @practice.clinician_profiles.includes(:membership).order(:id).limit(100).filter_map do |record|
              label = record.display_name.presence || record.reference.presence || "Clinician"
              next unless text.empty? || label.downcase.include?(text)
              { record_type: record.class.name, record_id: record.id, label:, version: ContextRegistry.record_version(record) }
            end.first(LIMIT)
          when "offering" then [offering_scope.where(status: "draft"), :name]
          else return []
          end
          text = query.to_s.strip
          relation = relation.where("#{relation.klass.table_name}.#{column} ILIKE ?", "%#{relation.klass.sanitize_sql_like(text)}%") if text.present?
          relation.order(column, :id).limit(LIMIT).map do |record|
            { record_type: record.class.name, record_id: record.id,
              label: record.public_send(column), version: ContextRegistry.record_version(record) }
          end
        end

        def resolve(key:, inputs:)
          authorize!(key:, inputs:)
          result = inputs.deep_dup
          result["_site"] = @practice.sites.find(@site.id) if @site
          definitions = definition!(key)[:fields]
          definitions.select { |field| field[:type] == "record" }.each do |field|
            name = field[:key]
            next unless result[name]
            scope, klass = case name
            when "room" then [result.fetch("_site").rooms.where(practice: @practice), Clinic::Room]
            when "department" then [@practice.departments, Clinic::Department]
            when "visit_type" then [@practice.visit_types, Clinic::VisitType]
            when "billing_service" then [@practice.billing_services, Clinic::BillingService]
            when "clinician" then [@practice.clinician_profiles, Clinic::ClinicianProfile]
            when "offering" then [offering_scope.where(status: "draft"), Clinic::ServiceOffering]
            end
            ref = result.fetch(name)
            raise ActiveRecord::RecordNotFound, "That selection is unavailable." unless ref.is_a?(Hash) && ref["record_type"] == klass.name
            record = scope.find(ref.fetch("record_id"))
            unless ref["version"].to_s == ContextRegistry.record_version(record).to_s
              raise ActiveRecord::StaleObjectError.new(record, "use configuration selection")
            end
            result["_#{name}"] = record
          end
          if %w[configuration.site_update configuration.room_update configuration.visit_type_update configuration.service_offering_draft_revise].include?(key)
            fields = definitions.reject { |field| field[:key] == "offering" || (key == "configuration.visit_type_update" && field[:key] == "visit_type") || field[:key] == "room" }
            raise ArgumentError, "Provide at least one setting to update." unless fields.any? { |field| result.key?(field[:key]) }
          end
          if key.start_with?("configuration.profile")
            result["_profile"] = PROFILE.snapshot(practice: @practice, site: result.fetch("_site"))
            profile = result.fetch("_profile")
            if key == "configuration.profile_finalize" && !profile[:configured]
              raise ArgumentError, "Save the location specialty and service selections before finalizing setup."
            end
            if %w[configuration.profile_save configuration.profile_impacts].include?(key)
              result["_impact"] = Clinic::Configuration::ServiceDisablePreview.call(practice: @practice, actor: @actor,
                site: result.fetch("_site"), service_scope: result.fetch("service_scope"),
                assessment_scope: result.fetch("assessment_scope"), expected_revision: profile.fetch(:revision))
              if key == "configuration.profile_save" && removal_review_required?(result)
                unless result["reviewed_consequences"] == true
                  raise ArgumentError, "Read Review profile consequences for these selections, then acknowledge that review before preparing the change."
                end
                unless result.fetch("_impact").fetch(:review_complete)
                  raise WorkflowRegistry::Gated, "Required profile consequences remain unknown, restricted or unavailable. Retain the removed selection or review its sources with an authorized domain reader."
                end
              end
            end
          end
          result
        end

        def versions(key:, resolved:)
          refs = {}
          resolved.each do |name, record|
            refs[name] = ContextRegistry.record_version(record.reload) if name.start_with?("_") && record.is_a?(ApplicationRecord)
          end
          if (site = resolved["_site"])
            refs["hours"] = site.operating_hours.order(:id).pluck(:id, :updated_at).map { |id, at| [id, at.iso8601(6)] }
            refs["exceptions"] = site.hour_exceptions.order(:id).pluck(:id, :updated_at).map { |id, at| [id, at.iso8601(6)] }
          end
          refs["profile_revision"] = resolved["_profile"][:revision] if resolved["_profile"]
          refs["impact_digest"] = resolved["_impact"][:impact_digest] if resolved["_impact"]
          if key == "configuration.profile_finalize"
            refs["active_visit_types"] = @practice.visit_types.active.order(:id).pluck(:id, :updated_at).map { |id, at| [id, at.iso8601(6)] }
          end
          if (offering = resolved["_offering"])
            refs["offering_sites"] = offering.offering_sites.order(:id).pluck(:id, :site_id)
            refs["offering_clinicians"] = offering.offering_clinicians.order(:id).pluck(:id, :clinician_id)
          end
          refs
        end

        def preview(key:, resolved:)
          return [] unless key == "configuration.profile_save"
          impact_fields(resolved.fetch("_impact"))
        end

        def execute(key:, resolved:)
          title = definition!(key)[:title]
          case key
          when "configuration.sites"
            ability = Ability.new(@actor, practice: @practice)
            scope = @practice.sites
            unless ability.practice_scope_for?("facilities.read") || ability.practice_scope_for?("appointments.book")
              scope = scope.where(id: ability.accessible_site_ids)
            end
            sites = scope.order(:code, :id).limit(100).select do |site|
              ability.allowed_permission?("facilities.read", site:) || ability.allowed_permission?("appointments.book", site:)
            end.first(LIMIT)
            rows_result(title, sites.map { |site| site_display(site) })
          when "configuration.site" then site_result(title, resolved.fetch("_site"))
          when "configuration.departments"
            rows_result(title, @practice.departments.order(:code, :id).limit(LIMIT).map { |record| FacilitySerializer.department(record).except(:id) })
          when "configuration.rooms"
            rows_result(title, resolved.fetch("_site").rooms.where(practice: @practice).order(:code, :id).limit(LIMIT).map { |record| FacilitySerializer.room(record).except(:id, :site_id) })
          when "configuration.visit_types"
            rows_result(title, @practice.visit_types.order(:code, :id).limit(LIMIT).map { |record| FacilitySerializer.visit_type(record).except(:id) })
          when "configuration.service_offerings"
            rows_result(title, offering_scope.includes(:visit_type).order(:name, :id).limit(LIMIT).map { |record| offering_display(record) })
          when "configuration.profile" then profile_result(title, resolved.fetch("_profile"))
          when "configuration.profile_impacts" then impact_result(title, resolved.fetch("_impact"))
          when "configuration.site_create", "configuration.site_update"
            site = facility(key.delete_prefix("configuration."), resolved, attrs: permitted(resolved, SITE_FIELDS.keys + ["status"]))
            site_result(title, site)
          when "configuration.site_hours_save"
            site = resolved.fetch("_site")
            day = Integer(resolved.fetch("day_of_week"), 10)
            rows = site.operating_hours.order(:day_of_week, :id).map { |row| FacilitySerializer.operating_hour(row).except(:id) }
            rows.reject! { |row| row[:day_of_week] == day }
            rows << { day_of_week: day, closed: resolved.fetch("closed"), open_time: resolved["open_time"], close_time: resolved["close_time"] }
            site_result(title, facility("site_update", resolved, attrs: { operating_hours: rows }))
          when "configuration.site_exception_save"
            site = resolved.fetch("_site")
            rows = site.hour_exceptions.order(:date, :id).map { |row| FacilitySerializer.hour_exception(row).except(:id) }
            rows.reject! { |row| row[:date] == resolved.fetch("date") }
            rows << permitted(resolved, %w[date closed open_time close_time reason])
            site_result(title, facility("site_update", resolved, attrs: { hour_exceptions: rows }))
          when "configuration.department_create", "configuration.department_update", "configuration.room_create", "configuration.room_update"
            record = facility(key.delete_prefix("configuration."), resolved, attrs: permitted(resolved, %w[code kind]))
            data = record.is_a?(Clinic::Room) ? FacilitySerializer.room(record).except(:id, :site_id) : FacilitySerializer.department(record).except(:id)
            fields_result(title, data, "/clinic/settings")
          when "configuration.visit_type_create", "configuration.visit_type_update", "configuration.visit_type_retire"
            input = permitted(resolved, %w[code active]).merge(request_key: resolved.fetch("_request_key"))
            input[:active] = false if key.end_with?("_retire")
            outcome = if key.end_with?("_create")
              Clinic::Configuration::ManageVisitType.create(practice: @practice, actor: @actor, input:)
            else
              record = resolved.fetch("_visit_type")
              Clinic::Configuration::ManageVisitType.update(practice: @practice, actor: @actor, visit_type: record, input:, expected_updated_at: record.updated_at)
            end
            fields_result(title, FacilitySerializer.visit_type(outcome.value).except(:id), "/clinic/settings")
          when "configuration.service_offering_draft_create", "configuration.service_offering_draft_revise"
            attributes = permitted(resolved, OFFERING_FIELDS.keys + ["modality"])
            %w[visit_type billing_service].each { |name| attributes["#{name}_id".to_sym] = resolved.fetch("_#{name}").id if resolved["_#{name}"] }
            if key.end_with?("_create")
              attributes[:site_ids] = [resolved.fetch("_site").id]
              attributes[:clinician_ids] = [resolved.fetch("_clinician").id] if resolved["_clinician"]
              result = Clinic::Configuration::ManageServiceOffering.create(practice: @practice, actor: @actor,
                request_key: resolved.fetch("_request_key"), attributes:)
            else
              offering = resolved.fetch("_offering")
              attributes[:clinician_ids] = (offering.clinicians.pluck(:id) + [resolved.fetch("_clinician").id]).uniq if resolved["_clinician"]
              result = Clinic::Configuration::ManageServiceOffering.update(practice: @practice, actor: @actor, offering:,
                request_key: resolved.fetch("_request_key"), lock_version: offering.lock_version, attributes:)
            end
            fields_result(title, offering_display(result.offering), "/clinic/settings")
          when "configuration.profile_save", "configuration.profile_finalize"
            current = resolved.fetch("_profile")
            saving = key == "configuration.profile_save"
            snapshot = PROFILE.revise(practice: @practice, actor: @practice.memberships.active.find_by!(user: @actor),
              site: resolved.fetch("_site"), request_key: resolved.fetch("_request_key"), expected_revision: current.fetch(:revision),
              clinic_type: saving ? resolved.fetch("clinic_type") : current.fetch(:clinic_type),
              insurance_workflows_enabled: saving ? resolved.fetch("insurance_workflows_enabled") : current.fetch(:insurance_workflows_enabled),
              service_scope: saving ? resolved.fetch("service_scope") : current.fetch(:service_scope),
              assessment_scope: saving ? resolved.fetch("assessment_scope") : current.fetch(:assessment_scope),
              finalize: !saving, expected_impact_digest: saving && removal_review_required?(resolved) ? resolved.fetch("_impact").fetch(:impact_digest) : nil)
            profile_result(title, snapshot)
          else raise WorkflowRegistry::Unavailable, "That configuration workflow is unavailable."
          end
        end

        private

        def definition!(key)
          self.class.definitions.find { |entry| entry[:key] == key } || raise(WorkflowRegistry::Unavailable, "That configuration workflow is unavailable.")
        end

        def require_site!
          raise WorkflowRegistry::Gated, "Select a clinic location to use this workflow." unless @site && @site.practice_id == @practice.id
          @site
        end

        def offering_scope
          @practice.service_offerings.joins(:offering_sites)
            .where(clinic_service_offering_sites: { site_id: require_site!.id }).distinct
        end

        def permitted(resolved, keys)
          keys.each_with_object({}) { |key, attrs| attrs[key.to_sym] = resolved[key] if resolved.key?(key) }
        end

        def facility(action, resolved, attrs:)
          record = resolved["_room"] || resolved["_department"] || resolved["_site"]
          Clinic::Configuration::ManageFacilities.call(practice: @practice, actor: @actor, action:,
            site: action == "site_create" ? nil : resolved["_site"], room: resolved["_room"], department: resolved["_department"],
            input: attrs, request_key: resolved.fetch("_request_key"), expected_updated_at: record&.updated_at)
        end

        def removal_review_required?(resolved)
          current = resolved.fetch("_profile")
          (current[:finalized] && (current[:service_scope] - resolved.fetch("service_scope")).any?) ||
            (current[:assessment_scope] - resolved.fetch("assessment_scope")).any?
        end

        def site_display(site)
          FacilitySerializer.site(site).except(:id)
        end

        def offering_display(offering)
          payload = Clinic::ServiceOfferingSerializer.call(offering)
          payload.slice(:name, :code, :description, :status, :duration_minutes, :modality, :booking_required,
            :requires_room, :public_visible, :referral_required, :contact_instructions, :referral_instructions)
            .merge(visit_type: offering.visit_type&.code, billing_service: offering.billing_service&.name,
              eligible_locations: offering.sites.order(:code).pluck(:name).join(", "),
              eligible_clinicians: offering.clinicians.order(:id).map { |clinician| clinician.display_name.presence || clinician.reference.presence || "Clinician" }.join(", "))
        end

        def site_result(title, site)
          detail = FacilitySerializer.site(site.reload, detail: true)
          { title:, sections: [
            { fields: to_fields(detail.except(:id, :operating_hours, :hour_exceptions, :rooms)) },
            row_section("Operating hours", detail[:operating_hours].map { |row| row.except(:id).merge(day_of_week: Date::DAYNAMES.fetch(row[:day_of_week])) }),
            row_section("Date exceptions", detail[:hour_exceptions].first(LIMIT).map { |row| row.except(:id) }),
            row_section("Rooms", detail[:rooms].first(LIMIT).map { |row| row.except(:id, :site_id) })
          ], source_path: "/clinic/settings" }
        end

        def profile_result(title, snapshot)
          fields_result(title, snapshot.slice(:clinic_type, :service_scope, :assessment_scope,
            :insurance_workflows_enabled, :configured, :finalized, :finalized_at, :revision, :change_handoff), "/clinic/settings")
        end

        def impact_fields(impact)
          entries = [{ label: "Required consequence review complete", value: impact[:review_complete] }]
          (impact.fetch(:services) + impact.fetch(:assessments)).each do |row|
            name = (row[:label] || row[:service] || row[:assessment]).to_s.humanize
            metrics = Array(row[:metrics]).map do |metric|
              count = metric[:status] == "available" ? metric[:count] : metric[:status].to_s.humanize
              "#{metric[:label]}: #{count}"
            end.join("; ")
            entries << { label: "#{name} consequences", value: [row[:effect], "Review status: #{row[:status]}", metrics, *Array(row[:limits])].compact.join("\n") }
          end
          Array(impact[:limitations]).each { |limit| entries << { label: "Consequence review limit", value: limit } }
          entries << { label: "Existing work", value: impact[:preservation] }
          entries
        end

        def impact_result(title, impact)
          overview = impact.slice(:review_complete, :coverage, :limitations, :preservation)
          sections = [{ fields: to_fields(overview) }]
          (impact.fetch(:services) + impact.fetch(:assessments)).each_slice(3) do |categories|
            fields = categories.flat_map do |row|
              name = (row[:label] || row[:service] || row[:assessment]).to_s.humanize
              [{ label: "#{name} effect", value: row[:effect] },
               { label: "#{name} review", value: "#{row[:status]}; required sources complete: #{row[:review_complete]}" },
               { label: "#{name} limits", value: Array(row[:limits]).join("\n") }]
            end
            rows = categories.flat_map do |row|
              Array(row[:metrics]).map do |metric|
                metric.slice(:label, :status, :count, :note, :required)
                  .merge(category: (row[:label] || row[:service] || row[:assessment]).to_s.humanize)
              end
            end
            sections << row_section("Recorded consequences", rows).merge(fields:)
          end
          { title:, sections:, source_path: "/clinic/settings" }
        end

        def rows_result(title, rows)
          { title:, sections: [row_section(nil, rows)], source_path: "/clinic/settings" }
        end

        def row_section(title, rows)
          columns = rows.flat_map(&:keys).uniq.map { |key| { key: key.to_s, label: key.to_s.humanize } }
          { title:, columns:, rows: rows.map { |row| row.transform_values { |value| display(value) } } }
        end

        def fields_result(title, values, path)
          { title:, sections: [{ fields: to_fields(values) }], source_path: path }
        end

        def to_fields(values)
          values.map { |key, value| { label: key.to_s.humanize, value: display(value) } }
        end

        def display(value)
          case value
          when Array then value.map { |item| item.to_s.humanize }.join(", ")
          when Time, Date, DateTime then value.iso8601
          else value
          end
        end
      end
    end
  end
end
