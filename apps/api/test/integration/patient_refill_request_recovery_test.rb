require "test_helper"

class PatientRefillRequestRecoveryTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @practice = Clinic::Practice.create!(name: "Synthetic Refill Recovery Practice", timezone: "UTC")
    @patient = @practice.patients.create!(display_name: "Synthetic Refill Recovery Patient", reference: "REFILL-RECOVERY-A")
    @other_patient = @practice.patients.create!(display_name: "Synthetic Other Refill Patient", reference: "REFILL-RECOVERY-B")
    @session, @session_headers, @identity = patient_session(@patient, "refill-recovery-a@example.invalid")
    @other_session, @other_headers = patient_session(@other_patient, "refill-recovery-b@example.invalid").first(2)
    @payload = { patient_portal_request: {
      request_key: "synthetic-refill-exact-recovery", request_type: "refill",
      medication_name: "Synthetic recovery medication", pharmacy_destination: "Synthetic recovery pharmacy",
      request_note: "Synthetic recovery note"
    } }
  end

  test "refill acknowledgement confirms exact replay and rejects changed or foreign patient attempts" do
    assert_difference "Clinic::PatientPortal::Request.count", 1 do
      submit(@session, @session_headers, @payload)
      assert_equal 201, @session.response.status
    end
    saved = @session.response.parsed_body.fetch("request")
    assert_equal "synthetic-refill-exact-recovery", saved.fetch("request_key")
    assert_equal "refill", saved.fetch("request_type")
    assert_equal "patient", saved.fetch("source")
    assert_equal "pending", saved.fetch("status")
    assert_equal "Synthetic recovery medication", saved.fetch("medication_name")
    assert_equal "Synthetic recovery pharmacy", saved.fetch("pharmacy_destination")
    assert_equal "Synthetic recovery note", saved.fetch("request_note")
    record = Clinic::PatientPortal::Request.find(saved.fetch("id"))
    original_attributes = record.attributes
    original_order_count = Clinic::Care::MedicationRequestRevision.count

    assert_no_difference "Clinic::PatientPortal::Request.count" do
      submit(@session, @session_headers, @payload)
      assert_equal 200, @session.response.status
      assert_equal saved, @session.response.parsed_body.fetch("request")
      assert_equal original_attributes, record.reload.attributes

      changed = @payload.deep_dup
      changed[:patient_portal_request][:pharmacy_destination] = "Synthetic different pharmacy"
      submit(@session, @session_headers, changed)
      assert_equal 422, @session.response.status
      assert_equal original_attributes, record.reload.attributes

      submit(@other_session, @other_headers, @payload)
      assert_equal 422, @other_session.response.status
      refute @other_session.response.parsed_body.key?("request")
    end
    @other_session.get "/api/patient_portal/requests", params: { request_type: "refill" }, headers: @other_headers
    assert_equal 200, @other_session.response.status
    assert_empty @other_session.response.parsed_body.fetch("requests")
    @session.get "/api/patient_portal/requests", params: { request_type: "refill" }, headers: @session_headers
    assert_equal 200, @session.response.status
    assert_equal [ saved.fetch("id") ], @session.response.parsed_body.fetch("requests").map { |request| request.fetch("id") }
    assert_equal original_order_count, Clinic::Care::MedicationRequestRevision.count
    assert_nil record.refill_response_delivery
  end

  test "another practice cannot read the refill and owns its separate key namespace" do
    submit(@session, @session_headers, @payload)
    assert_equal 201, @session.response.status
    original_id = @session.response.parsed_body.dig("request", "id")
    practice = Clinic::Practice.create!(name: "Synthetic Foreign Refill Practice", timezone: "UTC")
    patient = practice.patients.create!(display_name: "Synthetic Foreign Refill Patient", reference: "REFILL-RECOVERY-C")
    session, headers = patient_session(patient, "refill-recovery-c@example.invalid").first(2)
    session.get "/api/patient_portal/requests", params: { request_type: "refill" }, headers: headers
    assert_equal 200, session.response.status
    assert_empty session.response.parsed_body.fetch("requests")
    assert_difference "Clinic::PatientPortal::Request.count", 1 do
      submit(session, headers, @payload)
      assert_equal 201, session.response.status
    end
    foreign_id = session.response.parsed_body.dig("request", "id")
    assert_not_equal original_id, foreign_id
    assert_equal [ practice.id, patient.id ], Clinic::PatientPortal::Request.find(foreign_id).values_at(:practice_id, :patient_id)
    @session.get "/api/patient_portal/requests", params: { request_type: "refill" }, headers: @session_headers
    assert_equal [ original_id ], @session.response.parsed_body.fetch("requests").map { |request| request.fetch("id") }
  end

  test "exact refill replay still requires current active owning identity" do
    submit(@session, @session_headers, @payload)
    assert_equal 201, @session.response.status
    record = Clinic::PatientPortal::Request.find(@session.response.parsed_body.dig("request", "id"))
    original_attributes = record.attributes
    @identity.update!(status: "revoked", revoked_at: Time.current)
    assert_no_difference "Clinic::PatientPortal::Request.count" do
      submit(@session, @session_headers, @payload)
      assert_equal 404, @session.response.status
      refute @session.response.parsed_body.key?("request")
    end
    assert_equal original_attributes, record.reload.attributes
  end

  private

  def submit(session, headers, payload)
    session.post "/api/patient_portal/requests", params: payload, headers: headers, as: :json
  end

  def patient_session(patient, email)
    password = SecureRandom.hex(18)
    user = User.create!(email_address: email, password: password)
    identity = Clinic::PatientPortal::Identity.create!(practice: patient.practice, patient: patient, user: user,
      status: "active", invited_at: 1.day.ago, activated_at: 1.day.ago)
    session = open_session
    session.host! "localhost:3000"
    session.get "/api/csrf", headers: @headers
    headers = @headers.merge("X-CSRF-Token" => session.response.parsed_body.fetch("csrf_token"))
    session.post "/api/session", params: { email_address: email, password: password }, headers: headers, as: :json
    assert_equal 200, session.response.status
    session.get "/api/csrf", headers: @headers
    headers = @headers.merge("X-CSRF-Token" => session.response.parsed_body.fetch("csrf_token"))
    [ session, headers, identity ]
  end
end
