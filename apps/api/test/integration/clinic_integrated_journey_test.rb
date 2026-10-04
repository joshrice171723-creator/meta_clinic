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
    configure_site!(site, membership: membership, services: %w[prescription_preparation])
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
    drawer = practice.cash_drawer_sessions.create!(site: site, opened_by: actor, opening_float: "0", currency: "USD")
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

  test "cross-role clinic day keeps patient provenance work ownership checkout and recovery linked" do
    Rails.cache.clear
    host! "localhost:3000"
    headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    password = "Synthetic-clinic-day-2026!"
    organization = Organization.create!(name: "Synthetic Clinic Day Organization")
    practice = Clinic::Practice.create!(name: "Synthetic Clinic Day Practice", organization:, timezone: "UTC")
    site = practice.sites.create!(code: "CLINIC-DAY", name: "Synthetic clinic-day site", status: "active")
    room = site.rooms.create!(practice:, code: "CLINIC-DAY-ROOM", kind: "physical")
    patient = practice.patients.create!(display_name: "Synthetic Clinic Day Patient", reference: "CLINIC-DAY-001")

    patient_user = User.create!(email_address: "clinic-day-patient@example.invalid", password:)
    identity = Clinic::PatientPortal::Identity.create!(
      practice:, patient:, user: patient_user, status: "active", invited_at: 1.day.ago, activated_at: 1.day.ago
    )
    nurse, nurse_membership = create_clinic_day_staff(
      practice:, password:, label: "nurse",
      permissions: %w[patients.read intake.write notes.read notes.write encounters.write]
    )
    clinician, clinician_membership = create_clinic_day_staff(
      practice:, password:, label: "clinician",
      permissions: %w[patients.read clinical_records.read medication_requests.write medication_administrations.write
        service_requests.write immunizations.write encounters.write notes.write appointments.book
        appointments.status_transition inventory.receive inventory.adjust]
    )
    configure_site!(site, membership: clinician_membership,
      services: %w[prescription_preparation in_office_medications external_lab_coordination vaccinations])
    clinician_profile = practice.clinician_profiles.create!(
      membership: clinician_membership, display_name: "Synthetic Clinic Day Clinician"
    )
    7.times do |weekday|
      Clinic::Scheduling::CapacityRule.create!(
        practice:, site:, clinician: clinician_profile, kind: "weekly", weekday:,
        start_minute: 0, end_minute: 1440, active: true
      )
    end
    scheduler, = create_clinic_day_staff(
      practice:, password:, label: "scheduler", permissions: %w[appointments.read]
    )
    billing, = create_clinic_day_staff(
      practice:, password:, label: "billing", permissions: %w[patients.read billing.invoice_draft]
    )
    foreign_practice = Clinic::Practice.create!(name: "Synthetic Other Clinic", organization:, timezone: "UTC")
    foreign_patient = foreign_practice.patients.create!(display_name: "Synthetic Other Patient", reference: "OTHER-001")
    foreign_user, foreign_membership = create_clinic_day_staff(
      practice: foreign_practice, password:, label: "foreign-clinician",
      permissions: %w[patients.read clinical_records.read encounters.write]
    )
    foreign_identity = Clinic::PatientPortal::Identity.create!(
      practice: foreign_practice, patient: foreign_patient, user: foreign_user, status: "active",
      invited_at: 1.day.ago, activated_at: 1.day.ago
    )

    visit_type = practice.visit_types.create!(code: "CLINIC-DAY-VISIT")
    starts_at = 2.hours.from_now.change(usec: 0)
    appointment = practice.appointments.create!(
      patient:, site:, room:, booked_clinician: clinician_profile, visit_type:, starts_at:,
      ends_at: starts_at + 30.minutes, status: "scheduled"
    )

    login_as(patient_user, password:, headers:)
    previsit_body = {
      previsit_note: {
        text: "Please review this synthetic clinic-day intake.",
        intake_answers: {
          visit_reason: "Synthetic medication and vaccine follow-up",
          medications: "Synthetic medication list confirmed",
          allergies: "Synthetic allergy list confirmed"
        },
        attestation: true,
        expected_version: 0,
        request_key: "clinic-day-previsit"
      }
    }
    assert_difference "Clinic::Care::PrevisitNote.count", 1 do
      post patient_previsit_path(appointment), params: previsit_body, headers: csrf_headers(headers), as: :json
      assert_response :created
    end
    previsit = response.parsed_body.fetch("note")
    assert_equal [ appointment.id, Clinic::Care::PrevisitIntake::FORM_ID, true ],
      [ response.parsed_body.fetch("appointment_id"), previsit.fetch("form_id"),
        previsit.dig("attestation", "accepted") ]
    assert_no_difference "Clinic::Care::PrevisitNote.count" do
      post patient_previsit_path(appointment), params: previsit_body, headers: csrf_headers(headers), as: :json
      assert_response :success
    end

    travel_to(starts_at + 5.minutes) do
      encounter = Clinic::Scheduling::CreateEncounter.call(
        practice:, actor: nurse, patient:, appointment:, site:, started_at: starts_at
      )
      reviews = %w[allergies medications care_needs].map.with_index do |topic, index|
        patient.history_reviews.create!(
          practice:, encounter:, topic:, outcome: "current_list_confirmed", information_source: "patient",
          reviewer_membership: nurse_membership, reviewed_at: starts_at + index.minutes,
          request_key: "clinic-day-history-#{topic}"
        )
      end

      login_as(scheduler, password:, headers:)
      get nurse_workspace_path(patient, encounter), headers: headers
      assert_response :not_found

      login_as(foreign_user, password:, headers:)
      get nurse_workspace_path(patient, encounter), headers: headers
      assert_response :not_found

      login_as(nurse, password:, headers:)
      get staff_previsit_path(patient, encounter), headers: headers
      assert_response :success
      staff_previsit = response.parsed_body
      assert_equal [ patient.id, appointment.id, previsit.fetch("id"), true ],
        [ staff_previsit.fetch("patient_id"), staff_previsit.fetch("appointment_id"),
          staff_previsit.dig("note", "id"), staff_previsit.dig("note", "attestation", "accepted") ]

      intake_body = {
        intake: {
          request_key: "clinic-day-intake", expected_version: 0, status: "ready_for_handoff",
          identity_state: "confirmed", visit_reason_state: "confirmed", history_state: "reviewed",
          vitals_state: "not_applicable", observation_ids: [], history_review_ids: reviews.map(&:id)
        }
      }
      assert_difference "Clinic::EncounterIntakeRevision.count", 1 do
        post intake_path(patient, encounter), params: intake_body, headers: csrf_headers(headers), as: :json
        assert_response :created
      end
      intake = response.parsed_body.fetch("intake")
      assert_equal [ patient.id, encounter.id, reviews.map(&:id).sort ],
        [ intake.fetch("patient_id"), intake.fetch("encounter_id"), intake.fetch("history_review_ids").sort ]
      assert_no_difference "Clinic::EncounterIntakeRevision.count" do
        post intake_path(patient, encounter), params: intake_body, headers: csrf_headers(headers), as: :json
        assert_response :created
      end

      handoff_body = { handoff: { intake_revision_id: intake.fetch("id"), request_key: "clinic-day-handoff" } }
      post handoffs_path(patient, encounter), params: handoff_body, headers: csrf_headers(headers), as: :json
      assert_response :created
      handoff = response.parsed_body.fetch("handoff")
      patch handoff_path(handoff), params: { handoff: {
        action: "accept", expected_version: handoff.fetch("version"), request_key: "clinic-day-self-accept"
      } }, headers: csrf_headers(headers), as: :json
      assert_response :unprocessable_entity

      login_as(clinician, password:, headers:)
      patch handoff_path(handoff), params: { handoff: {
        action: "accept", expected_version: handoff.fetch("version"), request_key: "clinic-day-clinician-accept"
      } }, headers: csrf_headers(headers), as: :json
      assert_response :success
      accepted_handoff = response.parsed_body.fetch("handoff")
      assert_equal [ patient.id, encounter.id, nurse_membership.id, clinician_membership.id, "accepted" ],
        [ accepted_handoff.fetch("patient_id"), accepted_handoff.fetch("encounter_id"),
          accepted_handoff.fetch("requested_by_membership_id"), accepted_handoff.fetch("accepted_by_membership_id"),
          accepted_handoff.fetch("state") ]

      referral = create_clinical_record(
        patient:, encounter:, collection: "service_requests", root: "service_request", headers:,
        request_key: "clinic-day-referral", attributes: {
          request_kind: "referral", intent: "order", priority: "urgent",
          requested_display: "Synthetic specialty review", destination: "Synthetic specialty clinic"
        }
      )
      referral = revise_clinical_record(
        patient:, encounter:, collection: "service_requests", root: "service_request", record: referral,
        headers:, request_key: "clinic-day-referral-activate", attributes: { status: "active" }
      )
      referral_task = Clinic::ClinicalTask.find_by!(
        practice:, patient:, encounter:, source_type: "order", source_kind: "service_request"
      )
      patch clinical_task_path(referral_task), params: { task: {
        action: "claim", expected_version: referral_task.lock_version, request_key: "clinic-day-referral-claim"
      } }, headers: csrf_headers(headers), as: :json
      assert_response :success
      assert_equal clinician_membership.id, referral_task.reload.assigned_to_membership_id

      refill_body = { refill_request: {
        request_key: "clinic-day-refill", patient_id: patient.id,
        medication_name: "Synthetic maintenance medication", pharmacy_destination: "Synthetic pharmacy",
        request_note: "Synthetic refill request reviewed during the visit"
      } }
      post "/api/clinic/refill_requests", params: refill_body, headers: csrf_headers(headers), as: :json
      assert_response :created
      refill = practice.patient_portal_requests.refill.find(response.parsed_body.dig("refill_request", "id"))
      refill_transition = { refill_request: {
        request_key: "clinic-day-refill-resolve", status: "resolved", decision: "approved",
        patient_message: "Synthetic refill approved after medication reconciliation.",
        reconciliation_acknowledged: true, encounter_id: encounter.id
      } }
      post "/api/clinic/refill_requests/#{refill.id}/transition", params: refill_transition,
        headers: csrf_headers(headers), as: :json
      assert_response :success
      refill.reload
      refill_revision = Clinic::Care::MedicationRequestRevision.find(refill.medication_request_revision_id)
      assert_equal [ patient.id, encounter.id, "authorized", "delivered" ],
        [ refill_revision.patient_id, refill.source_encounter_id, refill_revision.status,
          refill.refill_response_delivery.state ]
      assert_no_difference "Clinic::Care::MedicationRequestRevision.count" do
        post "/api/clinic/refill_requests/#{refill.id}/transition", params: refill_transition,
          headers: csrf_headers(headers), as: :json
        assert_response :success
      end

      administration, lot_number = create_vaccine_administration(
        practice:, patient:, encounter:, site:, actor: clinician
      )
      immunization = create_clinical_record(
        patient:, encounter:, collection: "immunizations", root: "immunization", headers:,
        request_key: "clinic-day-immunization", attributes: {
          vaccine_name: "Synthetic clinic vaccine", occurrence_source: "administered_here", cvx_code: "207",
          manufacturer: "Synthetic Vaccine Manufacturer", manufacturer_mvx_code: "PMC"
        }
      )
      assert_no_difference -> { Clinic::Care::ImmunizationRevision.where(practice:, patient:).count } do
        patch "/api/clinic/patients/#{patient.id}/encounters/#{encounter.id}/immunizations/#{immunization.fetch('series_id')}",
          params: { immunization: {
            status: "completed", administered_at: (starts_at + 15.minutes).iso8601,
            medication_administration_id: administration.id, lot_number:,
            expected_version: immunization.fetch("version_number"), request_key: "clinic-day-immunization-unconfigured"
          } }, headers: csrf_headers(headers), as: :json
        assert_response :unprocessable_entity
        assert_includes response.parsed_body.fetch("error"), "unavailable until clinic scope"
      end
      enable_clinic_day_immunization_administration!(practice:, site:, membership: clinician_membership)
      immunization = revise_clinical_record(
        patient:, encounter:, collection: "immunizations", root: "immunization", record: immunization,
        headers:, request_key: "clinic-day-immunization-complete", attributes: {
          status: "completed", administered_at: (starts_at + 15.minutes).iso8601,
          medication_administration_id: administration.id, lot_number:
        }
      )
      assert_equal [ patient.id, encounter.id, administration.id, lot_number, "completed" ],
        [ immunization.fetch("patient_id"), immunization.fetch("encounter_id"),
          immunization.fetch("medication_administration_id"), immunization.fetch("lot_number"),
          immunization.fetch("status") ]

      follow_up = Clinic::Operations::EncounterFollowUps.record(
        practice:, actor: clinician, encounter:, request_key: "clinic-day-follow-up", expected_version: 0,
        attributes: {
          status: "needed", plan: "Synthetic clinician follow-up in seven days.", due_at: 7.days.from_now.iso8601,
          assigned_to_membership_id: clinician_membership.id
        }
      )
      get "/api/clinic/operations/follow_ups", headers: headers
      assert_response :success
      inbox = response.parsed_body
      inbox_task = inbox.fetch("clinical_tasks").find { |item| item.fetch("id") == referral_task.id }
      inbox_follow_up = inbox.fetch("encounter_follow_ups").find { |item| item.fetch("id") == follow_up.id }
      assert_equal [ "order", "service_request", true,
        "/clinic/patients/#{patient.id}/encounters/#{encounter.id}?focus=clinical-plan-workspace&order_kind=service_request&order_series_id=#{referral.fetch('series_id')}&task_id=#{referral_task.id}" ],
        inbox_task.values_at("source_type", "source_kind", "assigned_to_me", "encounter_href")
      assert_equal [ patient.id, encounter.id, clinician_membership.id, true ],
        inbox_follow_up.values_at("patient_id", "encounter_id", "assigned_to_membership_id", "assigned_to_me")

      get "/api/clinic/encounters/#{encounter.id}/completion?patient_id=#{patient.id}", headers: headers
      assert_response :success
      evidence = response.parsed_body.fetch("evidence")
      completion = { close: {
        patient_id: patient.id, request_key: "clinic-day-close", disposition_code: "completed_as_planned",
        instructions_status: "not_required", education_status: "not_required",
        follow_up_id: evidence.dig("follow_up", "id"),
        follow_up_version: evidence.dig("follow_up", "version"),
        expected_follow_up_state: evidence.dig("follow_up", "status"),
        instruction_note_revision_id: nil, expected_education_event_ids: [],
        expected_open_task_versions: evidence.fetch("open_tasks").map { |task| "#{task.fetch('id')}:#{task.fetch('version')}" },
        open_work_reviewed: true, exception_note: nil
      } }
      post "/api/clinic/encounters/#{encounter.id}/close", params: completion,
        headers: csrf_headers(headers), as: :json
      assert_response :success
      invoice = Clinic::Billing::DraftInvoice.call(
        practice:, actor: billing, patient:, encounter:, currency: "USD",
        lines: [ { quantity: "1", unit_amount: "95.00", description_snapshot: "Synthetic clinic-day visit" } ],
        request_key: "clinic-day-checkout"
      )
      assert_equal [ "completed", "completed", encounter.id, "needed", clinician_membership.id, "claimed" ],
        [ encounter.reload.status, appointment.reload.status, invoice.encounter_id, follow_up.reload.state,
          follow_up.assigned_to_membership_id, referral_task.reload.state ]

      missed = practice.appointments.create!(
        patient:, site:, booked_clinician: clinician_profile, visit_type:, starts_at: 1.hour.ago,
        ends_at: 30.minutes.ago, status: "scheduled"
      )
      Clinic::Scheduling::TransitionAppointment.call(
        appointment: missed, actor: clinician, to: "no_show", expected_status: "scheduled"
      )
      waitlist = Clinic::Scheduling::WaitlistEntry.create!(
        practice:, patient:, site:, clinician: clinician_profile, visit_type:, earliest_at: 1.hour.from_now,
        latest_at: 1.day.from_now, duration_minutes: 30, state: "waiting", reason: "Synthetic no-show recovery"
      )
      Clinic::Scheduling::Waitlist.transition(
        entry: waitlist, actor: clinician, action: "offer", expected_version: 0,
        request_key: "clinic-day-waitlist-offer",
        attributes: { starts_at: 3.hours.from_now, expires_at: 30.minutes.from_now }
      )
      offered_version = waitlist.reload.lock_version
      patient.patient_memberships.create!(practice:, recorded_by_membership: clinician_membership,
        status: "member", version: 1, effective_from: 1.day.ago)
      assert_raises(Clinic::Authorization::Denied) do
        Clinic::Scheduling::Waitlist.portal_reply(
          entry: waitlist, identity: foreign_identity, actor: foreign_user, action: "accept",
          expected_version: offered_version, request_key: "clinic-day-foreign-waitlist-accept"
        )
      end
      booked = Clinic::Scheduling::Waitlist.portal_reply(
        entry: waitlist, identity:, actor: patient_user, action: "accept", expected_version: offered_version,
        request_key: "clinic-day-waitlist-accept"
      )
      replay = Clinic::Scheduling::Waitlist.portal_reply(
        entry: waitlist, identity:, actor: patient_user, action: "accept", expected_version: offered_version,
        request_key: "clinic-day-waitlist-accept"
      )
      assert_equal [ "no_show", "booked", booked.appointment_id, 1, 1 ],
        [ missed.reload.status, booked.state, replay.appointment_id,
          practice.appointments.where(id: booked.appointment_id, patient:).count,
          Clinic::PatientPortal::WaitlistReplyReceipt.where(identity:, waitlist_entry: waitlist).count ]
      accepted_appointment = practice.appointments.find(booked.reload.appointment_id)
      assert_equal [ patient.id, site.id, clinician_profile.id, visit_type.id, "scheduled" ],
        [ accepted_appointment.patient_id, accepted_appointment.site_id, accepted_appointment.booked_clinician_id,
          accepted_appointment.visit_type_id, accepted_appointment.status ]
      assert_equal waitlist.offer_starts_at, accepted_appointment.starts_at
      assert_equal waitlist.offer_ends_at, accepted_appointment.ends_at

      # Muse 78: an expired offer cannot create a booking or acceptance receipt.
      expired = Clinic::Scheduling::WaitlistEntry.create!(
        practice:, patient:, site:, clinician: clinician_profile, visit_type:,
        earliest_at: 1.hour.from_now, latest_at: 1.day.from_now, duration_minutes: 30,
        state: "offered", offer_starts_at: 5.hours.from_now, offer_ends_at: 5.hours.from_now + 30.minutes,
        offer_expires_at: Current.business_time, reason: "Synthetic expired acceptance"
      )
      before_expiry_reply = expired.attributes
      assert_no_difference [ -> { practice.appointments.count }, -> { Clinic::PatientPortal::WaitlistReplyReceipt.count } ] do
        error = assert_raises(ArgumentError) do
          Clinic::Scheduling::Waitlist.portal_reply(entry: expired, identity:, actor: patient_user,
            action: "accept", expected_version: expired.lock_version, request_key: "clinic-day-expired-accept")
        end
        assert_match "expired", error.message
      end
      assert_equal before_expiry_reply, expired.reload.attributes
      assert_raises(Clinic::Idempotency::Conflict) do
        Clinic::Scheduling::Waitlist.portal_reply(
          entry: waitlist, identity:, actor: patient_user, action: "decline", expected_version: offered_version,
          request_key: "clinic-day-waitlist-accept"
        )
      end
    end
  end

  private

  def enable_clinic_day_immunization_administration!(practice:, site:, membership:)
    optional_features = practice.practice_feature_versions.where(site: site).order(revision: :desc).first!.optional_features.deep_dup
    optional_features["immunization_administration_enabled"] = true
    optional_features["service_scope"] = (Array(optional_features["service_scope"]) + [ "vaccinations" ]).uniq
    optional_features["selected_services"] = (Array(optional_features["selected_services"]) + [ "vaccinations" ]).uniq
    Clinic::PracticeFeatureVersion.create!(
      practice:, site:, created_by_membership: membership, revision: practice.practice_feature_versions.where(site: site).maximum(:revision).to_i + 1, optional_features:,
      effective_from: Current.business_time, request_key: "clinic-day-authorized-immunization-administration",
      content_digest: Digest::SHA256.hexdigest(optional_features.to_json)
    )
  end

  def create_clinic_day_staff(practice:, password:, label:, permissions:)
    user = User.create!(email_address: "clinic-day-#{label}@example.invalid", password:)
    membership = practice.memberships.create!(user:)
    grant_permissions!(membership, *permissions)
    [ user, membership ]
  end

  def login_as(user, password:, headers:)
    post "/api/session", params: { email_address: user.email_address, password: },
      headers: csrf_headers(headers), as: :json
    assert_response :success
  end

  def csrf_headers(headers)
    get "/api/csrf", headers: headers
    assert_response :success
    headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def patient_previsit_path(appointment)
    "/api/patient_portal/appointments/#{appointment.id}/previsit_note"
  end

  def staff_previsit_path(patient, encounter)
    "/api/clinic/patients/#{patient.id}/encounters/#{encounter.id}/previsit_note"
  end

  def nurse_workspace_path(patient, encounter)
    "/api/clinic/patients/#{patient.id}/encounters/#{encounter.id}/nurse_workspace"
  end

  def intake_path(patient, encounter)
    "/api/clinic/patients/#{patient.id}/encounters/#{encounter.id}/intake_revisions"
  end

  def handoffs_path(patient, encounter)
    "/api/clinic/patients/#{patient.id}/encounters/#{encounter.id}/handoffs"
  end

  def handoff_path(handoff)
    "/api/clinic/handoffs/#{handoff.fetch('id')}"
  end

  def clinical_task_path(task)
    "/api/clinic/clinical_tasks/#{task.id}"
  end

  def create_clinical_record(patient:, encounter:, collection:, root:, headers:, request_key:, attributes:)
    post "/api/clinic/patients/#{patient.id}/encounters/#{encounter.id}/#{collection}",
      params: { root => attributes.merge(request_key:) }, headers: csrf_headers(headers), as: :json
    assert_response :created
    response.parsed_body.fetch(root)
  end

  def revise_clinical_record(patient:, encounter:, collection:, root:, record:, headers:, request_key:, attributes:)
    patch "/api/clinic/patients/#{patient.id}/encounters/#{encounter.id}/#{collection}/#{record.fetch('series_id')}",
      params: { root => attributes.merge(expected_version: record.fetch("version_number"), request_key:) },
      headers: csrf_headers(headers), as: :json
    assert_response :created
    response.parsed_body.fetch(root)
  end

  def create_vaccine_administration(practice:, patient:, encounter:, site:, actor:)
    product = practice.pharmacy_products.create!(
      name: "Synthetic clinic vaccine product", sku: "CLINIC-DAY-VACCINE", stock_unit: "mL",
      quantity_scale: 2, package_size: 1, unit_reference: "1 mL vial"
    )
    location = practice.inventory_locations.create!(site:, name: "Synthetic vaccine refrigerator", kind: "storage")
    lot_number = "CLINIC-DAY-LOT"
    batch = Clinic::Inventory::Receiving.call(
      practice:, actor:, reason: "Synthetic clinic-day vaccine stock", request_key: SecureRandom.uuid,
      lines: [ {
        product_id: product.id, lot_number:, location_id: location.id, location: location.name,
        expires_on: 90.days.from_now.to_date.iso8601, amount: "2.00", input_unit: "mL"
      } ]
    ).lines.sole.batch
    draft = Clinic::Care::ClinicalPlanWorkflow.create(
      kind: :medication_requests, practice:, actor:, patient:, encounter:,
      attributes: {
        intent: "order", inventory_product_id: product.id, medication_name: product.name,
        dose_value: "0.5", dose_unit_code: "mL", route_code: "intramuscular"
      },
      request_key: "clinic-day-vaccine-order"
    )
    order = Clinic::Care::ClinicalPlanWorkflow.revise(
      kind: :medication_requests, series_id: draft.series_id, practice:, actor:, patient:, encounter:,
      attributes: { status: "authorized" }, expected_version: draft.version_number,
      request_key: "clinic-day-vaccine-authorize"
    )
    administration = Clinic::Care::AdministerMedication.call(
      practice:, actor:, encounter:, medication_request_revision_id: order.id, status: "completed",
      allocations: [ { batch_id: batch.id, quantity: "0.50" } ], dose_value: "0.5", dose_unit_code: "mL",
      route_code: "intramuscular", administration_site_code: "left_deltoid", administration_site_text: nil,
      status_reason: nil, variance_reason: nil, precheck_status: "completed", precheck_notes: nil,
      verification_status: "not_required", verified_by_membership_id: nil,
      response_text: "Synthetic expected response observed", education_text: "Synthetic vaccine education reviewed",
      administered_at: Current.business_time, request_key: "clinic-day-vaccine-administration"
    ).medication_administration
    [ administration, lot_number ]
  end
end
