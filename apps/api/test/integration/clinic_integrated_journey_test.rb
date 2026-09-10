require "test_helper"

class ClinicIntegratedJourneyTest < ActionDispatch::IntegrationTest
  test "clinic setup through checkout preserves the encounter, payment, and inventory outcome" do
    actor = User.create!(email_address: "clinic-journey@example.invalid", password: SecureRandom.hex(20))
    membership = Development::TestClinic.create!(actor)
    practice = membership.practice
    practice.update!(timezone: "America/Chicago")
    grant_permissions!(membership,
      "appointments.book", "appointments.status_transition", "encounters.write",
      "notes.write", "inventory.adjust", "medication_requests.write", "billing.invoice_draft",
      "billing.invoice_post", "billing.payment_record")
    site = practice.sites.create!(code: "JOURNEY", name: "Journey clinic", status: "active")
    patient = practice.patients.create!(display_name: "Journey patient", reference: "CLINIC-JOURNEY-001")
    visit_type = practice.visit_types.create!(code: "Medication follow-up")
    clinician = practice.clinician_profiles.create!(
      membership: membership,
      display_name: "Journey clinician",
      reference: "CLINIC-JOURNEY-CLINICIAN"
    )
    starts_at = 1.hour.ago.change(usec: 0)
    appointment = practice.appointments.create!(
      patient: patient,
      site: site,
      booked_clinician: clinician,
      visit_type: visit_type,
      starts_at: starts_at,
      ends_at: starts_at + 30.minutes,
      status: "scheduled"
    )

    Clinic::Scheduling::TransitionAppointment.call(appointment: appointment, actor: actor, to: "confirmed")
    encounter = Clinic::Scheduling::CreateEncounter.call(
      practice: practice,
      actor: actor,
      patient: patient,
      appointment: appointment,
      site: site,
      started_at: starts_at
    )
    product = practice.pharmacy_products.create!(
      name: "Journey medication",
      sku: "CLINIC-JOURNEY-MED",
      stock_unit: "mL",
      quantity_scale: 2,
      package_size: 1,
      unit_reference: "1 mL vial"
    )
    location = practice.inventory_locations.create!(site: site, name: "Journey medication cabinet", kind: "storage")
    batch = Clinic::Inventory::Receiving.call(
      practice: practice,
      actor: actor,
      reason: "Journey opening stock",
      request_key: SecureRandom.uuid,
      lines: [ {
        product_id: product.id,
        lot_number: "CLINIC-JOURNEY-LOT",
        location_id: location.id,
        location: location.name,
        expires_on: 90.days.from_now.to_date.iso8601,
        amount: "3.00",
        input_unit: "mL"
      } ]
    ).lines.sole.batch
    medication_draft = Clinic::Care::ClinicalPlanWorkflow.create(
      kind: :medication_requests, practice:, actor:, patient:, encounter:,
      attributes: { intent: "order", inventory_product_id: product.id, medication_name: product.name,
        dose_value: "12.5", dose_unit_code: "mg", route_code: "intramuscular" },
      request_key: "clinic-journey-medication-order"
    )
    medication_order = Clinic::Care::ClinicalPlanWorkflow.revise(
      kind: :medication_requests, series_id: medication_draft.series_id, practice:, actor:, patient:, encounter:,
      attributes: { status: "authorized" }, expected_version: medication_draft.version_number,
      request_key: "clinic-journey-medication-authorize"
    )
    administration = Clinic::Care::AdministerMedication.call(
      practice: practice,
      actor: actor,
      encounter: encounter,
      medication_request_revision_id: medication_order.id,
      status: "completed",
      allocations: [ { batch_id: batch.id, quantity: "1.25" } ],
      dose_value: "12.5",
      dose_unit_code: "mg",
      route_code: "intramuscular",
      administration_site_code: "left_deltoid",
      administration_site_text: nil,
      status_reason: nil,
      variance_reason: nil,
      precheck_status: "completed",
      precheck_notes: nil,
      verification_status: "not_required",
      verified_by_membership_id: nil,
      response_text: "Expected response observed",
      education_text: "Medication education reviewed",
      administered_at: starts_at + 10.minutes,
      request_key: SecureRandom.uuid
    ).medication_administration
    Clinic::Scheduling::CloseEncounter.call(
      encounter: encounter,
      actor: actor,
      ended_at: starts_at + 30.minutes,
      request_key: "clinic-journey-close"
    )
    invoice = Clinic::Billing::DraftInvoice.call(
      practice: practice,
      actor: actor,
      patient: patient,
      encounter: encounter,
      currency: "USD",
      lines: [ { quantity: "1", unit_amount: "85.00", description_snapshot: "Journey visit" } ],
      request_key: "clinic-journey-invoice"
    )
    Clinic::Billing::PostInvoice.call(invoice: invoice, actor: actor, request_key: "clinic-journey-post")
    drawer = practice.cash_drawer_sessions.create!(site: site, opened_by: actor, opening_float: "0")
    allocation = Clinic::Billing::RecordCashPayment.call(
      practice: practice,
      actor: actor,
      patient: patient,
      invoice: invoice,
      drawer_session: drawer,
      tendered_amount: "85.00",
      allocation_amount: "85.00",
      request_key: "clinic-journey-payment"
    )

    assert_equal "completed", appointment.reload.status
    assert_equal encounter.id, invoice.reload.encounter_id
    assert_equal "posted", invoice.status
    assert_equal patient.id, allocation.payment_event.patient_id
    assert_equal BigDecimal("1.25"), administration.quantity
    assert_equal BigDecimal("1.75"), batch.reload.quantity
    assert_equal 1, administration.inventory_entries.count
    assert_equal "adjustment_out", administration.inventory_entries.sole.kind
  end
end
