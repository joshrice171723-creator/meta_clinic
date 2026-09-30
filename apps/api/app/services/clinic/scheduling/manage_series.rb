module Clinic
  module Scheduling
    class ManageSeries
      def self.preview_change(series:, actor:, from_sequence:, local_time:, room: nil)
        authorize!(series: series, actor: actor)
        policy = SitePolicy.current(practice: series.practice, site: series.site)
        raise ArgumentError, "Recurring changes are off for this site." unless policy&.recurrence_enabled?
        hour, minute = parse_local_time!(local_time)
        selected = upcoming(series, from_sequence)
        raise ArgumentError, "No future visits can be changed." if selected.empty?
        zone = ActiveSupport::TimeZone[series.timezone] || raise(ArgumentError, "The series timezone is unavailable.")
        selected.map do |occurrence|
          appointment = occurrence.appointment
          date = appointment.starts_at.in_time_zone(zone).to_date
          instant = unique_local_instant(zone, date, hour, minute)
          conflict = instant.nil? ? "This local time is missing or ambiguous. Choose a different time." : nil
          finish = instant && instant + (appointment.ends_at - appointment.starts_at)
          if instant
            begin
              if appointment.service_offering
                BookAppointment.offering_snapshot!(offering: appointment.service_offering, practice: series.practice,
                  site: series.site, clinician: series.booked_clinician, room: room || appointment.room,
                  visit_type: appointment.visit_type, visit_modality: appointment.visit_modality,
                  starts_at: instant, ends_at: finish, appointment_id: appointment.id)
              end
              CapacityGuard.check!(practice: series.practice, clinician: series.booked_clinician, site: series.site,
                patient: series.patient, room: room || appointment.room, starts_at: instant, ends_at: finish,
                appointment_id: appointment.id)
            rescue ArgumentError => error
              conflict = error.message
            end
          end
          { sequence: occurrence.sequence, appointment_id: appointment.id,
            starts_at: instant, ends_at: finish, room_id: (room || appointment.room)&.id,
            expected_updated_at: appointment.updated_at, conflict: conflict }
        end
      end

      def self.change_future(series:, actor:, from_sequence:, local_time:, room:, reason:, expected_versions:, request_key:)
        authorize = -> { authorize!(series: series, actor: actor) }
        authorize.call
        payload = { series_id: series.id, from_sequence: from_sequence, local_time: local_time,
          room_id: room&.id, reason: reason, expected_versions: expected_versions }
        outcome = Clinic::Idempotency.execute(practice: series.practice, actor: actor,
          operation_code: "appointments.series.change_future", request_key: request_key, payload: payload,
          authorization: authorize, authorization_action: "appointments.book",
          result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { AppointmentSeries.find_by(practice: practice, id: receipt.resource_id) }) do
          series.practice.lock!
          rows = preview_change(series: series, actor: actor, from_sequence: from_sequence,
            local_time: local_time, room: room)
          raise ArgumentError, "Resolve every future conflict before changing the series." if rows.any? { |row| row[:conflict] }
          verify_versions!(rows, expected_versions)
          before_visits = snapshots(series, rows)
          rows.each do |row|
            appointment = series.practice.appointments.find(row[:appointment_id])
            RescheduleAppointment.call(appointment: appointment, actor: actor,
              starts_at: row[:starts_at], ends_at: row[:ends_at], room: room || appointment.room,
              expected_updated_at: row[:expected_updated_at], request_key: "#{request_key}:#{row[:sequence]}")
          end
          record_change!(series: series, actor: actor, action: "change_future",
            from_sequence: from_sequence, reason: reason, before_visits: before_visits,
            after_visits: snapshots(series, rows))
          AuditRecorder.record!(practice: series.practice, actor: actor,
            action_code: "appointments.series.change_future", outcome: :committed,
            resource_version_ref: "appointment-series:#{series.id}:from-#{from_sequence}")
          series
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def self.cancel_future(series:, actor:, from_sequence:, reason:, expected_versions:, request_key:,
        cancellation_message_acknowledged:)
        raise ArgumentError, "Confirm that cancellation messages will not be sent automatically." unless cancellation_message_acknowledged
        authorize = -> { Authorization.authorize_with_legacy!(actor: actor, practice: series.practice,
          action: "appointments.status_transition", legacy_action: "appointments.write", site: series.site) }
        authorize.call
        payload = { series_id: series.id, from_sequence: from_sequence, reason: reason,
          expected_versions: expected_versions,
          cancellation_message_acknowledged: true }
        outcome = Clinic::Idempotency.execute(practice: series.practice, actor: actor,
          operation_code: "appointments.series.cancel_future", request_key: request_key, payload: payload,
          authorization: authorize, authorization_action: "appointments.status_transition",
          result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { AppointmentSeries.find_by(practice: practice, id: receipt.resource_id) }) do
          series.practice.lock!
          rows = upcoming(series, from_sequence).map do |occurrence|
            appointment = occurrence.appointment
            { sequence: occurrence.sequence, appointment_id: appointment.id,
              expected_updated_at: appointment.updated_at }
          end
          raise ArgumentError, "No future visits can be cancelled." if rows.empty?
          verify_versions!(rows, expected_versions)
          before_visits = snapshots(series, rows)
          rows.each do |row|
            appointment = series.practice.appointments.find(row[:appointment_id])
            TransitionAppointment.call(appointment: appointment, actor: actor, to: "cancelled",
              expected_status: appointment.status)
          end
          record_change!(series: series, actor: actor, action: "cancel_future",
            from_sequence: from_sequence, reason: reason, before_visits: before_visits,
            after_visits: snapshots(series, rows))
          AuditRecorder.record!(practice: series.practice, actor: actor,
            action_code: "appointments.series.cancel_future", outcome: :committed,
            resource_version_ref: "appointment-series:#{series.id}:from-#{from_sequence}")
          series
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def self.upcoming(series, from_sequence)
        raise ArgumentError, "Choose an occurrence in this series." unless from_sequence.is_a?(Integer) &&
          from_sequence.between?(1, series.occurrence_count)
        series.occurrences.includes(:appointment).where("sequence >= ?", from_sequence).order(:sequence).select do |occurrence|
          appointment = occurrence.appointment
          appointment && %w[scheduled confirmed].include?(appointment.status) &&
            appointment.starts_at > Current.business_time && appointment.encounter.nil?
        end
      end
      private_class_method :upcoming

      def self.verify_versions!(rows, expected_versions)
        versions = Array(expected_versions).to_h do |value|
          [ Integer(value[:appointment_id].to_s, 10), Time.iso8601(value[:updated_at].to_s) ]
        end
        unless rows.length == versions.length && rows.all? { |row| versions[row[:appointment_id]] == row[:expected_updated_at] }
          raise ArgumentError, "The series changed. Refresh its visits before retrying."
        end
      rescue ArgumentError, TypeError
        raise ArgumentError, "The series changed. Refresh its visits before retrying."
      end
      private_class_method :verify_versions!

      def self.snapshots(series, rows)
        ids = rows.map { |row| row[:appointment_id] }
        appointments = series.practice.appointments.where(id: ids).index_by(&:id)
        rows.map do |row|
          appointment = appointments.fetch(row[:appointment_id])
          { sequence: row[:sequence], appointment_id: appointment.id,
            starts_at: appointment.starts_at.iso8601(6), ends_at: appointment.ends_at.iso8601(6),
            room_id: appointment.room_id, status: appointment.status }
        end
      end
      private_class_method :snapshots

      def self.record_change!(series:, actor:, action:, from_sequence:, reason:, before_visits:, after_visits:)
        raise ArgumentError, "Enter a reason of 1–500 characters." unless reason.to_s.strip.length.between?(1, 500)

        membership = Clinic::Membership.active.find_by!(practice: series.practice, user: actor)
        series.series_changes.create!(practice: series.practice, action: action, from_sequence: from_sequence,
          written_by_membership: membership, reason: reason.to_s.strip,
          before_visits: before_visits, after_visits: after_visits)
      end
      private_class_method :record_change!

      def self.parse_local_time!(text)
        raise ArgumentError, "Choose a 24-hour local time." unless text.to_s.match?(/\A(?:[01]\d|2[0-3]):[0-5]\d\z/)

        text.split(":").map(&:to_i)
      end
      private_class_method :parse_local_time!

      def self.unique_local_instant(zone, date, hour, minute)
        local = Time.utc(date.year, date.month, date.day, hour, minute)
        periods = zone.tzinfo.periods_for_local(local)
        return nil unless periods.one?

        Time.at(local.to_i - periods.first.utc_total_offset).utc
      end
      private_class_method :unique_local_instant

      def self.authorize!(series:, actor:)
        Authorization.authorize_with_legacy!(actor: actor, practice: series.practice,
          action: "appointments.book", legacy_action: "appointments.write", site: series.site)
      end
      private_class_method :authorize!
    end
  end
end
