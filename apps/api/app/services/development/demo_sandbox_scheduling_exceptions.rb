module Development
  class DemoSandboxSchedulingExceptions
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
      appointment = practice.appointments.where(site:, status: "scheduled")
        .where("starts_at > ?", Current.business_time).order(:starts_at, :id).first!
      actor = run.operator_user
      original_start = appointment.starts_at
      Clinic::Scheduling::RescheduleAppointment.call(appointment:, actor:,
        starts_at: original_start + 30.minutes, ends_at: appointment.ends_at + 30.minutes,
        expected_updated_at: appointment.updated_at, request_key: "sandbox-reschedule-#{run.id}-#{site.id}")

      patient = practice.patients.where(primary_site: site).where("reference LIKE 'SBX-%'").order(:id).first!
      clinician = appointment.booked_clinician
      visit_type = appointment.visit_type
      latest_at = original_start + 30.days
      entry = Clinic::Idempotency.execute(
        practice:, actor:, operation_code: "waitlist.create",
        request_key: "sandbox-waitlist-#{run.id}-#{site.id}", resource: patient,
        authorization: -> { Clinic::Scheduling::Waitlist.authorize!(practice:, actor:, site:) },
        result_resource: ->(value) { value },
        resource_resolver: ->(practice:, receipt:) {
          Clinic::Scheduling::WaitlistEntry.find_by(practice:, id: receipt.resource_id)
        },
        payload: { patient_id: patient.id, site_id: site.id, clinician_id: clinician.id,
          visit_type_id: visit_type.id, earliest_at: original_start.iso8601(6),
          latest_at: latest_at.iso8601(6), duration_minutes: 30,
          reason: "Earlier follow-up requested; local sandbox example." }
      ) do
        Clinic::Scheduling::WaitlistEntry.create!(practice:, patient:, site:, clinician:, visit_type:,
          earliest_at: original_start, latest_at:, duration_minutes: 30,
          reason: "Earlier follow-up requested; local sandbox example.")
      end.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)

      return unless site_index.odd?

      Clinic::Scheduling::Waitlist.transition(entry:, actor:, action: "offer", expected_version: entry.lock_version,
        request_key: "sandbox-waitlist-offer-#{run.id}-#{site.id}",
        attributes: { starts_at: original_start, expires_at: [ original_start - 1.hour, Current.business_time + 1.day ].min })
    end
    private_class_method :prepare_site!
  end
end
