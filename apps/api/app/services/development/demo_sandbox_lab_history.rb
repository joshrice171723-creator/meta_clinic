module Development
  class DemoSandboxLabHistory
    def self.prepare!(run)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? &&
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?

      run.practice.organization.practices.order(:id).each do |practice|
        practice.sites.order(:id).each do |site|
          patients = practice.patients.where(primary_site: site)
            .where("reference LIKE 'SBX-%'").order(:id).offset(4).limit(5).to_a
          raise ArgumentError, "Sandbox lab history needs five patients at the site" unless patients.length == 5

          patients.each_with_index do |patient, index|
            encounter = Clinic::Scheduling::CreateEncounter.call(
              practice:, actor: run.operator_user, patient:, site:,
              room: site.rooms.order(:id).first!, started_at: Current.business_time - (index + 3).hours
            )
            prepare_patient!(practice:, actor: run.operator_user, encounter:, index:)
          end
        end
      end
    end

    def self.prepare_patient!(practice:, actor:, encounter:, index:)
      patient = encounter.patient
      key = "sandbox-lab-history-#{encounter.id}"
      draft = Clinic::Care::ClinicalPlanWorkflow.create(
        kind: :service_requests, practice:, actor:, patient:, encounter:,
        request_key: "#{key}-order", attributes: {
          request_kind: "lab", intent: "order", priority: "routine",
          requested_display: "Example glucose test", destination: "Manual laboratory entry",
          reason_text: "Review results during follow-up"
        }
      )
      order = Clinic::Care::ClinicalPlanWorkflow.revise(
        kind: :service_requests, series_id: draft.series_id, practice:, actor:, patient:, encounter:,
        attributes: { status: "active" }, expected_version: draft.version_number,
        request_key: "#{key}-activate"
      )
      return if index.zero? # Active order awaiting a result.

      collected_at = encounter.started_at + 20.minutes
      issued_at = encounter.started_at + 2.hours
      value = index == 3 ? "182" : (index == 4 ? "105" : "94")
      report = Clinic::Care::LabReports.create(
        practice:, actor:, patient:, request_key: "#{key}-report", confirmed_patient: true,
        source_name: "Example laboratory entry", external_report_id: "SBX-LAB-#{encounter.id}",
        service_request_revision_id: order.id,
        specimen: { specimen_identifier: "SBX-SPEC-#{encounter.id}",
          specimen_type_code: "venous-blood", specimen_type_display: "Venous blood",
          condition_code: "satisfactory" },
        version: result_version(collected_at:, issued_at:, value:, status: "final",
          flag: index == 3 ? "high" : nil)
      ).value
      version = report.current_version
      return if index == 1 # Received report awaiting review.

      if index == 4
        version = Clinic::Care::LabReports.append_version(
          practice:, actor:, patient:, report:, request_key: "#{key}-correction",
          confirmed_patient: true, expected_current_version_id: version.id,
          version: result_version(collected_at:, issued_at: issued_at + 1.hour,
            value: "92", status: "corrected")
        ).value
      end
      Clinic::Care::LabReports.review(
        practice:, actor:, patient:, report:, version:, request_key: "#{key}-review",
        confirmed_patient: true,
        follow_up: index == 3 ? {
          disposition: "required", note: "Contact the patient to discuss this flagged result and arrange follow-up."
        } : nil
      )
    end
    private_class_method :prepare_patient!

    def self.result_version(collected_at:, issued_at:, value:, status:, flag: nil)
      { title: "Example glucose test", status:, result_priority: "routine",
        collected_at:, issued_at:, results: [
          { name: "Glucose", value:, value_kind: "numeric", unit: "mg/dL",
            reference_range: "70-99", flag: }
        ] }
    end
    private_class_method :result_version
  end
end
