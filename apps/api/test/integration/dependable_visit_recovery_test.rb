require "test_helper"

class DependableVisitRecoveryTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @user = User.create!(email_address: "dependable-visit@example.invalid", password: @password)
    @membership = Development::TestClinic.create!(@user)
    @practice = @membership.practice
    @patient = @practice.patients.first
    login(@user)
  end

  test "registration create and update replay exactly while stale edits leave the patient unchanged" do
    registration = {
      clinic_patient: {
        display_name: "Recovery Registration",
        reference: "RECOVERY-REG-001",
        sex: "unknown",
        contact_type: "phone",
        contact_value: "555-010-2400",
        preferred: true,
        request_key: "registration-create-recovery"
      }
    }

    assert_difference "@practice.patients.count", 1 do
      post "/api/clinic/patients", params: registration, headers: csrf_headers, as: :json
      assert_response :created
    end
    patient_id = response.parsed_body.fetch("id")
    patient = @practice.patients.find(patient_id)
    assert_equal 1, patient.contacts.count

    assert_no_difference [ "@practice.patients.count", "Clinic::Care::PatientContact.count" ] do
      post "/api/clinic/patients", params: registration, headers: csrf_headers, as: :json
      assert_response :created
    end
    assert_equal patient_id, response.parsed_body.fetch("id")
    assert_equal 1, Clinic::OperationReceipt.where(
      practice: @practice, request_key: "registration-create-recovery"
    ).count

    initial_version = patient.updated_at.utc.iso8601(6)
    update = {
      clinic_patient: {
        display_name: "Recovery Registration Updated",
        reference: "RECOVERY-REG-001",
        contact_type: "phone",
        contact_value: "555-010-2401",
        preferred: true,
        expected_updated_at: initial_version,
        request_key: "registration-update-recovery"
      }
    }
    patch "/api/clinic/patients/#{patient.id}", params: update, headers: csrf_headers, as: :json
    assert_response :success
    committed_version = response.parsed_body.dig("patient", "updated_at")
    assert_equal "555-010-2401", response.parsed_body.dig("patient", "contacts", 0, "contact_value")
    assert_equal 2, patient.reload.contacts.count

    assert_no_difference "Clinic::Care::PatientContact.count" do
      patch "/api/clinic/patients/#{patient.id}", params: update, headers: csrf_headers, as: :json
      assert_response :success
    end
    assert_equal committed_version, response.parsed_body.dig("patient", "updated_at")

    stale = update.deep_dup
    stale[:clinic_patient].merge!(
      display_name: "Stale Registration Must Not Commit",
      request_key: "registration-update-stale"
    )
    assert_no_difference "Clinic::Care::PatientContact.count" do
      patch "/api/clinic/patients/#{patient.id}", params: stale, headers: csrf_headers, as: :json
      assert_response :conflict
    end
    assert_equal "stale_record", response.parsed_body.fetch("code")
    assert_equal "Recovery Registration Updated", patient.reload.display_name
    assert_equal "555-010-2401", patient.contacts.order(:id).last.contact_value
  end

  test "encrypted working drafts replay lost responses and isolate actor and patient recovery" do
    other_patient = @practice.patients.second
    path = "/api/clinic/working_drafts/patient_update?patient_id=#{@patient.id}"
    payload = {
      body: {
        clinic_patient: {
          display_name: "Recovered working registration",
          contact_value: "555-010-2402"
        }
      },
      requestKey: "working-registration-recovery",
      pending: false
    }

    assert_difference "Clinic::WorkingDraft.count", 1 do
      put path, params: { expected_version: 0, payload: payload }, headers: csrf_headers, as: :json
      assert_response :success
    end
    assert_equal 1, response.parsed_body.fetch("version")
    assert_equal payload.deep_stringify_keys, response.parsed_body.fetch("payload")
    draft = Clinic::WorkingDraft.find_by!(practice: @practice, actor_membership: @membership)
    ciphertext = Clinic::WorkingDraft.connection.select_value(
      Clinic::WorkingDraft.sanitize_sql_array(
        [ "SELECT encrypted_payload FROM clinic_working_drafts WHERE id = ?", draft.id ]
      )
    )
    refute_equal JSON.generate(payload), ciphertext
    refute_includes ciphertext, "Recovered working registration"

    assert_no_difference "Clinic::WorkingDraft.count" do
      put path, params: { expected_version: 0, payload: payload }, headers: csrf_headers, as: :json
      assert_response :success
    end
    assert_equal 1, response.parsed_body.fetch("version")

    get "/api/clinic/working_drafts/patient_update?patient_id=#{other_patient.id}", headers: @headers
    assert_response :success
    assert_nil response.parsed_body.fetch("payload")

    coworker = User.create!(email_address: "dependable-visit-coworker@example.invalid", password: @password)
    coworker_membership = @practice.memberships.create!(user: coworker)
    grant_permissions!(coworker_membership, "patients.read", "patients.write")
    login(coworker)
    get path, headers: @headers
    assert_response :success
    assert_nil response.parsed_body.fetch("payload")

    login(@user)
    get path, headers: @headers
    assert_response :success
    assert_equal 1, response.parsed_body.fetch("version")
    assert_equal payload.deep_stringify_keys, response.parsed_body.fetch("payload")
  end

  test "follow-up working copies isolate the encounter editor from Operations" do
    encounter = @practice.encounters.create!(
      patient: @patient,
      status: "completed",
      started_at: 2.hours.ago,
      ended_at: 1.hour.ago
    )
    main_path = "/api/clinic/working_drafts/follow_up?patient_id=#{@patient.id}&encounter_id=#{encounter.id}"
    operations_path = "#{main_path}&scope=operations"
    operations_payload = {
      action: "complete",
      followUpId: 42,
      requestKey: "operations-follow-up-recovery",
      expectedVersion: 3,
      outcome: "A retained Operations completion attempt."
    }
    editor_payload = {
      status: "needed",
      plan: "Call the patient tomorrow.",
      dueAt: "2026-09-10T09:00",
      appointmentId: "",
      requestKey: nil,
      expectedVersion: 0,
      pendingRequest: nil
    }

    put operations_path, params: { expected_version: 0, payload: operations_payload }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "operations", response.parsed_body.fetch("scope")

    get main_path, headers: @headers
    assert_response :success
    assert_nil response.parsed_body.fetch("payload")

    put main_path, params: { expected_version: 0, payload: editor_payload }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "main", response.parsed_body.fetch("scope")

    get operations_path, headers: @headers
    assert_response :success
    assert_equal operations_payload.deep_stringify_keys, response.parsed_body.fetch("payload")
  end

  test "cancelled arranged appointments project as needed and completion is replayable and versioned" do
    encounter = @practice.encounters.create!(
      patient: @patient,
      status: "completed",
      started_at: 2.hours.ago,
      ended_at: 1.hour.ago
    )
    appointment = @practice.appointments.create!(
      patient: @patient,
      starts_at: 2.days.from_now,
      ends_at: 2.days.from_now + 30.minutes,
      status: "scheduled",
      visit_modality: "in_person"
    )
    record = {
      follow_up: {
        request_key: "encounter-follow-up-arranged",
        expected_version: 0,
        status: "arranged",
        plan: "Review recovery after the next visit.",
        follow_up_appointment_id: appointment.id
      }
    }
    put "/api/clinic/encounters/#{encounter.id}/follow_up", params: record,
      headers: csrf_headers, as: :json
    assert_response :success
    follow_up_id = response.parsed_body.dig("follow_up", "id")
    assert_equal "arranged", response.parsed_body.dig("follow_up", "status")
    assert_equal 0, response.parsed_body.dig("follow_up", "version")

    appointment.transition_to!("cancelled")
    get "/api/clinic/encounters/#{encounter.id}/follow_up", headers: @headers
    assert_response :success
    assert_equal "needed", response.parsed_body.dig("follow_up", "status")
    assert_equal "arranged", response.parsed_body.dig("follow_up", "recorded_status")
    assert_nil response.parsed_body.dig("follow_up", "follow_up_appointment")

    completion = {
      follow_up: {
        action: "complete",
        request_key: "encounter-follow-up-complete",
        expected_version: 0,
        outcome: "Recovery reviewed and no further visit is required."
      }
    }
    patch "/api/clinic/operations/encounter_follow_ups/#{follow_up_id}", params: completion,
      headers: csrf_headers, as: :json
    assert_response :success
    completed = response.parsed_body.fetch("follow_up")
    assert_equal "completed", completed.fetch("status")
    assert_equal 1, completed.fetch("version")
    assert_nil completed.fetch("follow_up_appointment")

    patch "/api/clinic/operations/encounter_follow_ups/#{follow_up_id}", params: completion,
      headers: csrf_headers, as: :json
    assert_response :success
    assert_equal completed, response.parsed_body.fetch("follow_up")

    stale_completion = completion.deep_dup
    stale_completion[:follow_up][:request_key] = "encounter-follow-up-stale"
    patch "/api/clinic/operations/encounter_follow_ups/#{follow_up_id}", params: stale_completion,
      headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "stale_record", response.parsed_body.fetch("code")
    assert_equal "completed", Clinic::EncounterFollowUp.find(follow_up_id).state
  end

  test "invoice draft updates replay exactly and reject stale replacement bodies" do
    invoice = Clinic::Billing::DraftInvoice.call(
      practice: @practice,
      actor: @user,
      patient: @patient,
      currency: "USD",
      lines: [ { quantity: "1", unit_amount: "10.00", description_snapshot: "Initial visit charge" } ],
      request_key: "invoice-draft-recovery-setup"
    )
    original_version = invoice.updated_at.utc.iso8601(6)
    update = {
      invoice: {
        currency: "USD",
        request_key: "invoice-draft-update-recovery",
        expected_updated_at: original_version,
        lines: [ { quantity: "2", unit_amount: "7.50", description_snapshot: "Updated visit charge" } ]
      }
    }

    patch "/api/clinic/invoices/#{invoice.id}/draft", params: update, headers: csrf_headers, as: :json
    assert_response :success
    committed_version = response.parsed_body.dig("invoice", "updated_at")
    assert_equal "15.0", response.parsed_body.dig("invoice", "total_amount")
    assert_equal "Updated visit charge", response.parsed_body.dig("invoice", "lines", 0, "description")
    assert_equal 1, invoice.reload.lines.count

    assert_no_difference "Clinic::InvoiceLine.count" do
      patch "/api/clinic/invoices/#{invoice.id}/draft", params: update, headers: csrf_headers, as: :json
      assert_response :success
    end
    assert_equal committed_version, response.parsed_body.dig("invoice", "updated_at")
    assert_equal 1, Clinic::OperationReceipt.where(
      practice: @practice, request_key: "invoice-draft-update-recovery"
    ).count

    stale = update.deep_dup
    stale[:invoice].merge!(
      request_key: "invoice-draft-update-stale",
      lines: [ { quantity: "1", unit_amount: "99.00", description_snapshot: "Stale charge" } ]
    )
    assert_no_difference "Clinic::InvoiceLine.count" do
      patch "/api/clinic/invoices/#{invoice.id}/draft", params: stale, headers: csrf_headers, as: :json
      assert_response :conflict
    end
    assert_equal "stale_record", response.parsed_body.fetch("code")
    assert_equal "Updated visit charge", invoice.reload.lines.sole.description_snapshot
  end

  private

  def login(user)
    post "/api/session", params: { email_address: user.email_address, password: @password },
      headers: csrf_headers, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
