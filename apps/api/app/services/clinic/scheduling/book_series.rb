module Clinic
  module Scheduling
    class BookSeries
      MAX_DAYS = 180

      def self.preview(practice:, actor:, patient:, site:, room:, clinician:, visit_type:, service_offering:,
        starts_at:, ends_at:, visit_modality:, interval_weeks:, occurrence_count:, expected_policy_revision:,
        resolutions: [])
        authorize!(practice: practice, actor: actor, site: site)
        validate!(practice: practice, patient: patient, site: site, room: room, clinician: clinician,
          visit_type: visit_type, starts_at: starts_at, ends_at: ends_at, visit_modality: visit_modality,
          interval_weeks: interval_weeks, occurrence_count: occurrence_count,
          expected_policy_revision: expected_policy_revision)
        BookAppointment.offering_snapshot!(offering: service_offering, practice: practice, site: site,
          clinician: clinician, room: room, visit_type: visit_type, visit_modality: visit_modality,
          starts_at: starts_at, ends_at: ends_at, validate_resources: false) if service_offering
        Configuration::StarterProfile.require_service!(practice: practice, site:, service: "telehealth") if visit_modality == "video"
        rows = expand(practice: practice, site: site, room: room, starts_at: starts_at, ends_at: ends_at,
          interval_weeks: interval_weeks, occurrence_count: occurrence_count, resolutions: resolutions)
        raise ArgumentError, "Book at least one visit in the series." unless rows.any? { |row| row[:state] == "booked" }
        rows.map do |row|
          next row if row[:state] == "skipped" || row[:conflict]

          if rows.any? { |other| other != row && other[:state] == "booked" && other[:starts_at] &&
              row[:starts_at] < other[:ends_at] && row[:ends_at] > other[:starts_at] }
            next row.merge(conflict: "Two visits in this series overlap. Move or skip one date.")
          end

          begin
            BookAppointment.offering_snapshot!(offering: service_offering, practice: practice, site: site,
              clinician: clinician, room: row[:room], visit_type: visit_type,
              visit_modality: visit_modality, starts_at: row[:starts_at],
              ends_at: row[:ends_at]) if service_offering
            CapacityGuard.check!(practice: practice, clinician: clinician, site: site, patient: patient,
              room: row[:room], starts_at: row[:starts_at], ends_at: row[:ends_at])
            row.merge(conflict: nil)
          rescue ArgumentError => error
            row.merge(conflict: error.message)
          end
        end
      end

      def self.call(practice:, actor:, patient:, site:, room:, clinician:, visit_type:, service_offering:,
        starts_at:, ends_at:, visit_modality:, interval_weeks:, occurrence_count:, expected_policy_revision:,
        resolutions:, reason:, request_key:)
        authorize = -> { authorize!(practice: practice, actor: actor, site: site) }
        authorize.call
        payload = { patient_id: patient.id, site_id: site.id, room_id: room&.id, clinician_id: clinician.id,
          visit_type_id: visit_type.id, service_offering_id: service_offering&.id,
          starts_at: starts_at.utc.iso8601(6), ends_at: ends_at.utc.iso8601(6),
          visit_modality: visit_modality, interval_weeks: interval_weeks, occurrence_count: occurrence_count,
          expected_policy_revision: expected_policy_revision, resolutions: resolutions, reason: reason }
        outcome = Clinic::Idempotency.execute(practice: practice, actor: actor,
          operation_code: "appointments.series.book", request_key: request_key, payload: payload,
          authorization: authorize, authorization_action: "appointments.book",
          result_resource: ->(series) { series },
          resource_resolver: ->(practice:, receipt:) { AppointmentSeries.find_by(practice: practice, id: receipt.resource_id) }) do
          practice.lock!
          rows = preview(practice: practice, actor: actor, patient: patient, site: site, room: room,
            clinician: clinician, visit_type: visit_type, service_offering: service_offering,
            starts_at: starts_at, ends_at: ends_at, visit_modality: visit_modality,
            interval_weeks: interval_weeks, occurrence_count: occurrence_count,
            expected_policy_revision: expected_policy_revision, resolutions: resolutions)
          raise ArgumentError, "Resolve or skip every conflicting date before scheduling." if rows.any? { |row| row[:conflict] }
          raise ArgumentError, "Book at least one visit in the series." unless rows.any? { |row| row[:state] == "booked" }

          zone = site_timezone(practice, site)
          first_local = starts_at.in_time_zone(zone)
          membership = Clinic::Membership.active.find_by!(practice: practice, user: actor)
          series = AppointmentSeries.create!(practice: practice, site: site, patient: patient,
            booked_clinician: clinician, visit_type: visit_type, room: room, service_offering: service_offering,
            visit_modality: visit_modality, timezone: zone.tzinfo.name, starts_on: first_local.to_date,
            local_start_time: first_local.strftime("%H:%M"), duration_minutes: ((ends_at - starts_at) / 60).to_i,
            interval_weeks: interval_weeks, occurrence_count: occurrence_count,
            policy_revision: expected_policy_revision, created_by_membership: membership)
          rows.each do |row|
            appointment = if row[:state] == "booked"
              BookAppointment.call(practice: practice, actor: actor, patient: patient, site: site,
                room: row[:room], booked_clinician: clinician, visit_type: visit_type,
                service_offering: service_offering, starts_at: row[:starts_at], ends_at: row[:ends_at],
                visit_modality: visit_modality, reason: reason)
            end
            AppointmentSeriesOccurrence.create!(practice: practice, series: series,
              sequence: row[:sequence], original_date: row[:original_date], state: row[:state],
              appointment: appointment, skip_reason: row[:skip_reason],
              change_reason: row[:change_reason], resolved_by_membership: membership)
          end
          series
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def self.authorize!(practice:, actor:, site:)
        Authorization.authorize_with_legacy!(actor: actor, practice: practice,
          action: "appointments.book", legacy_action: "appointments.write", site: site)
      end
      private_class_method :authorize!

      def self.validate!(practice:, patient:, site:, room:, clinician:, visit_type:, starts_at:, ends_at:,
        visit_modality:, interval_weeks:, occurrence_count:, expected_policy_revision:)
        raise ArgumentError, "Choose records in the same clinic." unless
          [ patient, site, clinician, visit_type ].all? { |record| record&.practice_id == practice.id }
        raise ArgumentError, "Choose a room at this site." if room && (room.practice_id != practice.id || room.site_id != site.id)
        raise ArgumentError, "Choose an active visit type." if visit_type.retired_at
        raise ArgumentError, "Choose a future visit with a whole-minute duration." unless
          starts_at > Current.business_time && ends_at > starts_at && ((ends_at - starts_at) % 60).zero?
        raise ArgumentError, "Choose a supported visit format." unless %w[in_person video].include?(visit_modality)
        raise ArgumentError, "Video visits cannot reserve a physical room." if visit_modality == "video" && room
        raise ArgumentError, "Choose 2–12 visits every 1–4 weeks." unless
          occurrence_count.is_a?(Integer) && occurrence_count.between?(2, 12) &&
          interval_weeks.is_a?(Integer) && interval_weeks.between?(1, 4)
        raise ArgumentError, "The final visit must fall within 180 days." if
          interval_weeks * 7 * (occurrence_count - 1) > MAX_DAYS
        policy = SitePolicy.current(practice: practice, site: site)
        unless policy&.recurrence_enabled? && policy.revision == expected_policy_revision
          raise ArgumentError, "Recurring appointments are unavailable or this site policy changed."
        end
      end
      private_class_method :validate!

      def self.expand(practice:, site:, room:, starts_at:, ends_at:, interval_weeks:, occurrence_count:, resolutions:)
        zone = site_timezone(practice, site)
        first_local = starts_at.in_time_zone(zone)
        duration = ends_at - starts_at
        choices = Array(resolutions).index_by { |choice| Integer(choice[:sequence].to_s, 10) rescue nil }
        raise ArgumentError, "Resolve each occurrence at most once." unless choices.length == Array(resolutions).length
        raise ArgumentError, "An occurrence number is outside this series." unless choices.keys.all? { |key| key && key.between?(1, occurrence_count) }

        (1..occurrence_count).map do |sequence|
          original_date = first_local.to_date + (sequence - 1) * interval_weeks * 7
          choice = choices[sequence] || {}
          skip_reason = choice[:skip_reason].to_s.strip
          if skip_reason.present?
            raise ArgumentError, "A skip reason must be at most 500 characters." if skip_reason.length > 500
            { sequence: sequence, original_date: original_date, state: "skipped", skip_reason: skip_reason,
              change_reason: nil,
              room: nil, starts_at: nil, ends_at: nil, conflict: nil }
          else
            changed = choice[:starts_at].present? || choice[:ends_at].present? || choice[:room_id].present?
            change_reason = choice[:change_reason].to_s.strip.presence
            if changed && !change_reason.to_s.length.between?(1, 500)
              raise ArgumentError, "Enter a reason of 1–500 characters for each changed visit."
            end
            raise ArgumentError, "A change reason needs a changed visit." if change_reason && !changed
            selected_room = choice[:room_id].present? ? practice.rooms.find(Integer(choice[:room_id].to_s, 10)) : room
            instant = if choice[:starts_at].present?
              parse_instant!(choice[:starts_at])
            elsif sequence == 1
              starts_at
            else
              unique_local_instant(zone, original_date, first_local.hour, first_local.min)
            end
            if instant.nil?
              { sequence: sequence, original_date: original_date, state: "booked", skip_reason: nil,
                change_reason: change_reason,
                room: selected_room, starts_at: nil, ends_at: nil,
                conflict: "This local time is missing or ambiguous. Choose a time with an explicit offset or skip this visit." }
            else
              finish = choice[:ends_at].present? ? parse_instant!(choice[:ends_at]) : instant + duration
              if instant <= Current.business_time || finish <= instant || finish - instant > 24.hours ||
                  (instant.in_time_zone(zone).to_date - first_local.to_date).to_i > MAX_DAYS
                raise ArgumentError, "Choose future visits within the series horizon."
              end
              { sequence: sequence, original_date: original_date, state: "booked", skip_reason: nil,
                change_reason: change_reason,
                room: selected_room, starts_at: instant, ends_at: finish, conflict: nil }
            end
          end
        end
      rescue TypeError
        raise ArgumentError, "Review the occurrence dates, times, rooms, and skip reasons."
      end
      private_class_method :expand

      def self.parse_instant!(value)
        text = value.to_s
        raise ArgumentError, "An explicit timezone offset is required." unless text.match?(/(?:Z|[+-]\d{2}:\d{2})\z/)

        Time.iso8601(text)
      end
      private_class_method :parse_instant!

      def self.unique_local_instant(zone, date, hour, minute)
        local = Time.utc(date.year, date.month, date.day, hour, minute)
        periods = zone.tzinfo.periods_for_local(local)
        return nil unless periods.one?

        Time.at(local.to_i - periods.first.utc_total_offset).utc
      end
      private_class_method :unique_local_instant

      def self.site_timezone(practice, site)
        ActiveSupport::TimeZone[site.timezone_override.presence || practice.timezone] ||
          raise(ArgumentError, "The clinic timezone is unavailable.")
      end
      private_class_method :site_timezone
    end
  end
end
