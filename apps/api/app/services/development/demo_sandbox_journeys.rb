module Development
  class DemoSandboxJourneys
    def self.prepare!(run)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? &&
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?

      practices = run.practice.organization.practices.order(:id).to_a
      raise ArgumentError, "Sandbox journeys need two clinics" unless practices.length == 2

      practices.each_with_index do |practice, clinic_index|
        practice.sites.order(:id).each_with_index do |site, site_index|
          patient = practice.patients.where(primary_site: site)
            .where("reference LIKE 'SBX-%'").order(:id).first!
          raise ArgumentError, "Journey patient needs historical visits" unless
            practice.encounters.where(patient:, site:, status: "completed").exists?

          encounter = Clinic::Scheduling::CreateEncounter.call(
            practice:, actor: run.operator_user, patient:, site:,
            room: site.rooms.order(:id).first!, started_at: Current.business_time - 2.hours
          )
          case [ clinic_index, site_index ]
          when [ 0, 0 ] then medication_story!(practice:, actor: run.operator_user, patient:, encounter:, transmit: true)
          when [ 0, 1 ] then lab_story!(practice:, actor: run.operator_user, patient:, encounter:)
          when [ 1, 0 ] then medication_story!(practice:, actor: run.operator_user, patient:, encounter:, transmit: false)
          when [ 1, 1 ] then care_plan_story!(practice:, actor: run.operator_user, patient:, encounter:)
          end
        end
      end
    end

    def self.medication_story!(practice:, actor:, patient:, encounter:, transmit:)
      key = "sandbox-medication-#{encounter.id}"
      draft = Clinic::Care::ClinicalPlanWorkflow.create(
        kind: :medication_requests, practice:, actor:, patient:, encounter:, request_key: "#{key}-draft",
        attributes: {
          medication_name: "Sample medication", medication_strength: "10 mg", medication_form: "tablet",
          medication_code_system: "sandbox", medication_code: "SBX-MED-10", catalog_source: "synthetic",
          intent: "order", dose_text: "10 mg", route_text: "oral", frequency_text: "daily",
          instructions: "Follow the demonstration care plan", prescribed_quantity: "30",
          quantity_unit: "tablet", refills: 0, fulfillment_route: "outside_pharmacy",
          pharmacy_name: "Example Community Pharmacy", pharmacy_location: "Austin"
        }
      )
      order = Clinic::Care::ClinicalPlanWorkflow.revise(
        kind: :medication_requests, series_id: draft.series_id, practice:, actor:, patient:, encounter:,
        attributes: { status: "authorized" }, expected_version: draft.version_number,
        request_key: "#{key}-authorize"
      )
      return unless transmit

      destination = Clinic::Care::PharmacyDestination.create!(
        practice:, name: "Example Community Pharmacy", address_line1: "18 Fictional Street",
        city: "Austin", state_code: "TX", postal_code: "78701"
      )
      Clinic::Care::PrescriptionWorkflow.record(practice:, actor:, order:, kind: "review",
        source: "manual", request_key: "#{key}-review")
      Clinic::Care::PrescriptionTransmissionWorkflow.submit(
        practice:, actor:, order:, pharmacy_destination_id: destination.id,
        scenario: "accepted", request_key: "#{key}-simulation"
      )
    end
    private_class_method :medication_story!

    def self.lab_story!(practice:, actor:, patient:, encounter:)
      key = "sandbox-lab-#{encounter.id}"
      draft = Clinic::Care::ClinicalPlanWorkflow.create(
        kind: :service_requests, practice:, actor:, patient:, encounter:, request_key: "#{key}-draft",
        attributes: { request_kind: "lab", intent: "order", priority: "routine",
          requested_display: "Sample follow-up laboratory panel", destination: "Outside lab",
          reason_text: "Review at the next scheduled visit", due_at: Current.business_time + 7.days }
      )
      Clinic::Care::ClinicalPlanWorkflow.revise(
        kind: :service_requests, series_id: draft.series_id, practice:, actor:, patient:, encounter:,
        attributes: { status: "active" }, expected_version: draft.version_number,
        request_key: "#{key}-activate"
      )
    end
    private_class_method :lab_story!

    def self.care_plan_story!(practice:, actor:, patient:, encounter:)
      key = "sandbox-care-plan-#{encounter.id}"
      draft = Clinic::Care::ClinicalPlanWorkflow.create(
        kind: :care_plans, practice:, actor:, patient:, encounter:, request_key: "#{key}-draft",
        attributes: { title: "Progress follow-up", description: "Review goals at the next visit",
          starts_on: Current.business_time.to_date, ends_on: Current.business_time.to_date + 30.days }
      )
      plan = Clinic::Care::ClinicalPlanWorkflow.revise(
        kind: :care_plans, series_id: draft.series_id, practice:, actor:, patient:, encounter:,
        attributes: { status: "active" }, expected_version: draft.version_number,
        request_key: "#{key}-activate"
      )
      Clinic::Care::ClinicalPlanWorkflow.create(
        kind: :care_goals, practice:, actor:, patient:, encounter:, request_key: "#{key}-goal",
        attributes: { care_plan_revision_id: plan.id, description: "Attend follow-up visit",
          target_on: Current.business_time.to_date + 14.days }
      )
    end
    private_class_method :care_plan_story!
  end
end
