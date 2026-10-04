module Clinic
  module Assistant
    module Workflows
      class Scheduling
        def self.field(key, label, type = "text", required: false, options: nil)
          { key:, label:, type:, required: }.tap { |item| item[:options] = options if options }
        end

        def self.definitions
          appointment = field("appointment", "Appointment", "record", required: true)
          time_fields = [field("starts_at", "Start time", "datetime", required: true), field("ends_at", "End time", "datetime", required: true)]
          clinician = field("clinician", "Clinician", "record", required: true)
          [
            definition("scheduling.appointments", "Find appointments", "read", [field("date", "Date", "date"), field("status", "Status", "select", options: Clinic::Appointment::TRANSITIONS.keys)]),
            definition("scheduling.appointment", "Appointment details", "read", [appointment], patient: true),
            definition("scheduling.reschedule", "Reschedule an appointment", "change", [appointment, *time_fields], patient: true,
              description: "Move an upcoming appointment within existing capacity. Clinician, location and visit type remain as reviewed."),
            definition("scheduling.status", "Update appointment status", "change", [appointment,
              field("status", "New status", "select", required: true, options: %w[confirmed no_show cancelled]),
              field("cancellation_acknowledged", "I understand no cancellation message is sent automatically", "boolean")], patient: true,
              description: "Record a status change. Cancellation may make the released slot available to the existing waitlist workflow."),
            definition("scheduling.check_in", "Check in for an appointment", "change", [appointment], patient: true,
              description: "Start the existing visit for the selected appointment and return its persisted encounter."),
            definition("scheduling.room", "Assign encounter room", "change", [field("room", "Room", "record", required: true)], patient: true, encounter: true),
            definition("scheduling.provider", "Assign encounter clinician", "change", [clinician], patient: true, encounter: true),
            definition("scheduling.intake_claim", "Claim intake work", "change", [], patient: true, encounter: true),
            definition("scheduling.intake_release", "Release my intake claim", "change", [], patient: true, encounter: true),
            definition("scheduling.waitlist_add", "Add patient to waitlist", "change", [clinician,
              field("visit_type", "Visit type", "record", required: true),
              field("earliest_at", "Earliest requested time", "datetime", required: true),
              field("latest_at", "Latest requested time", "datetime", required: true),
              field("duration_minutes", "Visit length in minutes", "number", required: true), field("reason", "Reason")], patient: true),
            definition("scheduling.waitlist_change", "Review a waitlist offer", "change", [field("entry", "Waitlist entry", "record", required: true),
              field("action", "Action", "select", required: true, options: %w[offer release requeue cancel accept]),
              field("starts_at", "Offer starts at", "datetime"), field("expires_at", "Offer expires at", "datetime"),
              field("patient_accepted", "The patient explicitly accepted this offer", "boolean")], patient: true),
            definition("scheduling.capacity", "Clinician hours and blocked time", "read", []),
            definition("scheduling.block", "Block clinician time", "change", [clinician, *time_fields,
              field("reason", "Reason", required: true), field("category", "Configured reason category", "record")],
              description: "Block time using the clinic's current policy. Existing appointments remain for staff to resolve.")
          ]
        end

        def self.definition(key, title, kind, fields, patient: false, encounter: false, description: nil)
          { key:, title:, kind:, fields:, domain: "Schedule", patient_required: patient, encounter_required: encounter,
            description: description || "Use the clinic's existing scheduling records and permissions." }
        end
        private_class_method :field, :definition

        def initialize(practice:, actor:, site:, patient:, encounter:)
          @practice, @actor, @site, @patient, @encounter = practice, actor, site, patient, encounter
        end

        def authorize!(key:, inputs:)
          definition!(key)
          action, legacy = case key
          when "scheduling.block" then ["facilities.write", nil]
          when "scheduling.provider" then ["encounters.assign_provider", nil]
          when "scheduling.intake_claim", "scheduling.intake_release" then ["intake.write", nil]
          when "scheduling.check_in", "scheduling.room" then ["encounters.write", nil]
          when "scheduling.status" then ["appointments.status_transition", "appointments.write"]
          when "scheduling.reschedule", "scheduling.waitlist_add", "scheduling.waitlist_change" then ["appointments.book", "appointments.write"]
          else ["appointments.read", "patients.read"]
          end
          if legacy
            Clinic::Authorization.authorize_with_legacy!(practice: @practice, actor: @actor, site: @site, action:, legacy_action: legacy)
          else
            Clinic::Authorization.authorize!(practice: @practice, actor: @actor, site: @site, action:)
          end
          if key == "scheduling.block"
            Clinic::Scheduling::CreateCapacityRule.authorize!(practice: @practice, actor: @actor, site: @site, kind: "block")
          end
          if definition!(key)[:patient_required]
            raise ArgumentError, "Select a patient." unless @patient
            patient_scope.find(@patient.id)
          end
        end

        def options(key:, field:, query:, inputs:)
          authorize!(key:, inputs:)
          options = case field
          when "appointment"
            appointment_scope.includes(:patient, :booked_clinician).order(starts_at: :desc).limit(50).map do |record|
              option(record, "#{local_time(record.starts_at)} · #{record.patient.display_name} · #{record.status.humanize}")
            end
          when "clinician"
            @practice.clinician_profiles.includes(membership: :user).order(:id).limit(100).select do |record|
              record.membership&.active? && record.membership.user.active?
            end.map { |record| option(record, record.display_name.presence || record.reference.presence || "Clinician") }
          when "visit_type"
            ids = Clinic::Configuration::StarterProfile.available_visit_type_ids(practice: @practice, site: @site)
            @practice.visit_types.active.where(id: ids).limit(100).map { |record| option(record, record.code) }
          when "room"
            @practice.rooms.where(site: @site).order(:code).limit(100).map { |record| option(record, record.code) }
          when "entry"
            waitlist_scope.order(created_at: :desc).limit(50).map do |record|
              option(record, "#{record.visit_type.code} · #{local_time(record.earliest_at)} · #{record.effective_state.humanize}")
            end
          when "category"
            policy = current_policy
            Array(policy&.block_categories).map do |category|
              { record_type: "SchedulingBlockCategory", record_id: "#{policy.id}:#{category.fetch('key')}",
                label: category.fetch("label"), version: policy.revision }
            end
          else []
          end
          return options if query.blank?
          options.select { |entry| entry.fetch(:label).downcase.include?(query.to_s.downcase) }
        end

        def resolve(key:, inputs:)
          authorize!(key:, inputs:)
          values = inputs.stringify_keys.dup
          values["_appointment"] = resolve_record(values["appointment"], "Clinic::Appointment", appointment_scope) if values["appointment"]
          values["_clinician"] = resolve_record(values["clinician"], "Clinic::ClinicianProfile", @practice.clinician_profiles) if values["clinician"]
          values["_visit_type"] = resolve_record(values["visit_type"], "Clinic::VisitType", @practice.visit_types.active) if values["visit_type"]
          values["_room"] = resolve_record(values["room"], "Clinic::Room", @practice.rooms.where(site: @site)) if values["room"]
          values["_entry"] = resolve_record(values["entry"], "Clinic::Scheduling::WaitlistEntry", waitlist_scope) if values["entry"]
          if definition!(key)[:encounter_required]
            raise ArgumentError, "Select an encounter at this location." unless @encounter && @encounter.patient_id == @patient&.id && @encounter.site_id == @site.id
            values["_encounter"] = @practice.encounters.find(@encounter.id)
          end
          %w[starts_at ends_at earliest_at latest_at expires_at].each do |field|
            values["_#{field}"] = zone.iso8601(values[field]) if values[field].present?
          end
          if key == "scheduling.status" && values["status"] == "cancelled" && values["cancellation_acknowledged"] != true
            raise ArgumentError, "Acknowledge that no cancellation message is sent automatically."
          end
          if key == "scheduling.waitlist_change"
            if values["action"] == "offer" && (!values["_starts_at"] || !values["_expires_at"])
              raise ArgumentError, "Choose the offer start and expiry times."
            end
            if values["action"] == "accept" && values["patient_accepted"] != true
              raise ArgumentError, "Confirm the patient explicitly accepted this offer."
            end
          end
          if key == "scheduling.block"
            policy = current_policy
            values["_policy"] = policy
            categories = Array(policy&.block_categories)
            raise ArgumentError, "That reason category is no longer available." if categories.empty? && values["category"].present?
            unless categories.empty?
              reference = values["category"].is_a?(Hash) ? values["category"].stringify_keys : {}
              category = categories.find { |row| reference["record_type"] == "SchedulingBlockCategory" && reference["record_id"].to_s == "#{policy.id}:#{row.fetch('key')}" }
              raise ArgumentError, "Choose a current configured reason category." unless category
              raise WorkflowExecution::Conflict, "The scheduling policy changed. Choose a current category." unless reference["version"] == policy.revision
              values["_category_key"] = category.fetch("key")
            end
          end
          values
        end

        def versions(key:, resolved:)
          values = resolved.select { |_name, value| value.is_a?(ApplicationRecord) }.transform_values { |record| version(record.reload) }
          values["patient"] = version(@patient.reload) if @patient
          if @encounter && key.start_with?("scheduling.intake_", "scheduling.provider")
            values["participants"] = @encounter.participants.order(:id).map { |record| [record.id, version(record)] }
          end
          values
        end

        def execute(key:, resolved:)
          authorize!(key:, inputs: resolved)
          request_key = resolved["_request_key"]
          appointment = resolved["_appointment"]
          case key
          when "scheduling.appointments"
            scope = appointment_scope
            if resolved["date"].present?
              day = Date.iso8601(resolved["date"])
              scope = scope.where(starts_at: zone.local(day.year, day.month, day.day)...zone.local(day.next_day.year, day.next_day.month, day.next_day.day))
            end
            scope = scope.where(status: resolved["status"]) if resolved["status"].present?
            result = table("Appointments", scope.includes(:patient, :booked_clinician, :visit_type, :room).order(:starts_at).limit(50).map { |row| appointment_row(row) })
            result[:sections].unshift({ fields: [{ label: "Matching appointments", value: scope.count }, { label: "Displayed", value: "First 50, ordered by start time" }] })
            result
          when "scheduling.appointment" then table("Appointment details", [appointment_row(appointment.reload)])
          when "scheduling.reschedule"
            record = Clinic::Scheduling::RescheduleAppointment.call(appointment:, actor: @actor,
              starts_at: resolved.fetch("_starts_at"), ends_at: resolved.fetch("_ends_at"), expected_updated_at: appointment.updated_at, request_key:)
            table("Rescheduled appointment", [appointment_row(record.reload)])
          when "scheduling.status"
            record = Clinic::Scheduling::TransitionAppointment.call(appointment:, actor: @actor, site: @site,
              to: resolved.fetch("status"), expected_status: appointment.status)
            table("Saved appointment status", [appointment_row(record.reload)])
          when "scheduling.check_in"
            record = Clinic::Scheduling::CreateEncounter.call(practice: @practice, actor: @actor, patient: @patient, appointment:, site: @site)
            encounter_result("Visit started", record.reload)
          when "scheduling.room"
            record = Clinic::Scheduling::AssignEncounterRoom.call(practice: @practice, actor: @actor, encounter: resolved.fetch("_encounter"), room_id: resolved.fetch("_room").id, request_key:)
            encounter_result("Room assignment saved", record.reload)
          when "scheduling.provider"
            encounter = resolved.fetch("_encounter")
            token = encounter.participants.queue_providers.current.order(id: :desc).first&.id&.to_s
            Clinic::Scheduling::AssignProvider.call(encounter:, actor: @actor, clinician_profile: resolved.fetch("_clinician"), request_key:, expected_token: token)
            encounter_result("Clinician assignment saved", encounter.reload)
          when "scheduling.intake_claim", "scheduling.intake_release"
            encounter = resolved.fetch("_encounter")
            token = encounter.participants.intake_owners.order(id: :desc).first&.id&.to_s
            method = key.end_with?("claim") ? :claim : :release
            Clinic::Scheduling::IntakeOwnership.public_send(method, encounter:, actor: @actor, request_key:, expected_token: token)
            encounter_result("Intake ownership updated", encounter.reload)
          when "scheduling.waitlist_add"
            attributes = { site: @site, patient: @patient, clinician: resolved.fetch("_clinician"), visit_type: resolved.fetch("_visit_type"),
              earliest_at: resolved.fetch("_earliest_at"), latest_at: resolved.fetch("_latest_at"), duration_minutes: resolved.fetch("duration_minutes"), reason: resolved["reason"] }
            record = Clinic::Scheduling::CreateWaitlistEntry.call(practice: @practice, actor: @actor, attributes:, request_key:,
              payload: resolved.reject { |name, _| name.start_with?("_") })
            waitlist_result(record.reload)
          when "scheduling.waitlist_change"
            record = resolved.fetch("_entry")
            attributes = { starts_at: resolved["_starts_at"], expires_at: resolved["_expires_at"], patient_accepted: resolved["patient_accepted"] }.compact
            record = Clinic::Scheduling::Waitlist.transition(entry: record, actor: @actor, action: resolved.fetch("action"),
              expected_version: record.lock_version, request_key:, attributes:)
            waitlist_result(record.reload)
          when "scheduling.capacity"
            rows = Clinic::Scheduling::CapacityRule.where(practice: @practice, site: @site, active: true).includes(:clinician).order(:id).limit(100).map do |record|
              { clinician: record.clinician.display_name, kind: record.kind, weekday: record.weekday,
                starts: record.starts_at ? local_time(record.starts_at) : minute_time(record.start_minute),
                ends: record.ends_at ? local_time(record.ends_at) : minute_time(record.end_minute), reason: record.reason }
            end
            table("Clinician hours and blocked time", rows)
          when "scheduling.block"
            record = Clinic::Scheduling::CreateCapacityRule.call(practice: @practice, actor: @actor,
              values: { kind: "block", site: @site, clinician: resolved.fetch("_clinician"), starts_at: resolved.fetch("_starts_at"), ends_at: resolved.fetch("_ends_at"), reason: resolved.fetch("reason") },
              request_key:, payload: resolved.reject { |name, _| name.start_with?("_") },
              expected_revision: resolved["_policy"]&.revision, category_key: resolved["_category_key"])
            table("Blocked time saved", [{ clinician: record.clinician.display_name, starts: local_time(record.starts_at), ends: local_time(record.ends_at), reason: record.reason,
              follow_up: "Existing appointments remain unchanged; review any affected visits in the schedule." }])
          else raise ArgumentError, "That scheduling action is unavailable."
          end
        end

        private

        def definition!(key)
          self.class.definitions.find { |entry| entry[:key] == key } || raise(ArgumentError, "That scheduling action is unavailable.")
        end

        def patient_scope
          action = ability.allowed_permission?("patients.read") ? :read : :read_identity
          @practice.patients.accessible_by(ability, action)
        end

        def appointment_scope
          scope = @practice.appointments.where(site: @site)
          scope = scope.accessible_by(ability, :read) if ability.allowed_permission?("appointments.read", any_site: true)
          scope = scope.where(patient: @patient) if @patient
          scope
        end

        def waitlist_scope
          Clinic::Scheduling::WaitlistEntry.where(practice: @practice, site: @site, patient: @patient)
        end

        def resolve_record(reference, type, scope)
          reference = reference.stringify_keys if reference.is_a?(Hash)
          raise ActiveRecord::RecordNotFound unless reference.is_a?(Hash) && reference["record_type"] == type
          record = scope.find(reference.fetch("record_id"))
          unless reference["version"] == version(record)
            raise WorkflowExecution::Conflict, "A selected record changed. Choose it again before preparing this action."
          end
          record
        end

        def option(record, label)
          { record_type: record.class.name, record_id: record.id, label:, version: version(record) }
        end

        def version(record)
          Clinic::Assistant::ContextRegistry.record_version(record)
        end

        def ability
          @ability ||= Ability.new(@actor, practice: @practice)
        end

        def zone
          ActiveSupport::TimeZone[@site.timezone_override.presence || @practice.timezone] || raise(ArgumentError, "Set a valid clinic timezone.")
        end

        def local_time(time)
          time&.in_time_zone(zone)&.strftime("%Y-%m-%d %H:%M %Z")
        end

        def minute_time(value)
          value.nil? ? nil : format("%02d:%02d", value / 60, value % 60)
        end

        def current_policy
          Clinic::Scheduling::OperationalPolicyVersion.current(practice: @practice, site: @site)
        end

        def appointment_row(record)
          { patient: record.patient.display_name, starts: local_time(record.starts_at), ends: local_time(record.ends_at), status: record.status,
            clinician: record.booked_clinician&.display_name, visit: record.visit_type&.code, room: record.room&.code }
        end

        def encounter_result(title, record)
          table(title, [{ patient: record.patient.display_name, status: record.status, started: local_time(record.started_at), room: record.room&.code }], source_path: "/clinic/patients/#{record.patient_id}/encounters/#{record.id}")
        end

        def waitlist_result(record)
          table("Saved waitlist entry", [{ patient: record.patient.display_name, state: record.effective_state, clinician: record.clinician.display_name,
            visit: record.visit_type.code, earliest: local_time(record.earliest_at), latest: local_time(record.latest_at), minutes: record.duration_minutes }])
        end

        def table(title, rows, source_path: "/clinic/schedule")
          columns = rows.first&.keys.to_a.map { |key| { key: key.to_s, label: key.to_s.humanize } }
          { title:, sections: [{ columns:, rows: rows.map(&:stringify_keys) }], source_path: }
        end
      end
    end
  end
end
