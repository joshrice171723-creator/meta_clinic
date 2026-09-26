module Development
  class DemoSandboxPrescriptionOutcomes
    OUTCOMES = %w[rejected unknown failure_before_send].freeze

    def self.prepare!(run)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? &&
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?

      run.practice.organization.practices.order(:id).each do |practice|
        destination = Clinic::Care::PharmacyDestination.where(practice:)
          .find_or_create_by!(name: "Sandbox Example Pharmacy") do |record|
          record.address_line1 = "18 Fictional Street"
          record.city = "Austin"
          record.state_code = "TX"
          record.postal_code = "78701"
        end
        practice.sites.order(:id).each do |site|
          patients = practice.patients.where(primary_site: site)
            .where("reference LIKE 'SBX-%'").order(:id).offset(1).limit(OUTCOMES.length)
          raise ArgumentError, "Prescription examples need three patients per site" unless patients.length == OUTCOMES.length

          patients.each_with_index do |patient, index|
            prepare_outcome!(run:, practice:, site:, patient:, actor: run.operator_user,
              destination:, outcome: OUTCOMES.fetch(index))
          end
        end
      end
    end

    def self.prepare_outcome!(run:, practice:, site:, patient:, actor:, destination:, outcome:)
      encounter = Clinic::Scheduling::CreateEncounter.call(practice:, actor:, patient:, site:,
        room: site.rooms.order(:id).first!, started_at: Current.business_time - 1.hour)
      key = "sandbox-prescription-#{run.id}-#{patient.id}"
      draft = Clinic::Care::ClinicalPlanWorkflow.create(kind: :medication_requests,
        practice:, actor:, patient:, encounter:, request_key: "#{key}-draft",
        attributes: { medication_name: "Synthetic example medication", medication_strength: "10 mg",
          medication_form: "tablet", medication_code_system: "sandbox", medication_code: "SBX-MED-10",
          catalog_source: "synthetic", intent: "order", dose_text: "10 mg", route_text: "oral",
          frequency_text: "daily", instructions: "For local workflow demonstration only",
          prescribed_quantity: "30", quantity_unit: "tablet", refills: 0,
          fulfillment_route: "outside_pharmacy", pharmacy_name: destination.name,
          pharmacy_location: destination.city })
      order = Clinic::Care::ClinicalPlanWorkflow.revise(kind: :medication_requests,
        series_id: draft.series_id, practice:, actor:, patient:, encounter:,
        attributes: { status: "authorized" }, expected_version: draft.version_number,
        request_key: "#{key}-authorize")
      Clinic::Care::PrescriptionWorkflow.record(practice:, actor:, order:, kind: "review",
        source: "manual", request_key: "#{key}-review")
      Clinic::Care::PrescriptionTransmissionWorkflow.submit(practice:, actor:, order:,
        pharmacy_destination_id: destination.id, scenario: outcome, request_key: "#{key}-#{outcome}")
    end
    private_class_method :prepare_outcome!
  end
end
