module Development
  class DemoSandboxQueue
    VISITS = {
      "Sandbox Primary Care" => [
        [ "Annual wellness", "Annual wellness check" ],
        [ "Medication review", "Review current medications" ],
        [ "Lab follow-up", "Discuss laboratory results" ],
        [ "Care planning", "Review care goals" ]
      ],
      "Sandbox Weight Management" => [
        [ "Weight management follow-up", "Review weight management progress" ],
        [ "Nutrition consult", "Discuss nutrition goals" ],
        [ "Medication check", "Review medication response" ],
        [ "Goal review", "Review activity and care goals" ]
      ]
    }.freeze

    def self.prepare!(run)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? &&
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?

      practices = run.practice.organization.practices.order(:id).to_a
      raise ArgumentError, "Sandbox queue needs two clinics" unless practices.length == 2

      practices.each do |practice|
        visit_specs = VISITS.fetch(practice.name)
        practice.sites.order(:id).each_with_index do |site, site_index|
          prepare_site!(practice:, site:, site_index: site_index + 1,
            actor: run.operator_user, visit_specs:)
        end
      end
    end

    def self.prepare_site!(practice:, site:, site_index:, actor:, visit_specs:)
      zone = ActiveSupport::TimeZone[site.timezone_override.presence || practice.timezone] ||
        raise(ArgumentError, "Sandbox location timezone is unavailable")
      date = Current.business_time.in_time_zone(zone).to_date
      date -= 1.day while [ 0, 6 ].include?(date.wday)

      visit_specs.each_with_index do |(visit_code, reason), index|
        patient = practice.patients.find_by!(reference: "SBX-#{site_index}-#{(index + 11).to_s.rjust(3, '0')}")
        clinician = practice.clinician_profiles.find_by!(reference: "SBX-CLIN-#{site_index}-#{index % 3 + 1}")
        room = site.rooms.find_by!(code: "EXAM-#{index % 3 + 1}")
        starts_at = zone.local(date.year, date.month, date.day, [ 9, 11, 13, 15 ].fetch(index))
        appointment = Clinic::Scheduling::BookAppointment.call(
          practice:, actor:, patient:, site:, room:, booked_clinician: clinician,
          visit_type: practice.visit_types.find_by!(code: visit_code), reason:,
          starts_at:, ends_at: starts_at + 30.minutes, request_key: SecureRandom.uuid
        )
        Clinic::Scheduling::TransitionAppointment.call(appointment:, actor:, to: "confirmed")
        encounter = Clinic::Scheduling::CreateEncounter.call(
          practice:, actor:, patient:, appointment:, started_at: starts_at
        )
        next if index.zero?

        Clinic::Scheduling::AssignProvider.call(
          encounter:, actor:, clinician_profile: clinician, expected_token: nil,
          request_key: SecureRandom.uuid
        )
      end
    end
    private_class_method :prepare_site!
  end
end
