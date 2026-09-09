require "test_helper"

class ClinicAppointmentCheckoutLifecycleTest < ActionDispatch::IntegrationTest
  setup do
    @organization = Organization.create!(name: "Appointment Checkout Test Organization")
    @practice = Clinic::Practice.create!(name: "Appointment Checkout Test Practice", organization: @organization, timezone: "UTC")
    @actor = User.create!(email_address: "appointment-checkout@example.invalid", password: SecureRandom.hex(20))
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "appointments.book", "appointments.status_transition", "encounters.write", "billing.invoice_draft", "billing.invoice_post")
    @site = @practice.sites.create!(code: "CHECKOUT")
    @patient = @practice.patients.create!(display_name: "SYN_Checkout, Avery", reference: "SYN-CHECKOUT-001")
    @other_patient = @practice.patients.create!(display_name: "SYN_Checkout, Briar", reference: "SYN-CHECKOUT-002")
  end

  test "an appointment encounter keeps its patient and site and cannot be rebound" do
    appointment = appointment_for(@patient)

    encounter = Clinic::Scheduling::CreateEncounter.call(
      practice: @practice, actor: @actor, patient: @patient, appointment: appointment, site: @site,
      started_at: appointment.starts_at
    )

    assert_equal appointment.id, encounter.appointment_id
    assert_equal @patient.id, encounter.patient_id
    assert_equal @site.id, encounter.site_id
    assert_equal encounter.id, Clinic::Scheduling::CreateEncounter.call(
      practice: @practice, actor: @actor, patient: @patient, appointment: appointment, site: @site,
      started_at: appointment.starts_at
    ).id
    assert_raises(ArgumentError) do
      Clinic::Scheduling::CreateEncounter.call(
        practice: @practice, actor: @actor, patient: @other_patient, appointment: appointment, site: @site
      )
    end
    other_site = @practice.sites.create!(code: "OTHER")
    assert_raises(ArgumentError) do
      Clinic::Scheduling::CreateEncounter.call(
        practice: @practice, actor: @actor, patient: @patient, appointment: appointment, site: other_site
      )
    end
  end

  test "closing scheduled and confirmed appointment encounters completes their appointments" do
    %w[scheduled confirmed].each_with_index do |status, index|
      appointment = appointment_for(@patient, status: status, starts_at: Time.utc(2026, 9, 7, 9 + index))
      encounter = Clinic::Scheduling::CreateEncounter.call(
        practice: @practice, actor: @actor, patient: @patient, appointment: appointment, site: @site,
        started_at: appointment.starts_at
      )

      closed = Clinic::Scheduling::CloseEncounter.call(
        encounter: encounter, actor: @actor, ended_at: appointment.starts_at + 30.minutes,
        request_key: "appointment-close-#{status}"
      )

      assert_equal "completed", closed.status
      assert_equal "completed", appointment.reload.status
    end
  end

  test "an appointment with an active encounter cannot become cancelled or no-show" do
    appointment = appointment_for(@patient)
    encounter = Clinic::Scheduling::CreateEncounter.call(
      practice: @practice, actor: @actor, patient: @patient, appointment: appointment, site: @site,
      started_at: appointment.starts_at
    )

    %w[cancelled no_show].each do |target|
      assert_raises(ArgumentError) do
        Clinic::Scheduling::TransitionAppointment.call(appointment: appointment, actor: @actor, to: target)
      end
    end
    assert_equal "scheduled", appointment.reload.status
    assert_equal "open", encounter.reload.status
  end

  test "a site-less appointment cannot be confirmed until it is explicitly scheduled as video" do
    appointment = @practice.appointments.create!(
      patient: @patient, starts_at: Time.utc(2026, 9, 7, 11), ends_at: Time.utc(2026, 9, 7, 11, 30), status: "scheduled"
    )

    assert_raises(ArgumentError, /Choose a site/) do
      Clinic::Scheduling::TransitionAppointment.call(appointment: appointment, actor: @actor, to: "confirmed")
    end
    assert_equal "scheduled", appointment.reload.status
  end

  test "reschedule replays the same key and rejects a stale version" do
    appointment = appointment_for(@patient)
    expected_updated_at = appointment.updated_at
    starts_at = appointment.starts_at + 1.day
    ends_at = appointment.ends_at + 1.day

    first = Clinic::Scheduling::RescheduleAppointment.call(
      appointment: appointment, actor: @actor, starts_at: starts_at, ends_at: ends_at,
      expected_updated_at: expected_updated_at, request_key: "appointment-reschedule-retry"
    )
    replay = Clinic::Scheduling::RescheduleAppointment.call(
      appointment: appointment, actor: @actor, starts_at: starts_at, ends_at: ends_at,
      expected_updated_at: expected_updated_at, request_key: "appointment-reschedule-retry"
    )

    assert_equal first.id, replay.id
    assert_equal starts_at, appointment.reload.starts_at
    assert_equal 1, Clinic::OperationReceipt.where(practice: @practice, request_key: "appointment-reschedule-retry").count
    assert_raises(ActiveRecord::StaleObjectError) do
      Clinic::Scheduling::RescheduleAppointment.call(
        appointment: appointment, actor: @actor, starts_at: starts_at + 1.day, ends_at: ends_at + 1.day,
        expected_updated_at: expected_updated_at, request_key: "appointment-reschedule-stale"
      )
    end
    assert_equal starts_at, appointment.reload.starts_at
  end

  test "completed encounter checkout is unique across retries and legacy invoices remain supported" do
    appointment = appointment_for(@patient)
    encounter = Clinic::Scheduling::CreateEncounter.call(
      practice: @practice, actor: @actor, patient: @patient, appointment: appointment, site: @site,
      started_at: appointment.starts_at
    )
    Clinic::Scheduling::CloseEncounter.call(
      encounter: encounter, actor: @actor, ended_at: appointment.starts_at + 30.minutes,
      request_key: "appointment-checkout-close"
    )

    first = draft_invoice(encounter: encounter, request_key: "appointment-checkout-first")
    replay = draft_invoice(encounter: encounter, request_key: "appointment-checkout-first")
    retry_with_new_key = draft_invoice(encounter: encounter, request_key: "appointment-checkout-new-key")
    legacy = draft_invoice(request_key: "appointment-checkout-legacy")

    assert_equal first.id, replay.id
    assert_equal first.id, retry_with_new_key.id
    assert_equal encounter.id, first.encounter_id
    assert_equal 1, @practice.invoices.where(encounter_id: encounter.id).count
    assert_nil legacy.encounter_id
    assert_equal 2, @practice.invoices.count
  end

  test "billing queue includes completed encounters until an active invoice exists and restores voided checkout" do
    open_appointment = appointment_for(@other_patient, starts_at: Time.utc(2026, 9, 7, 10))
    open_encounter = Clinic::Scheduling::CreateEncounter.call(
      practice: @practice, actor: @actor, patient: @other_patient, appointment: open_appointment, site: @site,
      started_at: open_appointment.starts_at
    )
    appointment = appointment_for(@patient)
    encounter = Clinic::Scheduling::CreateEncounter.call(
      practice: @practice, actor: @actor, patient: @patient, appointment: appointment, site: @site,
      started_at: appointment.starts_at
    )
    Clinic::Scheduling::CloseEncounter.call(
      encounter: encounter, actor: @actor, ended_at: appointment.starts_at + 30.minutes,
      request_key: "checkout-queue-close"
    )

    queue = Clinic::Billing::Dashboard.call(practice: @practice, patient_identity_access: true)
      .fetch(:unbilled_encounters)
    assert_equal [ encounter.id ], queue.fetch(:items).map { |item| item.fetch(:encounter_id) }
    assert_not_includes queue.fetch(:items).map { |item| item.fetch(:encounter_id) }, open_encounter.id

    invoice = draft_invoice(encounter: encounter, request_key: "checkout-queue-invoice")
    Clinic::Billing::PostInvoice.call(invoice: invoice, actor: @actor)
    assert_empty Clinic::Billing::Dashboard.call(practice: @practice, patient_identity_access: true)
      .dig(:unbilled_encounters, :items)

    Clinic::Billing::InvoiceAdjustments.void(
      invoice: invoice, actor: @actor, reason: "Checkout needs replacement", request_key: "checkout-queue-void"
    )
    restored = Clinic::Billing::Dashboard.call(practice: @practice, patient_identity_access: true)
      .dig(:unbilled_encounters, :items).sole
    assert_equal encounter.id, restored.fetch(:encounter_id)
    assert_equal invoice.id, restored.fetch(:previous_void_invoice_id)
  end

  test "checkout shows the draft amount and only posts the revision reviewed by staff" do
    invoice = draft_invoice(request_key: "checkout-reviewed-revision")
    ledger = Clinic::Billing::PatientLedger.call(practice: @practice, patient: @patient)
    reviewed = ledger.fetch(:invoices).sole
    assert_equal "85.0", reviewed.fetch(:total_amount)
    assert_equal "0.0", ledger.fetch(:currencies).sole.fetch(:invoiced_amount)

    travel 1.second do
      Clinic::Billing::UpdateDraftInvoice.call(
        practice: @practice, actor: @actor, invoice: invoice, currency: "USD",
        lines: [ { quantity: "1", unit_amount: "95.00", description_snapshot: "Office visit" } ]
      )
    end
    assert_raises(ArgumentError) do
      Clinic::Billing::PostInvoice.call(
        invoice: invoice, actor: @actor, request_key: "checkout-stale-post",
        expected_updated_at: reviewed.fetch(:updated_at)
      )
    end
    assert_equal "draft", invoice.reload.status
    current_revision = invoice.updated_at.iso8601(6)
    posted = Clinic::Billing::PostInvoice.call(
      invoice: invoice, actor: @actor, request_key: "checkout-current-post", expected_updated_at: current_revision
    )
    assert_equal "posted", posted.status
    assert_equal posted.id, Clinic::Billing::PostInvoice.call(
      invoice: invoice, actor: @actor, request_key: "checkout-current-post", expected_updated_at: current_revision
    ).id
    assert_raises(ArgumentError) do
      Clinic::Billing::UpdateDraftInvoice.call(
        practice: @practice, actor: @actor, invoice: invoice, currency: "USD",
        lines: [ { quantity: "1", unit_amount: "5.00", description_snapshot: "Changed visit" } ]
      )
    end
    assert_equal BigDecimal("95"), invoice.lines.reload.sum(:posted_amount)
  end

  private

  def appointment_for(patient, status: "scheduled", starts_at: Time.utc(2026, 9, 7, 9))
    @practice.appointments.create!(
      patient: patient, site: @site, starts_at: starts_at, ends_at: starts_at + 30.minutes, status: status
    )
  end

  def draft_invoice(encounter: nil, request_key:)
    Clinic::Billing::DraftInvoice.call(
      practice: @practice, actor: @actor, patient: @patient, encounter: encounter, currency: "USD",
      lines: [ { quantity: "1", unit_amount: "85.00", description_snapshot: "Synthetic appointment service" } ],
      request_key: request_key
    )
  end
end
