require "test_helper"

class PatientPortalPrevisitNotesTest < ActionDispatch::IntegrationTest
  setup do
    @previous_environment, @previous_flag = Rails.env, ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = "development", "1"
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }

    Development::TestAccounts.prepare!
    @portal_user = User.find_by!(email_address: "synthetic-patient@example.invalid")
    @identity = Clinic::PatientPortal::Identity.available.find_by!(user: @portal_user)
    @practice = @identity.practice
    @patient = @practice.patients.create!(display_name: "Pre-visit Patient", reference: "PREVISIT")
    @identity.update!(patient: @patient)
    @site = @practice.sites.create!(code: "PREVISIT")
    @staff_password = SecureRandom.hex(18)
    @staff = User.create!(email_address: "previsit-clinician@example.invalid", password: @staff_password)
    @staff_membership = @practice.memberships.create!(user: @staff)
    grant_permissions!(@staff_membership, "patients.read")
    grant_permissions!(@staff_membership, "notes.read", scope_kind: "site", site: @site)

    post "/api/development_session", params: { profile: "patient" }, headers: csrf_headers, as: :json
    assert_response :created
  end

  teardown do
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = @previous_environment, @previous_flag
  end

  test "owner creates retries versions and explicitly clears without changing the appointment" do
    appointment = create_appointment(patient: @patient, starts_at: 3.days.from_now.change(usec: 0))
    original_updated_at = appointment.updated_at

    get portal_path(appointment), headers: @headers
    assert_response :success
    assert_equal appointment.id, response.parsed_body.fetch("appointment_id")
    assert_nil response.parsed_body.fetch("note")
    assert_equal true, response.parsed_body.fetch("can_edit")
    assert_equal Clinic::Care::PrevisitIntake::FORM_ID, response.parsed_body.dig("intake_form", "id")

    first = { previsit_note: {
      text: "  I have had headaches for two days.  ", expected_version: 0, request_key: "previsit-first"
    } }
    post portal_path(appointment), params: first, headers: csrf_headers, as: :json
    assert_response :created
    first_note = response.parsed_body.fetch("note")
    assert_equal 1, first_note.fetch("version_number")
    assert_equal "I have had headaches for two days.", first_note.fetch("text")
    assert_equal true, response.parsed_body.fetch("can_edit")
    assert_equal original_updated_at, appointment.reload.updated_at

    raw = ApplicationRecord.connection.select_value(
      "SELECT encrypted_text FROM clinic_previsit_notes WHERE id = #{Integer(first_note.fetch('id'))}"
    )
    assert_not_includes raw, "headaches for two days"

    post portal_path(appointment), params: first, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal first_note, response.parsed_body.fetch("note")
    assert_equal 1, appointment.previsit_notes.count

    changed_retry = Marshal.load(Marshal.dump(first))
    changed_retry[:previsit_note][:text] = "Different retry text"
    post portal_path(appointment), params: changed_retry, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "request_conflict", response.parsed_body.fetch("code")

    stale = { previsit_note: { text: "Stale edit", expected_version: 0, request_key: "previsit-stale" } }
    post portal_path(appointment), params: stale, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "stale_record", response.parsed_body.fetch("code")

    clear = { previsit_note: { text: "   ", expected_version: 1, request_key: "previsit-clear" } }
    post portal_path(appointment), params: clear, headers: csrf_headers, as: :json
    assert_response :created
    assert_equal 2, response.parsed_body.dig("note", "version_number")
    assert_equal "", response.parsed_body.dig("note", "text")
    assert_equal original_updated_at, appointment.reload.updated_at

    get portal_path(appointment), headers: @headers
    assert_response :success
    assert_equal 2, response.parsed_body.dig("note", "version_number")
    assert_equal "", response.parsed_body.dig("note", "text")
    assert_equal 2, appointment.previsit_notes.count
    assert_equal 2, @practice.audit_events.where(
      action_code: "patient_portal.previsit_note.write", outcome: "committed"
    ).count
  end

  test "structured intake requires and preserves patient confirmation for reuse" do
    first_appointment = create_appointment(patient: @patient, starts_at: 3.days.from_now.change(usec: 0))
    intake = {
      text: "Please review this synthetic intake.",
      intake_answers: {
        visit_reason: "Synthetic follow-up",
        medications: "No changes reported",
        allergies: "Synthetic allergy answer"
      },
      expected_version: 0,
      request_key: "previsit-structured-confirmed"
    }

    assert_no_difference "Clinic::Care::PrevisitNote.count" do
      post portal_path(first_appointment), params: { previsit_note: intake.merge(attestation: false) },
        headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
      assert_equal "invalid_request", response.parsed_body.fetch("code")
    end

    post portal_path(first_appointment), params: { previsit_note: intake.merge(attestation: true) },
      headers: csrf_headers, as: :json
    assert_response :created
    note = response.parsed_body.fetch("note")
    assert_equal Clinic::Care::PrevisitIntake::FORM_ID, note.fetch("form_id")
    assert_equal true, note.dig("attestation", "accepted")
    assert_equal "Synthetic allergy answer", note.dig("intake_answers", "allergies")

    plain_note_appointment = create_appointment(patient: @patient, starts_at: 4.days.from_now.change(usec: 0))
    post portal_path(plain_note_appointment), params: { previsit_note: {
      text: "Legacy plain-text synthetic note", expected_version: 0, request_key: "previsit-plain-between-forms"
    } }, headers: csrf_headers, as: :json
    assert_response :created

    second_appointment = create_appointment(patient: @patient, starts_at: 5.days.from_now.change(usec: 0))
    get portal_path(second_appointment), headers: @headers
    assert_response :success
    assert_equal "Synthetic allergy answer", response.parsed_body.dig("reusable_answers", "answers", "allergies")
    assert_equal Clinic::Care::PrevisitIntake::ATTESTATION_VERSION,
      response.parsed_body.dig("intake_form", "attestation", "version")
  end

  test "ownership appointment timing and a started encounter gate patient edits" do
    other_patient = @practice.patients.create!(display_name: "Other Pre-visit Patient", reference: "PREVISIT-OTHER")
    other_appointment = create_appointment(patient: other_patient, starts_at: 2.days.from_now)
    get portal_path(other_appointment), headers: @headers
    assert_response :not_found

    past = create_appointment(patient: @patient, starts_at: 2.days.ago)
    cancelled = create_appointment(patient: @patient, starts_at: 4.days.from_now, status: "cancelled")
    started = create_appointment(patient: @patient, starts_at: 5.days.from_now)
    @practice.encounters.create!(
      patient: @patient, appointment: started, site: @site,
      started_at: Time.current, status: "open"
    )

    [past, cancelled, started].each do |appointment|
      get portal_path(appointment), headers: @headers
      assert_response :success
      assert_equal false, response.parsed_body.fetch("can_edit")
      post portal_path(appointment), params: { previsit_note: {
        text: "Must not save", expected_version: 0, request_key: "ineligible-#{appointment.id}"
      } }, headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
      assert_equal "appointment_ineligible", response.parsed_body.fetch("code")
      assert_empty appointment.previsit_notes
    end

    editable = create_appointment(patient: @patient, starts_at: 6.days.from_now)
    post "/api/development_session", params: { profile: "omni" }, headers: csrf_headers, as: :json
    assert_response :created
    patch "/api/patient_portal/development_patient", params: { patient_id: @patient.id },
      headers: csrf_headers, as: :json
    assert_response :success
    post portal_path(editable), params: { previsit_note: {
      text: "Submitted during an authorized preview", expected_version: 0, request_key: "previsit-omni"
    } }, headers: csrf_headers, as: :json
    assert_response :created
    assert_equal User.find_by!(email_address: "omni@test.com").id,
      editable.previsit_notes.sole.submitted_by_user_id
  end

  test "staff reads only the note attached through the exact patient encounter" do
    appointment = create_appointment(patient: @patient, starts_at: 3.days.from_now)
    result = Clinic::PatientPortal::PrevisitNotes.submit(
      practice: @practice,
      patient: @patient,
      appointment: appointment,
      actor: @portal_user,
      identity: @identity,
      omni_preview: false,
      text: "Discuss dizziness when standing.",
      expected_version: 0,
      request_key: "previsit-staff-read"
    )
    encounter = @practice.encounters.create!(
      patient: @patient, appointment: appointment, site: @site,
      started_at: Time.current, status: "open"
    )
    no_appointment = @practice.encounters.create!(
      patient: @patient, site: @site, started_at: Time.current + 1.minute, status: "open"
    )
    other_patient = @practice.patients.create!(display_name: "Wrong Encounter Patient", reference: "WRONG-ENCOUNTER")
    wrong_encounter = @practice.encounters.create!(
      patient: other_patient, site: @site, started_at: Time.current + 2.minutes, status: "open"
    )

    staff_session = open_session
    staff_session.host! "localhost:3000"
    staff_headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    staff_session.get "/api/csrf", headers: staff_headers
    staff_headers["X-CSRF-Token"] = staff_session.response.parsed_body.fetch("csrf_token")
    staff_session.post "/api/session", params: {
      email_address: @staff.email_address, password: @staff_password
    }, headers: staff_headers, as: :json
    assert_equal 200, staff_session.response.status

    staff_session.get staff_path(@patient, encounter), headers: staff_headers
    assert_equal 200, staff_session.response.status
    assert_equal appointment.id, staff_session.response.parsed_body.fetch("appointment_id")
    assert_equal Clinic::Care::PrevisitNoteSerializer.call(result.note).stringify_keys,
      staff_session.response.parsed_body.fetch("note")

    staff_session.get staff_path(@patient, no_appointment), headers: staff_headers
    assert_equal 200, staff_session.response.status
    assert_nil staff_session.response.parsed_body.fetch("appointment_id")
    assert_nil staff_session.response.parsed_body.fetch("note")

    staff_session.get staff_path(@patient, wrong_encounter), headers: staff_headers
    assert_equal 404, staff_session.response.status
  end

  test "text and request parameters are bounded before creating history" do
    appointment = create_appointment(patient: @patient, starts_at: 3.days.from_now)
    post portal_path(appointment), params: { previsit_note: {
      text: "x" * 5_001, expected_version: 0, request_key: "previsit-too-long"
    } }, headers: csrf_headers, as: :json
    assert_response :bad_request
    assert_equal "text", response.parsed_body.fetch("field")

    post portal_path(appointment), params: { previsit_note: {
      text: "Valid text", expected_version: 0, request_key: "bad key"
    } }, headers: csrf_headers, as: :json
    assert_response :bad_request
    assert_equal "request_key", response.parsed_body.fetch("field")
    assert_empty appointment.previsit_notes
  end

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def create_appointment(patient:, starts_at:, status: "scheduled")
    @practice.appointments.create!(
      patient: patient,
      site: @site,
      starts_at: starts_at,
      ends_at: starts_at + 30.minutes,
      status: status
    )
  end

  def portal_path(appointment)
    "/api/patient_portal/appointments/#{appointment.id}/previsit_note"
  end

  def staff_path(patient, encounter)
    "/api/clinic/patients/#{patient.id}/encounters/#{encounter.id}/previsit_note"
  end
end
