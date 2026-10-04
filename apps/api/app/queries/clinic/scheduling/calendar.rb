module Clinic
  module Scheduling
    # An ephemeral projection of the existing schedule rules and appointments.
    # Slots are not persisted reservations; BookAppointment rechecks under locks.
    class Calendar
      SLOT_MINUTES = 30

      def initialize(practice:, site:, date:, actor:, duration_minutes: SLOT_MINUTES, waitlist_entry: nil, patient: nil, period: "month")
        @practice, @site, @actor = practice, site, actor
        @features = Clinic::Configuration::PracticeFeatures.snapshot(practice: practice, site: site)
        unless duration_minutes.is_a?(Integer) && duration_minutes.between?(5, 240)
          raise ArgumentError, "Choose a visit duration from 5 to 240 minutes."
        end
        raise ArgumentError, "The patient does not belong to this clinic." if patient && patient.practice_id != practice.id
        if waitlist_entry && (waitlist_entry.practice_id != practice.id || waitlist_entry.site_id != site.id || waitlist_entry.duration_minutes != duration_minutes)
          raise ArgumentError, "The waitlist entry does not match this availability request."
        end
        @duration_minutes, @waitlist_entry, @patient = duration_minutes, waitlist_entry, patient
        @can_read_hold_patient = Ability.new(actor, practice: practice).allowed_permission?("patients.read", site: site)
        @timezone_name = site.timezone_override.presence || practice.timezone
        @zone = ActiveSupport::TimeZone[@timezone_name]
        raise ArgumentError, "The clinic timezone is unavailable." unless @zone

        raise ArgumentError, "Choose a day or month calendar period." unless %w[day month].include?(period)

        @first = period == "day" ? date : date.beginning_of_month
        @last = period == "day" ? date : date.end_of_month
        @start = midnight(@first)
        @finish = midnight(@last.next_day)
        @rules = CapacityRule.where(practice: practice, active: true).to_a
        appointments = practice.appointments.where("starts_at < ? AND ends_at > ?", @finish, @start)
        # Only the selected site's appointments need display and chart details.
        # Cross-site reservations still participate in every conflict check.
        @appointments = appointments.where(site: site, starts_at: @start...@finish)
          .includes(:booked_clinician, :visit_type, :room, :telehealth_visit, :walk_in_exception,
            :overbook_exception, :series_occurrence, :encounter, patient: :communication_endpoints).to_a
        conflict_finish = [@finish, *@appointments.map(&:ends_at)].max
        @busy = practice.appointments.where(status: %w[scheduled confirmed])
          .where("starts_at < ? AND ends_at > ?", conflict_finish, @start)
          .select(:id, :patient_id, :booked_clinician_id, :room_id, :starts_at, :ends_at)
          .includes(:overbook_exception).to_a
        @offers = WaitlistEntry.where(practice: practice, state: "offered")
          .where("offer_expires_at > ? AND offer_starts_at < ? AND offer_ends_at > ?", Current.business_time, @finish, @start).to_a
        @holds = ScheduleHold.where(practice: practice, state: "active")
          .where("expires_at > ? AND starts_at < ? AND ends_at > ?", Current.business_time, @finish, @start).to_a
        visible_holds = @holds.select { |hold| hold.site_id == @site.id }
        if @can_read_hold_patient
          ActiveRecord::Associations::Preloader.new(records: visible_holds, associations: :patient).call
        end
        @hours = site.operating_hours.to_a
        @exceptions = site.hour_exceptions.where(date: @first.prev_day..@last.next_day).index_by(&:date)
        @clinicians = practice.clinician_profiles.includes(:assignments).order(:id).to_a
        @clinicians_by_id = @clinicians.index_by(&:id)
        @rooms = practice.rooms.where(site: site).order(:code).to_a
        @physical_rooms = @rooms.select { |room| room.kind == "physical" }
        @visits_by_date = @appointments.group_by { |appointment| appointment.starts_at.in_time_zone(@zone).to_date }
        @holds_by_date = visible_holds.group_by { |hold| hold.starts_at.in_time_zone(@zone).to_date }
        @weekly_by_clinician = @rules.select { |rule| rule.kind == "weekly" }.group_by(&:clinician_id)
        @weekly_by_weekday = @rules.select { |rule| rule.kind == "weekly" && rule.site_id == @site.id }.group_by(&:weekday)
        @blocks_by_clinician = @rules.select { |rule| rule.kind == "block" }.group_by(&:clinician_id)
        @block_clinician_days = interval_index(@rules.select { |rule| rule.kind == "block" }, :clinician_id)
        @busy_by_patient = @busy.group_by(&:patient_id)
        @busy_by_clinician = @busy.group_by(&:booked_clinician_id)
        @busy_by_room = @busy.group_by(&:room_id)
        @busy_patient_days = interval_index(@busy, :patient_id)
        @busy_clinician_days = interval_index(@busy, :booked_clinician_id)
        @busy_room_days = interval_index(@busy, :room_id)
        @offer_clinician_days = interval_index(@offers, :clinician_id, starts_at: :offer_starts_at, ends_at: :offer_ends_at)
        @hold_clinician_days = interval_index(@holds, :clinician_id)
        @hold_room_days = interval_index(@holds, :room_id)
        @assignments_by_clinician = @clinicians.to_h do |clinician|
          [clinician.id, clinician.assignments.select { |assignment| assignment.practice_id == @practice.id }]
        end
        @conflicts = {}
        @available_rooms = {}
        load_encounter_activity
      end

      def call
        @generated_at = Current.business_time.iso8601(6)
        days = (@first..@last).map do |date|
          visits = @visits_by_date.fetch(date, [])
          holds = @holds_by_date.fetch(date, [])
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
        policy = SitePolicy.current(practice: @practice, site: @site)
        { month: @first.strftime("%Y-%m"), as_of: @generated_at, timezone: @timezone_name, site_id: @site.id,
          slot_minutes: SLOT_MINUTES, capacity_configured: configured?,
          duration_minutes: @duration_minutes,
          waitlist_entry: (@waitlist_entry && { id: @waitlist_entry.id, version: @waitlist_entry.lock_version }),
          policy: { recurrence: (policy&.recurrence_enabled? ? "configured" : "not_configured"),
            overbook: (policy&.overbook_enabled? ? "configured" : "not_configured"),
            external_sync: "read_only_export" },
          days: days,
          clinicians: @clinicians.map { |c| { id: c.id, name: c.display_name.presence || c.reference.presence || "Clinician ##{c.id}" } },
          rooms: @rooms.map { |r| { id: r.id, name: r.code, kind: r.kind } } }
      end

      private

      # Index every local day an interval touches, including overnight bookings.
      # Clamp long intervals to this projection rather than expanding their history.
      def interval_index(records, attribute, starts_at: :starts_at, ends_at: :ends_at)
        records.each_with_object({}) do |record, index|
          first = [record.public_send(starts_at).in_time_zone(@zone).to_date, @first].max
          last = [record.public_send(ends_at).in_time_zone(@zone).to_date, @last].min
          (first..last).each do |date|
            (index[[record.public_send(attribute), date]] ||= []) << record
          end
        end
      end

      def load_encounter_activity
        ids = @appointments.filter_map { |appointment| appointment.encounter&.id }
        @active_encounter_ids = Set.new
        return if ids.empty?

        [Clinic::EncounterNote, Clinic::Care::Observation, Clinic::EncounterParticipant].each do |model|
          @active_encounter_ids.merge(model.where(practice: @practice, encounter_id: ids).distinct.pluck(:encounter_id))
        end
      end

      def midnight(date)
        @zone.local(date.year, date.month, date.day)
      end

      def configured?
        @weekly_by_weekday.any?
      end

      def slots_for(date)
        return [] unless Configuration::StarterProfile.ready?(@site, @features)
        return [] if @waitlist_entry && !@features[:available_visit_type_ids].include?(@waitlist_entry.visit_type_id)

        slots = []
        @weekly_by_weekday.fetch(date.wday, []).each do |rule|
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
            elsif @patient
              next unless start > Current.business_time
            end
            patient_id = @waitlist_entry&.patient_id || @patient&.id
            next if patient_id && @busy_patient_days.fetch([patient_id, date], []).any? { |a| overlap?(start, finish, a.starts_at, a.ends_at) }
            next if @block_clinician_days.fetch([rule.clinician_id, date], []).any? { |r| overlap?(start, finish, r.starts_at, r.ends_at) }
            next if @busy_clinician_days.fetch([rule.clinician_id, date], []).any? { |a| overlap?(start, finish, a.starts_at, a.ends_at) }
            next if @offer_clinician_days.fetch([rule.clinician_id, date], []).any? { |o| overlap?(start, finish, o.offer_starts_at, o.offer_ends_at) }
            next if @hold_clinician_days.fetch([rule.clinician_id, date], []).any? { |h| overlap?(start, finish, h.starts_at, h.ends_at) }

            rooms = @available_rooms[[start, finish]] ||= @physical_rooms.reject do |room|
              @busy_room_days.fetch([room.id, date], []).any? { |a| overlap?(start, finish, a.starts_at, a.ends_at) } ||
                @hold_room_days.fetch([room.id, date], []).any? { |h| overlap?(start, finish, h.starts_at, h.ends_at) }
            end
            # A waitlist suggestion never switches rooms midway through a visit.
            # Roomless sites retain their existing optional-room semantics.
            next if @waitlist_entry && @physical_rooms.any? && rooms.empty?

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

        assignments = @assignments_by_clinician.fetch(clinician_id)
        return true if assignments.empty?

        assignments.any? { |item| item.site_id == @site.id && item.effective_from <= start &&
          (item.effective_until.nil? || item.effective_until >= finish) }
      end

      def site_open?(start, finish)
        local_start, local_end = start.in_time_zone(@zone), finish.in_time_zone(@zone)
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
        @conflicts.fetch(appointment.id) { @conflicts[appointment.id] = calculate_conflict(appointment) }
      end

      def calculate_conflict(appointment)
        return false unless %w[scheduled confirmed].include?(appointment.status)
        return true unless site_open?(appointment.starts_at, appointment.ends_at)
        return true if @blocks_by_clinician.fetch(appointment.booked_clinician_id, []).any? { |r| overlap?(appointment.starts_at, appointment.ends_at, r.starts_at, r.ends_at) }

        weekly = @weekly_by_clinician.fetch(appointment.booked_clinician_id, [])
        if weekly.any?
          start, finish = appointment.starts_at.in_time_zone(@zone), appointment.ends_at.in_time_zone(@zone)
          return true unless start.to_date == finish.to_date && weekly.any? { |r| r.site_id == @site.id && r.weekday == start.wday && r.start_minute <= minutes(start) && r.end_minute >= minutes(finish) }
        end

        candidates = @busy_by_patient.fetch(appointment.patient_id, []) +
          (appointment.booked_clinician_id ? @busy_by_clinician.fetch(appointment.booked_clinician_id, []) : []) +
          (appointment.room_id ? @busy_by_room.fetch(appointment.room_id, []) : [])
        candidates.uniq(&:id).any? do |other|
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
        return "in_progress" if @active_encounter_ids.include?(encounter.id)

        "checked_in"
      end
    end
  end
end
