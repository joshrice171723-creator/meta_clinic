module Development
  class DemoSandboxLabContact
    def self.prepare!(run)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? &&
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?

      run.practice.organization.practices.order(:id).each do |practice|
        practice.sites.order(:id).each do |site|
          follow_up = Clinic::Care::LabResultFollowUp.where(practice:, state: "open",
            patient_id: practice.patients.where(primary_site: site).select(:id))
            .includes(:patient, :lab_report, :lab_report_version)
            .find { |item| item.lab_report.site_id == site.id && item.lab_report_version.results.any? { |row| row["flag"] == "high" } }
          raise ArgumentError, "Sandbox flagged lab result needs an open follow-up" unless follow_up

          Clinic::Care::LabResultFollowUps.attempt_contact(
            practice:, actor: run.operator_user, patient: follow_up.patient, report: follow_up.lab_report,
            version: follow_up.lab_report_version, follow_up:, request_key: "sandbox-lab-contact-#{run.id}-#{follow_up.id}",
            contact_method: "phone", outcome: "not_reached", attempted_at: Current.business_time,
            next_action_due_at: Current.business_time + 1.day,
            note: "Phone contact attempt recorded locally; patient was not reached. Retry tomorrow."
          )
        end
      end
    end
  end
end
