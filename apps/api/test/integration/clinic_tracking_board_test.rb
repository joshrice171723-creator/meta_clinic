require "test_helper"
require "digest"

class ClinicTrackingBoardTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Synthetic Tracking Board Organization")
    @user = User.create!(email_address: "tracking-board@example.invalid", password: @password)
    @practice = Clinic::Practice.create!(name: "Synthetic Tracking Board Practice", organization: organization)
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "patients.read", "encounters.write", "notes.read", "notes.write", "notes.sign")
    @patient = @practice.patients.create!(display_name: "SYN_Board, Avery", reference: "SYN-BOARD-001")
    @other_patient = @practice.patients.create!(display_name: "SYN_Board, Briar", reference: "SYN-BOARD-002")
    @current = @practice.encounters.create!(patient: @patient, started_at: Time.utc(2026, 9, 2, 14), status: "open")
    @other_current = @practice.encounters.create!(patient: @other_patient, started_at: Time.utc(2026, 9, 2, 15), status: "open")
    @completed = @practice.encounters.create!(patient: @patient, started_at: Time.utc(2026, 9, 1, 14), ended_at: Time.utc(2026, 9, 1, 15), status: "completed")
    login
  end

  test "tracking board returns scoped open encounter identity without inventing workflow state" do
    get "/api/clinic/tracking_board", headers: @headers

    assert_response :success
    payload = response.parsed_body
    assert_equal "tracking-board-v1", payload.fetch("schema_version")
    assert_equal [ @other_current.id, @current.id ], payload.fetch("visits").map { |visit| visit.fetch("encounter_id") }
    visit = payload.fetch("visits").find { |row| row.fetch("encounter_id") == @current.id }
    assert_equal @patient.id, visit.fetch("patient_id")
    assert_equal [ @patient.display_name, @patient.reference ], visit.fetch("patient").values_at("display_name", "reference")
    assert_equal [ "display_name", "id", "reference" ], visit.fetch("patient").keys.sort
    assert_includes response.body, @patient.display_name
    assert_nil visit.fetch("appointment")
    assert_equal "open", visit.dig("encounter", "status")
    assert_equal "patient-care-summary-v1", visit.dig("care_summary", "schema_version")
    assert_equal [ @patient.id, @current.id ], visit.fetch("care_summary").values_at("patient_id", "encounter_id")
    assert_not visit.key?("stage")
    assert @practice.audit_events.where(action_code: "patients.read", outcome: "released").exists?
  end

  test "tracking board includes care summaries under one board-level read audit" do
    released_before = @practice.audit_events.where(action_code: "patients.read", outcome: "released").count

    get "/api/clinic/tracking_board", headers: @headers

    assert_response :success
    visits = response.parsed_body.fetch("visits")
    board_as_of = response.parsed_body.fetch("as_of")
    assert_equal [ @other_current.id, @current.id ], visits.map { |visit| visit.fetch("encounter_id") }
    visits.each do |visit|
      summary = visit.fetch("care_summary")
      assert_equal visit.fetch("patient_id"), summary.fetch("patient_id")
      assert_equal visit.fetch("encounter_id"), summary.fetch("encounter_id")
      assert_equal "patient-care-summary-v1", summary.fetch("schema_version")
      assert_equal board_as_of, summary.fetch("as_of")
    end
    assert_equal released_before + 1,
      @practice.audit_events.where(action_code: "patients.read", outcome: "released").count
  end

  test "tracking board batches care-summary reads instead of querying once per visit" do
    8.times do |index|
      patient = @practice.patients.create!(
        display_name: "SYN_Batch, Patient#{index}",
        reference: "SYN-BATCH-#{format('%03d', index)}"
      )
      @practice.encounters.create!(
        patient: patient,
        started_at: Time.utc(2026, 9, 2, 16) + index.minutes,
        status: "open"
      )
    end
    sql = []
    subscriber = ActiveSupport::Notifications.subscribe("sql.active_record") do |_name, _started, _finished, _unique_id, payload|
      sql << payload[:sql] unless payload[:name] == "SCHEMA"
    end

    begin
      get "/api/clinic/tracking_board", headers: @headers
    ensure
      ActiveSupport::Notifications.unsubscribe(subscriber)
    end

    assert_response :success
    assert_equal 10, response.parsed_body.fetch("visits").length
    {
      "clinic_allergies" => 1,
      "clinic_medication_statements" => 1,
      "clinic_patient_care_needs" => 1,
      "clinic_conditions" => 1,
      "clinic_patient_history_reviews" => 1,
      "clinic_patient_demographics" => 1,
      "clinic_encounter_precautions" => 1
    }.each do |table, expected_count|
      assert_equal expected_count, sql.count { |statement| statement.match?(/(?:FROM|JOIN) "?#{table}"?/i) },
        "expected one batched query for #{table}"
    end
  end

  test "tracking board preserves precaution states and care-need ordering in the batch adapter" do
    Clinic::Care::EncounterPrecaution.create!(
      practice: @practice,
      patient: @other_patient,
      encounter: @other_current,
      recorded_by_membership: @membership,
      precaution_type: :contact,
      evidence_status: :confirmed,
      status: :discontinued,
      recorded_at: Time.utc(2026, 9, 2, 12),
      ended_at: Time.utc(2026, 9, 2, 13)
    )
    [
      [ :mobility, :mobility_assistance, "Mobility support" ],
      [ :communication, :spoken_language_interpreter, "Interpreter support" ]
    ].each do |category, need_code, description|
      Clinic::Care::PatientCareNeed.create!(
        practice: @practice,
        patient: @patient,
        recorded_by_membership: @membership,
        category: category,
        need_code: need_code,
        description: description,
        status: :active,
        effective_from: Time.utc(2026, 8, 1),
        recorded_at: Time.utc(2026, 8, 1)
      )
    end

    get "/api/clinic/tracking_board", headers: @headers

    assert_response :success
    visits = response.parsed_body.fetch("visits").index_by { |visit| visit.fetch("encounter_id") }
    assert_equal "not_recorded", visits.fetch(@current.id).dig("care_summary", "precautions", "state")
    assert_equal "none_active", visits.fetch(@other_current.id).dig("care_summary", "precautions", "state")
    assert_equal [ "Interpreter support", "Mobility support" ],
      visits.fetch(@current.id).dig("care_summary", "care_needs", "items").map { |item| item.fetch("description") }
  end

  test "tracking board caps rows and declares truncation" do
    201.times do |index|
      @practice.encounters.create!(patient: @patient, started_at: Time.utc(2026, 9, 3) + index.minutes, status: "open")
    end

    get "/api/clinic/tracking_board", headers: @headers

    assert_response :success
    payload = response.parsed_body
    assert_equal true, payload.fetch("truncated")
    assert_equal 200, payload.fetch("visits").length
  end

  test "tracking board exposes explicit development scenario metadata only for a recognized fixture" do
    patient = @practice.patients.create!(display_name: "SYN_Scenario, Casey", reference: "SYN-TEST-001")
    site = @practice.sites.create!(code: "MAIN")
    room = site.rooms.create!(practice: @practice, code: "WAITING")
    visit_type = @practice.visit_types.create!(code: "SYN-BOARD-ANNUAL")
    appointment = @practice.appointments.create!(
      patient: patient,
      site: site,
      room: room,
      visit_type: visit_type,
      starts_at: Time.utc(2030, 2, 4, 14),
      ends_at: Time.utc(2030, 2, 4, 14, 30),
      status: "confirmed"
    )
    encounter = @practice.encounters.create!(
      patient: patient,
      appointment: appointment,
      site: site,
      room: room,
      started_at: appointment.starts_at,
      status: "open"
    )

    get "/api/clinic/tracking_board", headers: @headers

    assert_response :success
    visit = response.parsed_body.fetch("visits").find { |row| row.fetch("encounter_id") == encounter.id }
    assert_equal({ "stage" => "waiting", "reason" => "Annual wellness" }, visit.fetch("synthetic_scenario"))
    assert_not response.parsed_body.fetch("visits")
      .find { |row| row.fetch("encounter_id") == @current.id }.key?("synthetic_scenario")
  end

  test "encounter detail rejects an encounter from another patient" do
    get "/api/clinic/encounters/#{@other_current.id}",
      params: { patient_id: @current.patient_id }, headers: @headers

    assert_response :not_found
  end

  test "encounter detail requires and accepts the bound patient" do
    get "/api/clinic/encounters/#{@current.id}", headers: @headers
    assert_response :bad_request

    get "/api/clinic/encounters/#{@current.id}",
      params: { patient_id: @current.patient_id }, headers: @headers

    assert_response :success
    assert_equal @current.id, response.parsed_body.dig("encounter", "id")
    assert_equal @current.patient_id, response.parsed_body.dig("encounter", "patient_id")
  end

  test "closing an encounter requires the bound patient and records only encounter completion" do
    post "/api/clinic/encounters/#{@current.id}/close",
      params: { close: {} }, headers: csrf_headers, as: :json
    assert_response :bad_request

    post "/api/clinic/encounters/#{@current.id}/close",
      params: { close: { patient_id: @other_patient.id } }, headers: csrf_headers, as: :json
    assert_response :not_found
    assert_equal "open", @current.reload.status

    post "/api/clinic/encounters/#{@current.id}/close",
      params: { close: { patient_id: @patient.id } }, headers: csrf_headers, as: :json
    assert_response :bad_request
    assert_equal "open", @current.reload.status
    assert_not Clinic::OperationReceipt.exists?(practice: @practice)

    post "/api/clinic/encounters/#{@current.id}/close",
      params: { close: { patient_id: @patient.id, ended_at: "2026-09-02T15:00:00Z",
        request_key: "tracking-board-close" } }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "completed", response.parsed_body.dig("encounter", "status")
    assert @current.reload.ended_at
  end

  test "closing an encounter requires encounter write permission" do
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "patients.read")

    post "/api/clinic/encounters/#{@current.id}/close",
      params: { close: { patient_id: @patient.id, request_key: "tracking-board-close-denied" } },
      headers: csrf_headers, as: :json

    assert_response :forbidden
    assert_equal "open", @current.reload.status
    assert_nil @current.ended_at
  end

  test "previous signed SOAP lookup uses signature time and excludes the current encounter" do
    older_encounter = @practice.encounters.create!(patient: @patient, started_at: Time.utc(2026, 8, 1, 14), status: "completed")
    newer_encounter = @practice.encounters.create!(patient: @patient, started_at: Time.utc(2026, 8, 2, 14), status: "completed")
    create_signed_note(older_encounter, Time.utc(2026, 9, 2, 18))
    create_signed_note(newer_encounter, Time.utc(2026, 9, 2, 17))
    create_signed_note(@current, Time.utc(2026, 9, 2, 19))

    get "/api/clinic/patients/#{@patient.id}/previous_signed_soap",
      params: { exclude_encounter_id: @current.id }, headers: @headers

    assert_response :success
    chart = response.parsed_body.fetch("chart")
    assert_equal older_encounter.id, chart.fetch("encounter_id")
    assert_equal Time.utc(2026, 9, 2, 18).iso8601(6), chart.fetch("signed_at")
    assert_equal older_encounter.started_at.iso8601(6), chart.fetch("encounter_started_at")
  end

  test "tracking board and signed history require patient read permission" do
    revoke_all_permissions!(@membership)

    get "/api/clinic/tracking_board", headers: @headers
    assert_response :forbidden
    get "/api/clinic/patients/#{@patient.id}/previous_signed_soap", headers: @headers
    assert_response :forbidden
  end

  test "signed history requires note read permission separately" do
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "patients.read")

    get "/api/clinic/patients/#{@patient.id}/previous_signed_soap", headers: @headers

    assert_response :forbidden
  end

  test "signed history rejects an excluded encounter from another patient" do
    get "/api/clinic/patients/#{@patient.id}/previous_signed_soap",
      params: { exclude_encounter_id: @other_current.id }, headers: @headers

    assert_response :not_found
  end

  private

  def create_signed_note(encounter, signed_at)
    note = Clinic::Care::CreateEncounterNote.call(
      practice: @practice,
      actor: @user,
      encounter: encounter,
      note_kind: "soap",
      payload_version: Clinic::Care::SoapNotePayload::VERSION,
      request_key: "tracking-board-note-#{encounter.id}",
      encrypted_body: Clinic::Care::SoapNotePayload.dump(
        template_id: "adult-physical-exam-detailed",
        template_version: 1,
        sections: { subjective: "synthetic", objective: "synthetic", assessment: "synthetic", plan: "synthetic" }
      )
    )
    revision = note.revisions.first
    Clinic::Care::SignEncounterNote.call(
      note: note,
      actor: @user,
      revision_no: revision.revision_no,
      content_digest: Digest::SHA256.hexdigest(revision.encrypted_body),
      attestation_version: "synthetic-test-v1",
      signed_at: signed_at
    )
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def login
    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end
end
