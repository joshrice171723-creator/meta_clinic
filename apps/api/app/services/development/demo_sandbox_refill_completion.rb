module Development
  class DemoSandboxRefillCompletion
    RESOLVED_PATIENT_ORDINAL = 31

    def self.prepare!(run)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? &&
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?

      run.practice.organization.practices.order(:id).each do |practice|
        practice.sites.order(:id).each_with_index do |site, site_index|
          prepare_site!(practice:, site:, site_index: site_index + 1)
        end
      end
    end

    def self.prepare_site!(practice:, site:, site_index:)
      clinician = practice.clinician_profiles.find_by!(reference: "SBX-CLIN-#{site_index}-1")
      actor = clinician.membership.user

      reference = "SBX-#{site_index}-#{RESOLVED_PATIENT_ORDINAL.to_s.rjust(3, '0')}"
      patient = practice.patients.find_by!(primary_site: site, reference:)
      request = practice.patient_portal_requests.refill.find_by!(patient:, request_key: "sandbox-refill-#{patient.id}")
      return if request.status.in?(%w[resolved declined]) && request.medication_request_revision_id.present?
      unless request.status.in?(%w[pending in_review])
        raise ArgumentError, "Sandbox refill request is not ready for clinician review"
      end

      encounter = Clinic::Scheduling::CreateEncounter.call(
        practice:, actor:, patient:, site:, room: site.rooms.find_by!(code: "EXAM-1"),
        started_at: Current.business_time - 30.minutes
      )
      Clinic::PatientPortal::ReviewRequest.call(
        practice:, actor:, request:, status: "resolved", decision: "approved",
        patient_message: "Your refill request was reviewed. Contact the clinic with questions.",
        reconciliation_acknowledged: true,
        reconciliation_note: "Medication list reviewed during the refill request.",
        encounter:, request_key: "sandbox-refill-decision-#{request.id}"
      )
    end
    private_class_method :prepare_site!
  end
end
