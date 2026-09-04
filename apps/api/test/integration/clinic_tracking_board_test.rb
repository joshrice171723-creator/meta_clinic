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
    grant_permissions!(@membership, "patients.read", "encounters.write", "observations.write", "notes.read", "notes.write", "notes.sign")
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
    assert_equal "tracking-board-v2", payload.fetch("schema_version")
    assert_equal [ @other_current.id, @current.id ], payload.fetch("visits").map { |visit| visit.fetch("encounter_id") }
    visit = payload.fetch("visits").find { |row| row.fetch("encounter_id") == @current.id }
    assert_equal @patient.id, visit.fetch("patient_id")
    assert_equal [ @patient.display_name, @patient.reference ], visit.fetch("patient").values_at("display_name", "reference")
    assert_equal [ "demographics", "display_name", "id", "membership", "reference" ], visit.fetch("patient").keys.sort
    assert_equal({ "age" => nil, "sex" => "not_recorded" }, visit.dig("patient", "demographics"))
    assert_equal "not_verified", visit.dig("patient", "membership")
    assert_includes response.body, @patient.display_name
    assert_nil visit.fetch("appointment")
    assert_equal "open", visit.dig("encounter", "status")
    assert_equal "encounter", visit.fetch("row_type")
    assert_equal "unrecorded", visit.fetch("operational_state")
    assert_equal "patient-care-summary-v1", visit.dig("care_summary", "schema_version")
    assert_equal [ @patient.id, @current.id ], visit.fetch("care_summary").values_at("patient_id", "encounter_id")
    assert_not visit.key?("stage")
    assert @practice.audit_events.where(action_code: "patients.read", outcome: "released").exists?
  end

  test "tracking board projects SOAP chart state without exposing note content" do
    get "/api/clinic/tracking_board", headers: @headers

    assert_response :success
    initial = response.parsed_body.fetch("visits").index_by { |visit| visit.fetch("encounter_id") }
    assert_equal "unopened", initial.fetch(@current.id).fetch("chart_status")
    assert_equal "unopened", initial.fetch(@other_current.id).fetch("chart_status")

    create_draft_note(@current)
    create_signed_note(@other_current, Time.utc(2026, 9, 2, 19))

    get "/api/clinic/tracking_board", headers: @headers

    assert_response :success
    visits = response.parsed_body.fetch("visits").index_by { |visit| visit.fetch("encounter_id") }
    assert_equal "draft", visits.fetch(@current.id).fetch("chart_status")
    assert_equal "signed", visits.fetch(@other_current.id).fetch("chart_status")
    assert_equal false, visits.fetch(@current.id).key?("notes")
  end

  test "tracking board does not disclose chart state without note read permission" do
    create_signed_note(@current, Time.utc(2026, 9, 2, 19))
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "patients.read")

    get "/api/clinic/tracking_board", headers: @headers

    assert_response :success
    visit = response.parsed_body.fetch("visits").find { |row| row.fetch("encounter_id") == @current.id }
    assert_equal "unavailable", visit.fetch("chart_status")
  end

  test "tracking board projects effective patient commercial membership for encounter and appointment rows" do
    now = Time.current
    Clinic::Care::PatientMembership.create!(
      practice: @practice, patient: @patient, recorded_by_membership: @membership,
      status: :member, version: 1, effective_from: now - 1.hour
    )
    Clinic::Care::PatientMembership.create!(
      practice: @practice, patient: @patient, recorded_by_membership: @membership,
      status: :nonmember, version: 2, effective_from: now - 30.minutes
    )
    appointment = @practice.appointments.create!(
      patient: @other_patient, starts_at: now + 1.hour, ends_at: now + 90.minutes, status: "scheduled"
    )
    Clinic::Care::PatientMembership.create!(
      practice: @practice, patient: @other_patient, recorded_by_membership: @membership,
      status: :member, version: 1, effective_from: now - 2.hours
    )
    Clinic::Care::PatientMembership.create!(
      practice: @practice, patient: @other_patient, recorded_by_membership: @membership,
      status: :nonmember, version: 2, effective_from: now - 1.hour, effective_until: now - 30.minutes
    )

    get "/api/clinic/tracking_board", headers: @headers

    assert_response :success
    rows = response.parsed_body.fetch("visits").index_by { |row| row.fetch("patient_id") }
    assert_equal "nonmember", rows.fetch(@patient.id).dig("patient", "membership")
    assert_equal "not_verified", rows.fetch(@other_patient.id).dig("patient", "membership")
    assert_equal "not_verified", rows.fetch(appointment.patient_id).dig("patient", "membership")
  end

  test "tracking board projects recorded numeric vitals without classifications" do
    %w[vital-systolic-bp vital-diastolic-bp vital-heart-rate vital-weight].zip([ 120, 78, 72, 82.5 ], [ "mm[Hg]", "mm[Hg]", "beats/min", "kg" ]).each do |code, value, unit|
      Clinic::Care::RecordObservation.call(
        practice: @practice, actor: @user, patient: @patient,
        attributes: {
          encounter_id: @current.id, code: code, code_system: "synthetic-vitals", code_version: "1",
          value_kind: "numeric", numeric_value: value, unit_code: unit,
          observed_at: @current.started_at, recorded_at: @current.started_at
        }, request_key: "board-vital-#{code}"
      )
    end

    get "/api/clinic/tracking_board", headers: @headers

    assert_response :success
    vitals = response.parsed_body.fetch("visits").find { |row| row.fetch("encounter_id") == @current.id }.fetch("vitals")
    assert_equal({ "systolic" => "120.0", "diastolic" => "78.0", "unit" => "mm[Hg]" }, vitals.fetch("blood_pressure"))
    assert_equal({ "value" => "72.0", "unit" => "beats/min" }, vitals.fetch("heart_rate"))
    assert_equal({ "value" => "82.5", "unit" => "kg" }, vitals.fetch("weight"))
    assert_not vitals.key?("status")
  end

  test "tracking board limits provider editing and roster sites to the actor grant" do
    allowed_site = @practice.sites.create!(code: "ALLOWED")
    denied_site = @practice.sites.create!(code: "DENIED")
    @current.update!(site: allowed_site)
    @other_current.update!(site: denied_site)
    department = @practice.departments.create!(code: "PRIMARY")
    provider_user = User.create!(email_address: "board-provider@example.invalid", password: SecureRandom.hex(18))
    provider_membership = @practice.memberships.create!(user: provider_user)
    provider = @practice.clinician_profiles.create!(membership: provider_membership, display_name: "Avery Rowan, NP")
    [ allowed_site, denied_site ].each do |site|
      provider.assignments.create!(practice: @practice, site: site, department: department,
        effective_from: 1.hour.ago)
    end
    denied_user = User.create!(email_address: "denied-board-provider@example.invalid", password: SecureRandom.hex(18))
    denied_membership = @practice.memberships.create!(user: denied_user)
    denied_provider = @practice.clinician_profiles.create!(membership: denied_membership, display_name: "Jordan Ellis, MD")
    denied_provider.assignments.create!(practice: @practice, site: denied_site, department: department,
      effective_from: 1.hour.ago)
    grant_permissions!(@membership, "encounters.assign_provider", scope_kind: "site", site: allowed_site)

    get "/api/clinic/tracking_board", headers: @headers

    assert_response :success
    visits = response.parsed_body.fetch("visits").index_by { |visit| visit.fetch("encounter_id") }
    assert_equal true, visits.fetch(@current.id).fetch("provider_assignment_available")
    assert_equal false, visits.fetch(@other_current.id).fetch("provider_assignment_available")
    roster = response.parsed_body.fetch("eligible_providers")
    assert_equal [ provider.id.to_s ], roster.pluck("clinician_profile_id")
    assert_equal [ allowed_site.id.to_s ], roster.sole.fetch("site_ids")
    assert_equal allowed_site.id.to_s,
      visits.fetch(@current.id).dig("encounter", "site_id")
  end

  test "tracking board projects local birthday age and recorded sex without date of birth" do
    travel_to Time.current + 1.hour do
      login
      board_date = Time.current.in_time_zone(@practice.timezone).to_date
      Clinic::Care::PatientDemographics.create!(
        practice: @practice, patient: @patient, date_of_birth: board_date - 26.years,
        sex: :female, primary_language: "English", interpreter_required: false
      )
      Clinic::Care::PatientDemographics.create!(
        practice: @practice, patient: @other_patient, date_of_birth: board_date - 25.years + 1.day,
        sex: :unknown, primary_language: "English", interpreter_required: false
      )

      get "/api/clinic/tracking_board", headers: @headers

      assert_response :success
      patients = response.parsed_body.fetch("visits").index_by { |visit| visit.fetch("patient_id") }
      assert_equal({ "age" => 26, "sex" => "female" }, patients.fetch(@patient.id).dig("patient", "demographics"))
      assert_equal({ "age" => 24, "sex" => "unknown" }, patients.fetch(@other_patient.id).dig("patient", "demographics"))
      assert_not response.body.include?("date_of_birth")
    end
  end

  test "tracking board includes scheduled appointments until an open encounter exists" do
    travel_to Time.current.tomorrow.beginning_of_day + 12.hours do
      login
      upcoming = @practice.appointments.create!(
        patient: @patient, starts_at: 1.hour.from_now, ends_at: 90.minutes.from_now, status: "scheduled"
      )
      on_time = @practice.appointments.create!(
        patient: @patient, starts_at: 15.minutes.ago, ends_at: 15.minutes.from_now, status: "confirmed"
      )
      late = @practice.appointments.create!(
        patient: @other_patient, starts_at: 1.hour.ago, ends_at: 30.minutes.ago, status: "confirmed"
      )
      tomorrow = @practice.appointments.create!(
        patient: @other_patient, starts_at: 1.day.from_now, ends_at: 1.day.from_now + 30.minutes, status: "confirmed"
      )

      get "/api/clinic/tracking_board", headers: @headers

      assert_response :success
      appointments = response.parsed_body.fetch("visits")
        .select { |visit| visit.fetch("row_type") == "appointment" }.index_by { |visit| visit.fetch("id") }
      assert_equal "upcoming", appointments.fetch(upcoming.id).fetch("operational_state")
      assert_nil appointments.fetch(upcoming.id).fetch("encounter_id")
      assert_nil appointments.fetch(upcoming.id).fetch("encounter")
      assert_nil appointments.fetch(upcoming.id).fetch("care_summary")
      assert_equal "on_time", appointments.fetch(on_time.id).fetch("operational_state")
      assert_equal "late", appointments.fetch(late.id).fetch("operational_state")
      refute appointments.key?(tomorrow.id)

      opened = @practice.encounters.create!(patient: @patient, appointment: upcoming,
        started_at: Time.current, status: "open")
      get "/api/clinic/tracking_board", headers: @headers
      rows = response.parsed_body.fetch("visits")
      appointments = rows.select { |visit| visit.fetch("row_type") == "appointment" }
      encounter = rows.find { |visit| visit.fetch("encounter_id") == opened.id }
      assert_equal "unrecorded", encounter.fetch("operational_state")
      assert_not appointments.any? { |visit| visit.fetch("id") == upcoming.id }
    end
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
    patient = @practice.patients.create!(display_name: "SYN_Scenario, Casey", reference: "SYN-TEST-LABEL-001")
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
    assert_equal "waiting_room", visit.fetch("operational_state")
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

  def create_draft_note(encounter)
    Clinic::Care::CreateEncounterNote.call(
      practice: @practice,
      actor: @user,
      encounter: encounter,
      note_kind: "soap",
      payload_version: Clinic::Care::SoapNotePayload::VERSION,
      request_key: "tracking-board-draft-#{encounter.id}",
      encrypted_body: Clinic::Care::SoapNotePayload.dump(
        template_id: "adult-physical-exam-detailed",
        template_version: 1,
        sections: { subjective: "synthetic", objective: "synthetic", assessment: "synthetic", plan: "synthetic" }
      )
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
