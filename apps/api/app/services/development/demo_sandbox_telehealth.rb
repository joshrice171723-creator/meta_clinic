module Development
  class DemoSandboxTelehealth
    def self.prepare!(run)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? &&
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?

      run.practice.organization.practices.order(:id).each do |practice|
        prepare_practice!(run:, practice:)
      end
    end

    def self.prepare_practice!(run:, practice:)
      site = practice.sites.order(:id).first!
      membership = practice.memberships.find_by!(user: run.operator_user)
      setting = Clinic::Telehealth::Setting.find_or_initialize_by(practice:)
      setting.update!(updated_by_membership: membership, provider_code: "daily", provider_account_ref: nil,
        enabled: false, health_status: "unconfigured")

      patient = practice.patients.find_by!(reference: "SBX-1-001", primary_site: site)
      clinician = practice.clinician_profiles.find_by!(reference: "SBX-CLIN-1-1")
      visit_type_code = practice.name == "Sandbox Weight Management" ? "Weight-loss follow-up" : "Follow-up visit"
      visit_type = practice.visit_types.find_by!(code: visit_type_code)
      zone = ActiveSupport::TimeZone[site.timezone_override.presence || practice.timezone] ||
        raise(ArgumentError, "Sandbox location timezone is unavailable")
      now = Current.business_time.in_time_zone(zone)
      date = now.to_date.beginning_of_week(:monday) + 4.weeks + 1.day
      starts_at = zone.local(date.year, date.month, date.day, 10)

      Clinic::Scheduling::BookAppointment.call(
        practice:, actor: run.operator_user, patient:, site:, booked_clinician: clinician, visit_type:,
        starts_at:, ends_at: starts_at + 30.minutes, visit_modality: "video",
        reason: "Video follow-up requested",
        request_key: "sandbox-video-booking-#{run.id}-#{practice.id}"
      )
    end
    private_class_method :prepare_practice!
  end
end
