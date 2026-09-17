module Clinic
  module Scheduling
    # An ephemeral projection of the existing schedule rules and appointments.
    # Slots are not persisted reservations; BookAppointment rechecks under locks.
    class Calendar
      SLOT_MINUTES = 30

      def initialize(practice:, site:, date:, actor:)
        @practice, @site, @actor = practice, site, actor
        @zone = ActiveSupport::TimeZone[practice.timezone]
        raise ArgumentError, "The clinic timezone is unavailable." unless @zone

        @first = date.beginning_of_month
        @last = date.end_of_month
        @start = midnight(@first)
        @finish = midnight(@last.next_day)
        @rules = CapacityRule.where(practice: practice, active: true).to_a
        @appointments = practice.appointments.where("starts_at < ? AND ends_at > ?", @finish, @start)
          .includes(:booked_clinician, :visit_type, :room, encounter: %i[notes observations participants], patient: :communication_endpoints).to_a
        @busy = @appointments.select { |a| %w[scheduled confirmed].include?(a.status) }
        @offers = WaitlistEntry.where(practice: practice, state: "offered")
          .where("offer_expires_at > ? AND offer_starts_at < ? AND offer_ends_at > ?", Current.business_time, @finish, @start).to_a
        @hours = site.operating_hours.to_a
        @exceptions = site.hour_exceptions.where(date: @first.prev_day..@last.next_day).index_by(&:date)
        @clinicians = practice.clinician_profiles.order(:id).to_a
        @rooms = practice.rooms.where(site: site).order(:code).to_a
      end

      def call
        visible = @appointments.select { |a| a.site_id == @site.id }
        days = (@first..@last).map do |date|
          visits = visible.select { |a| a.starts_at.in_time_zone(@zone).to_date == date }
          slots = slots_for(date)
          {
            date: date.iso8601, scheduled: visits.count { |a| a.status == "scheduled" },
            confirmed: visits.count { |a| a.status == "confirmed" },
            available: configured? ? slots.length : nil,
            conflicts: visits.count { |a| conflict?(a) }, slots: slots,
            appointments: visits.map { |a| serialize(a) }
          }
        end
        { month: @first.strftime("%Y-%m"), as_of: Current.business_time.iso8601(6), timezone: @practice.timezone, site_id: @site.id,
          slot_minutes: SLOT_MINUTES, capacity_configured: configured?,
          policy: { recurrence: "not_configured", overbook: "not_configured", external_sync: "read_only_export" },
          days: days,
          clinicians: @clinicians.map { |c| { id: c.id, name: c.display_name.presence || c.reference.presence || "Clinician ##{c.id}" } },
          rooms: @rooms.map { |r| { id: r.id, name: r.code } } }
      end

      private

      def midnight(date)
        @zone.local(date.year, date.month, date.day)
      end

      def configured?
        @rules.any? { |r| r.kind == "weekly" && r.site_id == @site.id }
      end

      def slots_for(date)
        slots = []
        @rules.select { |r| r.kind == "weekly" && r.site_id == @site.id && r.weekday == date.wday }.each do |rule|
          (rule.start_minute...rule.end_minute).step(SLOT_MINUTES) do |minute|
            next if minute + SLOT_MINUTES > rule.end_minute

            start = @zone.local(date.year, date.month, date.day, minute / 60, minute % 60)
            finish = start + SLOT_MINUTES.minutes
            # Do not offer nonexistent/shifted local times at daylight-saving boundaries.
            next unless start.hour * 60 + start.min == minute && finish.in_time_zone(@zone).to_date == date
            next unless site_open?(start, finish)
            next if @rules.any? { |r| r.kind == "block" && r.clinician_id == rule.clinician_id && overlap?(start, finish, r.starts_at, r.ends_at) }
            next if @busy.any? { |a| a.booked_clinician_id == rule.clinician_id && overlap?(start, finish, a.starts_at, a.ends_at) }
            next if @offers.any? { |o| o.clinician_id == rule.clinician_id && overlap?(start, finish, o.offer_starts_at, o.offer_ends_at) }

            rooms = @rooms.reject { |room| @busy.any? { |a| a.room_id == room.id && overlap?(start, finish, a.starts_at, a.ends_at) } }
            slots << { starts_at: start.iso8601, ends_at: finish.iso8601, clinician_id: rule.clinician_id,
              room_ids: rooms.map(&:id) }
          end
        end
        slots.uniq { |s| [ s[:starts_at], s[:clinician_id] ] }.sort_by { |s| [ s[:starts_at], s[:clinician_id] ] }
      end

      def site_open?(start, finish)
        zone = ActiveSupport::TimeZone[@site.timezone_override.presence || @practice.timezone]
        local_start, local_end = start.in_time_zone(zone), finish.in_time_zone(zone)
        exception = @exceptions[local_start.to_date]
        return true if @hours.empty? && exception.nil?

        hours = exception || @hours.find { |h| h.day_of_week == local_start.wday }
        hours && !hours.closed && local_start.to_date == local_end.to_date &&
          minutes(hours.open_time) <= minutes(local_start) && minutes(hours.close_time) >= minutes(local_end)
      end

      def minutes(time)
        time.hour * 60 + time.min
      end

      def overlap?(start, finish, other_start, other_finish)
        start < other_finish && finish > other_start
      end

      def conflict?(appointment)
        return false unless %w[scheduled confirmed].include?(appointment.status)
        return true unless site_open?(appointment.starts_at, appointment.ends_at)
        return true if @rules.any? { |r| r.kind == "block" && r.clinician_id == appointment.booked_clinician_id && overlap?(appointment.starts_at, appointment.ends_at, r.starts_at, r.ends_at) }

        weekly = @rules.select { |r| r.kind == "weekly" && r.clinician_id == appointment.booked_clinician_id }
        if weekly.any?
          start, finish = appointment.starts_at.in_time_zone(@zone), appointment.ends_at.in_time_zone(@zone)
          return true unless start.to_date == finish.to_date && weekly.any? { |r| r.site_id == @site.id && r.weekday == start.wday && r.start_minute <= minutes(start) && r.end_minute >= minutes(finish) }
        end

        @busy.any? do |other|
          other.id != appointment.id && overlap?(appointment.starts_at, appointment.ends_at, other.starts_at, other.ends_at) &&
            (other.patient_id == appointment.patient_id ||
              (appointment.booked_clinician_id && other.booked_clinician_id == appointment.booked_clinician_id) ||
              (appointment.room_id && other.room_id == appointment.room_id))
        end
      end

      def serialize(appointment)
        AppointmentSerializer.call(appointment, actor: @actor).merge(
          clinician_name: appointment.booked_clinician&.display_name.presence || appointment.booked_clinician&.reference,
          visit_type_name: appointment.visit_type&.code, room_name: appointment.room&.code,
          calendar_status: calendar_status(appointment),
          conflict: conflict?(appointment)
        )
      end

      def calendar_status(appointment)
        encounter = appointment.encounter
        return appointment.status unless encounter
        return "completed" if encounter.status == "completed"
        return "in_progress" if encounter.notes.any? || encounter.observations.any? || encounter.participants.any?

        "checked_in"
      end
    end
  end
end
