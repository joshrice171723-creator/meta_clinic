module Clinic
  module Assistant
    class Scheduling
      class StaleOpening < StandardError; end

      def self.openings!(context:, practice:, actor:, date:, duration_minutes:, visit_type:, clinician:, requested_time: nil)
        Clinic::Authorization.authorize_with_legacy!(actor:, practice:, action: "appointments.read",
          legacy_action: "appointments.write", site: context.site)
        Clinic::Configuration::StarterProfile.require_visit!(practice:, site: context.site, visit_type:)
        calendar = Clinic::Scheduling::Calendar.new(practice:, site: context.site, date:, actor:,
          duration_minutes:, patient: context.patient, period: "day").call
        zone = ActiveSupport::TimeZone[calendar.fetch(:timezone)]
        slots = calendar.fetch(:days).flat_map { |day| day.fetch(:slots) }
          .select { |slot| slot.fetch(:clinician_id) == clinician.id }
        if requested_time.present?
          hour, minute = requested_time.split(":").map(&:to_i)
          slots.select! do |slot|
            local = Time.iso8601(slot.fetch(:starts_at)).in_time_zone(zone)
            local.hour == hour && local.min == minute
          end
        end

        clinician_label = clinician.display_name.presence || "Clinician"
        visit_type_label = visit_type.code
        opening_options = slots.first(40).map do |slot|
          starts_at = Time.iso8601(slot.fetch(:starts_at))
          ends_at = Time.iso8601(slot.fetch(:ends_at))
          room_id = nil
          {
            "opening_id" => SecureRandom.uuid,
            "arguments" => {
              "site_id" => context.site_id,
              "patient_id" => context.patient_id,
              "starts_at" => starts_at.utc.iso8601(6),
              "ends_at" => ends_at.utc.iso8601(6),
              "clinician_id" => clinician.id,
              "visit_type_id" => visit_type.id,
              "room_id" => room_id,
              "visit_modality" => "in_person",
              "duration_minutes" => duration_minutes
            },
            "record_versions" => record_versions(context:, visit_type:, clinician:, slot:),
            "display" => {
              "date" => starts_at.in_time_zone(zone).strftime("%A, %B %-d"),
              "starts_at" => starts_at.iso8601(6), "ends_at" => ends_at.iso8601(6),
              "time" => starts_at.in_time_zone(zone).strftime("%-I:%M %p"),
              "site_name" => FacilitySerializer.site(context.site)[:name] || context.site.code,
              "patient_name" => context.patient.display_name,
              "clinician_name" => clinician_label,
              "visit_type_name" => visit_type_label
            }
          }
        end
        context.update!(opening_options: opening_options)
        opening_options.map { |item| item.fetch("display").merge("opening_id" => item.fetch("opening_id")) }
      end

      def self.opening!(context, opening_id)
        Array(context.opening_options).find do |item|
          ActiveSupport::SecurityUtils.secure_compare(item.fetch("opening_id"), opening_id.to_s)
        end || raise(ActiveRecord::RecordNotFound)
      end

      def self.current_opening?(context:, arguments:, record_versions:, actor:)
        site = context.site
        patient = context.patient
        clinician = context.practice.clinician_profiles.find_by(id: arguments.fetch("clinician_id"))
        visit_type = context.practice.visit_types.active.find_by(id: arguments.fetch("visit_type_id"))
        return false unless clinician && visit_type && patient && site

        zone_name = site.timezone_override.presence || context.practice.timezone
        zone = ActiveSupport::TimeZone[zone_name]
        return false unless zone

        requested_start = Time.iso8601(arguments.fetch("starts_at")).in_time_zone(zone)
        requested_end = Time.iso8601(arguments.fetch("ends_at")).in_time_zone(zone)
        calendar = Clinic::Scheduling::Calendar.new(practice: context.practice, site:, date: requested_start.to_date,
          actor:, duration_minutes: arguments.fetch("duration_minutes"), patient:,
          period: "day").call
        zone = ActiveSupport::TimeZone[calendar.fetch(:timezone)]
        slot = calendar.fetch(:days).flat_map { |day| day.fetch(:slots) }.find do |candidate|
          start_time = Time.iso8601(candidate.fetch(:starts_at)).in_time_zone(zone)
          finish_time = Time.iso8601(candidate.fetch(:ends_at)).in_time_zone(zone)
          candidate.fetch(:clinician_id) == clinician.id && start_time == requested_start && finish_time == requested_end
        end
        return false unless slot

        record_versions == record_versions(context:, visit_type:, clinician:, slot:)
      rescue ArgumentError, ActiveRecord::RecordNotFound
        false
      end

      def self.record_versions(context:, visit_type:, clinician:, slot: nil, starts_at: nil, ends_at: nil)
        rules = slot ? Array(slot.dig(:provenance, :source_rules)) : []
        patient = context.patient.reload
        site = context.site.reload
        {
          "patient_record_version" => ContextRegistry.record_version(patient),
          "site_record_version" => ContextRegistry.record_version(site),
          "visit_type_record_version" => ContextRegistry.record_version(visit_type),
          "clinician_record_version" => ContextRegistry.record_version(clinician),
          "site_policy_revision" => Clinic::Scheduling::SitePolicy.current(practice: context.practice,
            site: context.site)&.revision,
          "capacity_rules" => rules.map { |rule| rule.slice(:id, :version).stringify_keys }
        }
      end

      private_class_method :record_versions
    end
  end
end
