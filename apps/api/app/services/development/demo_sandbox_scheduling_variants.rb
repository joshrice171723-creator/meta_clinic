module Development
  class DemoSandboxSchedulingVariants
    DURATION = 30.minutes

    def self.prepare!(run)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? &&
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?

      run.practice.organization.practices.order(:id).each do |practice|
        practice.sites.order(:id).each_with_index do |site, index|
          prepare_site!(run:, practice:, site:, site_index: index + 1)
        end
      end
    end

    def self.prepare_site!(run:, practice:, site:, site_index:)
      patients = practice.patients.where(primary_site: site)
        .where("reference LIKE 'SBX-%'").order(:id).limit(3).to_a
      raise ArgumentError, "Sandbox scheduling examples need three site patients" unless patients.length == 3

      clinician = practice.clinician_profiles.find_by!(reference: "SBX-CLIN-#{site_index}-1")
      room = site.rooms.find_by!(code: "EXAM-1")
      visit_type = DemoSandboxPopulation.visit_types_for_site(practice:, site:, site_index:).first

      prepare_late_arrival!(run:, practice:, site:, clinician:, room:, visit_type:, patient: patients.fetch(0))
      prepare_walk_in!(run:, practice:, site:, room:, patient: patients.fetch(1))
      prepare_accepted_waitlist!(run:, practice:, site:, clinician:, visit_type:, patient: patients.fetch(2))
    end
    private_class_method :prepare_site!

    def self.prepare_late_arrival!(run:, practice:, site:, clinician:, room:, visit_type:, patient:)
      zone = site_timezone(practice, site)
      date = previous_weekday(Current.business_time.in_time_zone(zone).to_date)
      starts_at = zone.local(date.year, date.month, date.day, 16)
      appointment = Clinic::Scheduling::BookAppointment.call(
        practice:, actor: run.operator_user, patient:, site:, room:, booked_clinician: clinician, visit_type:,
        starts_at:, ends_at: starts_at + DURATION, reason: "Arrived after the scheduled start",
        request_key: "sandbox-late-arrival-#{run.id}-#{site.id}"
      )
      Clinic::Scheduling::CreateEncounter.call(
        practice:, actor: run.operator_user, patient:, appointment:, started_at: starts_at + 15.minutes
      )
    end
    private_class_method :prepare_late_arrival!

    def self.prepare_walk_in!(run:, practice:, site:, room:, patient:)
      return practice.encounters.find_by(patient:, site:, appointment_id: nil) if
        practice.encounters.exists?(patient:, site:, appointment_id: nil)

      Clinic::Scheduling::CreateEncounter.call(
        practice:, actor: run.operator_user, patient:, site:, room:, started_at: Current.business_time
      )
    end
    private_class_method :prepare_walk_in!

    def self.prepare_accepted_waitlist!(run:, practice:, site:, clinician:, visit_type:, patient:)
      zone = site_timezone(practice, site)
      date = next_weekday(Current.business_time.in_time_zone(zone).to_date)
      starts_at = zone.local(date.year, date.month, date.day, 16)
      latest_at = starts_at + 30.days
      actor = run.operator_user
      entry = Clinic::Idempotency.execute(
        practice:, actor:, operation_code: "waitlist.create",
        request_key: "sandbox-waitlist-create-#{run.id}-#{site.id}", resource: patient,
        authorization: -> { Clinic::Scheduling::Waitlist.authorize!(practice:, actor:, site:) },
        result_resource: ->(value) { value },
        resource_resolver: ->(practice:, receipt:) {
          Clinic::Scheduling::WaitlistEntry.find_by(practice:, id: receipt.resource_id)
        },
        payload: { patient_id: patient.id, site_id: site.id, clinician_id: clinician.id,
          visit_type_id: visit_type.id, earliest_at: starts_at.iso8601(6), latest_at: latest_at.iso8601(6),
          duration_minutes: 30, reason: "Earlier follow-up requested; sandbox scheduling example." }
      ) do
        Clinic::Scheduling::WaitlistEntry.create!(practice:, patient:, site:, clinician:, visit_type:,
          earliest_at: starts_at, latest_at:, duration_minutes: 30,
          reason: "Earlier follow-up requested; sandbox scheduling example.")
      end.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)

      return if entry.state == "booked"

      if entry.state == "waiting"
        Clinic::Scheduling::Waitlist.transition(entry:, actor:, action: "offer", expected_version: entry.lock_version,
          request_key: "sandbox-waitlist-offer-#{run.id}-#{site.id}",
          attributes: { starts_at:, expires_at: starts_at - 1.hour })
        entry.reload
      end

      Clinic::Scheduling::Waitlist.transition(entry:, actor:, action: "accept", expected_version: entry.lock_version,
        request_key: "sandbox-waitlist-accept-#{run.id}-#{site.id}",
        attributes: { patient_accepted: true }) if entry.state == "offered"
    end
    private_class_method :prepare_accepted_waitlist!

    def self.site_timezone(practice, site)
      ActiveSupport::TimeZone[site.timezone_override.presence || practice.timezone] ||
        raise(ArgumentError, "Sandbox location timezone is unavailable")
    end
    private_class_method :site_timezone

    def self.previous_weekday(date)
      date -= 1.day
      date -= 1.day while [ 0, 6 ].include?(date.wday)
      date
    end
    private_class_method :previous_weekday

    def self.next_weekday(date)
      date += 1.day
      date += 1.day while [ 0, 6 ].include?(date.wday)
      date
    end
    private_class_method :next_weekday
  end
end
