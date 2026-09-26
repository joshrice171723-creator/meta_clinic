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
          when [ 0, 1 ] then care_plan_story!(practice:, actor: run.operator_user, patient:, encounter:)
          when [ 1, 0 ] then inventory_medication_story!(practice:, actor: run.operator_user, patient:, encounter:)
          when [ 1, 1 ] then care_plan_story!(practice:, actor: run.operator_user, patient:, encounter:)
          end
          follow_up!(practice:, actor: run.operator_user, patient:, site:, site_index:)
        end
      end
    end

    def self.follow_up!(practice:, actor:, patient:, site:, site_index:)
      zone = ActiveSupport::TimeZone[site.timezone_override.presence || practice.timezone] ||
        raise(ArgumentError, "Sandbox location timezone is unavailable")
      day = Current.business_time.in_time_zone(zone).to_date.beginning_of_week(:monday) + 3.weeks
      starts_at = zone.local(day.year, day.month, day.day, 9)
      clinic_type = Clinic::Configuration::PracticeFeatures.snapshot(practice:, site:).fetch(:clinic_type)
      follow_up_code = if clinic_type == "behavioral_health"
        "Behavioral health follow-up"
      elsif practice.name == "Sandbox Weight Management"
        "Weight-loss follow-up"
      else
        "Follow-up visit"
      end
      Clinic::Scheduling::BookAppointment.call(
        practice:, actor:, patient:, site:, room: site.rooms.find_by!(code: "EXAM-1"),
        booked_clinician: practice.clinician_profiles.find_by!(reference: "SBX-CLIN-#{site_index + 1}-1"),
        visit_type: practice.visit_types.find_by!(code: follow_up_code),
        starts_at:, ends_at: starts_at + 30.minutes,
        reason: clinic_type == "behavioral_health" ? "Review patient priorities and care goals" :
          "Review progress and care plan", request_key: SecureRandom.uuid
      )
    end
    private_class_method :follow_up!

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

    def self.inventory_medication_story!(practice:, actor:, patient:, encounter:)
      key = "sandbox-inventory-medication-#{encounter.id}"
      product = practice.pharmacy_products.find_by!(sku: DemoSandboxInventoryHistory::MEDICATION_SKU)
      batch = Clinic::Inventory::PharmacyBatch.find_by!(practice:, product:,
        location_id: practice.inventory_locations.find_by!(site: encounter.site, name: "Operations supply").id,
        lot_number: "SBX-MED-1")
      draft = Clinic::Care::ClinicalPlanWorkflow.create(
        kind: :medication_requests, practice:, actor:, patient:, encounter:,
        request_key: "#{key}-draft",
        attributes: { intent: "order", inventory_product_id: product.id,
          dose_value: "2.5", dose_unit_code: "mg", route_code: "subcutaneous",
          medication_strength: "10 mg/mL", medication_form: "injection",
          frequency_text: "once", instructions: "Administer during this demonstration visit",
          prescribed_quantity: "0.25", quantity_unit: "mL", refills: 0,
          fulfillment_route: "administration" }
      )
      order = Clinic::Care::ClinicalPlanWorkflow.revise(
        kind: :medication_requests, series_id: draft.series_id, practice:, actor:, patient:, encounter:,
        attributes: { status: "authorized" }, expected_version: draft.version_number,
        request_key: "#{key}-authorize"
      )
      Clinic::Care::AdministerMedication.call(
        practice:, actor:, encounter:, medication_request_revision_id: order.id,
        status: "completed", allocations: [ { batch_id: batch.id, quantity: "0.25" } ],
        dose_value: "2.5", dose_unit_code: "mg", route_code: "subcutaneous",
        administration_site_code: "abdomen", administration_site_text: nil,
        status_reason: nil, variance_reason: nil, precheck_status: "completed",
        precheck_notes: nil, verification_status: "not_required",
        verified_by_membership_id: nil, response_text: "Demonstration dose recorded",
        education_text: "Demonstration medication instructions reviewed",
        administered_at: encounter.started_at + 30.minutes, request_key: SecureRandom.uuid
      )
      Clinic::Scheduling::CloseEncounter.call(
        encounter:, actor:, ended_at: encounter.started_at + 1.hour, request_key: "#{key}-close"
      )
      invoice = Clinic::Billing::DraftInvoice.call(
        practice:, actor:, patient:, encounter:, currency: "USD",
        lines: [
          { quantity: "1", unit_amount: "95.00", description_snapshot: "Weight-loss follow-up visit" },
          { quantity: "1", unit_amount: "40.00",
            description_snapshot: "#{product.name} administration, lot #{batch.lot_number}" }
        ], request_key: "#{key}-invoice"
      )
      Clinic::Billing::PostInvoice.call(invoice:, actor:, request_key: "#{key}-post")
    end
    private_class_method :inventory_medication_story!

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
