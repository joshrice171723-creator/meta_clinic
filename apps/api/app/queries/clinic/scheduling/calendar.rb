module Clinic
  module Scheduling
    # An ephemeral projection of the existing schedule rules and appointments.
    # Slots are not persisted reservations; BookAppointment rechecks under locks.
    class Calendar
      SLOT_MINUTES = 30

      def initialize(practice:, site:, date:, actor:, duration_minutes: SLOT_MINUTES, waitlist_entry: nil)
        @practice, @site, @actor = practice, site, actor
        unless duration_minutes.is_a?(Integer) && duration_minutes.between?(5, 240)
          raise ArgumentError, "Choose a visit duration from 5 to 240 minutes."
        end
        if waitlist_entry && (waitlist_entry.practice_id != practice.id || waitlist_entry.site_id != site.id || waitlist_entry.duration_minutes != duration_minutes)
          raise ArgumentError, "The waitlist entry does not match this availability request."
        end
        @duration_minutes, @waitlist_entry = duration_minutes, waitlist_entry
        @can_read_hold_patient = Ability.new(actor, practice: practice).allowed_permission?("patients.read", site: site)
        @timezone_name = site.timezone_override.presence || practice.timezone
        @zone = ActiveSupport::TimeZone[@timezone_name]
        raise ArgumentError, "The clinic timezone is unavailable." unless @zone

        @first = date.beginning_of_month
        @last = date.end_of_month
        @start = midnight(@first)
        @finish = midnight(@last.next_day)
        @rules = CapacityRule.where(practice: practice, active: true).to_a
        @appointments = practice.appointments.where("starts_at < ? AND ends_at > ?", @finish, @start)
          .includes(:booked_clinician, :visit_type, :room, :telehealth_visit, :walk_in_exception,
            encounter: %i[notes observations participants], patient: :communication_endpoints).to_a
        @busy = @appointments.select { |a| %w[scheduled confirmed].include?(a.status) }
        @offers = WaitlistEntry.where(practice: practice, state: "offered")
          .where("offer_expires_at > ? AND offer_starts_at < ? AND offer_ends_at > ?", Current.business_time, @finish, @start).to_a
        @holds = ScheduleHold.where(practice: practice, state: "active")
          .where("expires_at > ? AND starts_at < ? AND ends_at > ?", Current.business_time, @finish, @start)
          .includes(:patient).to_a
        @hours = site.operating_hours.to_a
        @exceptions = site.hour_exceptions.where(date: @first.prev_day..@last.next_day).index_by(&:date)
        @clinicians = practice.clinician_profiles.includes(:assignments).order(:id).to_a
        @clinicians_by_id = @clinicians.index_by(&:id)
        @rooms = practice.rooms.where(site: site).order(:code).to_a
      end

      def call
        @generated_at = Current.business_time.iso8601(6)
        visible = @appointments.select { |a| a.site_id == @site.id }
        days = (@first..@last).map do |date|
          visits = visible.select { |a| a.starts_at.in_time_zone(@zone).to_date == date }
          holds = @holds.select { |hold| hold.site_id == @site.id && hold.starts_at.in_time_zone(@zone).to_date == date }
          slots = slots_for(date)
          {
            date: date.iso8601, scheduled: visits.count { |a| a.status == "scheduled" },
            confirmed: visits.count { |a| a.status == "confirmed" },
            available: configured? ? slots.length : nil,
            conflicts: visits.count { |a| conflict?(a) }, slots: slots,
            holds: holds.map { |hold| serialize_hold(hold) },
            appointments: visits.map { |a| serialize(a) }
          }
        end
        { month: @first.strftime("%Y-%m"), as_of: @generated_at, timezone: @timezone_name, site_id: @site.id,
          slot_minutes: SLOT_MINUTES, capacity_configured: configured?,
          duration_minutes: @duration_minutes,
          waitlist_entry: (@waitlist_entry && { id: @waitlist_entry.id, version: @waitlist_entry.lock_version }),
          policy: { recurrence: (SitePolicy.current(practice: @practice, site: @site)&.recurrence_enabled? ? "configured" : "not_configured"),
            overbook: (SitePolicy.current(practice: @practice, site: @site)&.overbook_enabled? ? "configured" : "not_configured"),
            external_sync: "read_only_export" },
          days: days,
          clinicians: @clinicians.map { |c| { id: c.id, name: c.display_name.presence || c.reference.presence || "Clinician ##{c.id}" } },
          rooms: @rooms.map { |r| { id: r.id, name: r.code, kind: r.kind } } }
      end

      private

      def midnight(date)
        @zone.local(date.year, date.month, date.day)
      end

      def configured?
        @rules.any? { |r| r.kind == "weekly" && r.site_id == @site.id }
      end

      def slots_for(date)
        return [] unless @site.status == "active"

        slots = []
        @rules.select { |r| r.kind == "weekly" && r.site_id == @site.id && r.weekday == date.wday }.each do |rule|
          next if @waitlist_entry && rule.clinician_id != @waitlist_entry.clinician_id

          (rule.start_minute...rule.end_minute).step(SLOT_MINUTES) do |minute|
            next if minute + @duration_minutes > rule.end_minute

            start = @zone.local(date.year, date.month, date.day, minute / 60, minute % 60)
            finish = start + @duration_minutes.minutes
            # Do not offer nonexistent/shifted local times at daylight-saving boundaries.
            next unless start.hour * 60 + start.min == minute && finish.in_time_zone(@zone).to_date == date
            next unless minutes(finish.in_time_zone(@zone)) == minute + @duration_minutes && start.utc_offset == finish.utc_offset
            next unless clinician_assigned?(rule.clinician_id, start, finish)
            next unless site_open?(start, finish)
            if @waitlist_entry
              next unless start > Current.business_time && start >= @waitlist_entry.earliest_at && finish <= @waitlist_entry.latest_at
              next if @busy.any? { |a| a.patient_id == @waitlist_entry.patient_id && overlap?(start, finish, a.starts_at, a.ends_at) }
            end
            next if @rules.any? { |r| r.kind == "block" && r.clinician_id == rule.clinician_id && overlap?(start, finish, r.starts_at, r.ends_at) }
            next if @busy.any? { |a| a.booked_clinician_id == rule.clinician_id && overlap?(start, finish, a.starts_at, a.ends_at) }
            next if @offers.any? { |o| o.clinician_id == rule.clinician_id && overlap?(start, finish, o.offer_starts_at, o.offer_ends_at) }
            next if @holds.any? { |h| h.clinician_id == rule.clinician_id && overlap?(start, finish, h.starts_at, h.ends_at) }

            rooms = @rooms.select { |room| room.kind == "physical" }.reject do |room|
              @busy.any? { |a| a.room_id == room.id && overlap?(start, finish, a.starts_at, a.ends_at) } ||
                @holds.any? { |h| h.room_id == room.id && overlap?(start, finish, h.starts_at, h.ends_at) }
            end
            # A waitlist suggestion never switches rooms midway through a visit.
            # Roomless sites retain their existing optional-room semantics.
            next if @waitlist_entry && @rooms.any? { |room| room.kind == "physical" } && rooms.empty?

            slots << { starts_at: start.iso8601, ends_at: finish.iso8601, clinician_id: rule.clinician_id,
              room_ids: rooms.map(&:id),
              provenance: { generated_at: @generated_at, source_rules: [ { id: rule.id, version: rule.lock_version } ] } }
          end
        end
        # Overlapping weekly rules describe one opening. Retain every contributing
        # revision rather than selecting an arbitrary rule as its source.
        slots.group_by { |s| [ s[:starts_at], s[:clinician_id] ] }.values.map do |matching|
          matching.first.merge(provenance: { generated_at: @generated_at,
            source_rules: matching.flat_map { |s| s[:provenance][:source_rules] }.uniq.sort_by { |r| r[:id] } })
        end.sort_by { |s| [ s[:starts_at], s[:clinician_id] ] }
      end

      def clinician_assigned?(clinician_id, start, finish)
        clinician = @clinicians_by_id[clinician_id]
        return false unless clinician

        assignments = clinician.assignments.select { |item| item.practice_id == @practice.id }
        return true if assignments.empty?

        assignments.any? { |item| item.site_id == @site.id && item.effective_from <= start &&
          (item.effective_until.nil? || item.effective_until >= finish) }
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
              (appointment.booked_clinician_id && other.booked_clinician_id == appointment.booked_clinician_id &&
                !approved_overbook_pair?(appointment, other)) ||
              (appointment.room_id && other.room_id == appointment.room_id))
        end
      end

      def approved_overbook_pair?(appointment, other)
        appointment.overbook_exception&.conflicting_appointment_ids&.include?(other.id) ||
          other.overbook_exception&.conflicting_appointment_ids&.include?(appointment.id)
      end

      def serialize(appointment)
        AppointmentSerializer.call(appointment, actor: @actor).merge(
          clinician_name: appointment.booked_clinician&.display_name.presence || appointment.booked_clinician&.reference.presence ||
            ("Clinician profile ##{appointment.booked_clinician.id}" if appointment.booked_clinician),
          visit_type_name: appointment.visit_type&.code, room_name: appointment.room&.code,
          calendar_status: calendar_status(appointment),
          conflict: conflict?(appointment)
        )
      end

      def serialize_hold(hold)
        { id: hold.id, patient_id: (@can_read_hold_patient ? hold.patient_id : nil),
          patient_name: (@can_read_hold_patient ? hold.patient&.display_name : nil),
          clinician_id: hold.clinician_id, room_id: hold.room_id,
          starts_at: hold.starts_at.iso8601(6), ends_at: hold.ends_at.iso8601(6),
          expires_at: hold.expires_at.iso8601(6), lock_version: hold.lock_version }
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
