require "test_helper"

class PatientEducationWorkflowTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Patient Education Test Organization")
    @practice = Clinic::Practice.create!(name: "Patient Education Test Practice", organization:, timezone: "UTC")
    @site = @practice.sites.create!(code: "EDUCATION")
    @user = User.create!(email_address: "patient-education@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "patients.read", "clinical_records.read", "observations.write")
    @patient = @practice.patients.create!(display_name: "Education Patient", reference: "EDU-001")
    @other_patient = @practice.patients.create!(display_name: "Other Education Patient", reference: "EDU-002")
    @encounter = @practice.encounters.create!(
      patient: @patient, site: @site, started_at: Time.utc(2026, 9, 10, 14), status: "open"
    )
    post "/api/session", params: { email_address: @user.email_address, password: @password },
      headers: csrf_headers, as: :json
    assert_response :success
  end

  test "teach-back evidence is immutable idempotent and creates one downstream follow-up task" do
    get education_path, headers: @headers
    assert_response :success
    assert_equal true, response.parsed_body.fetch("can_write")
    assert_includes response.parsed_body.dig("options", "teach_back_statuses"), "needs_reteaching"

    invalid = education_params("education-missing-response").deep_merge(
      education_event: { teach_back_status: "demonstrated", patient_response: "" }
    )
    post education_path, params: invalid, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_empty Clinic::Care::PatientEducationEvent.where(encounter: @encounter)

    request = education_params("education-reteach")
    post education_path, params: request, headers: csrf_headers, as: :json
    assert_response :created
    event_payload = response.parsed_body.fetch("education_event")
    event = Clinic::Care::PatientEducationEvent.find(event_payload.fetch("id"))
    assert_equal [ "needs_reteaching", true, "Spanish" ],
      event_payload.values_at("teach_back_status", "follow_up_needed", "language")
    assert_equal "Reviewed warning signs and when to call the clinic.", event_payload.fetch("reteaching_summary")
    raw_topic = ApplicationRecord.connection.select_value(
      "SELECT topic_title FROM clinic_patient_education_events WHERE id = #{event.id.to_i}"
    )
    refute_equal "Medication safety", raw_topic

    task = Clinic::ClinicalTask.find_by!(
      practice: @practice, patient: @patient, encounter: @encounter,
      task_kind: "patient_call", source_type: "encounter", source_id: @encounter.id
    )
    assert_equal [ "open", "clinical", @membership.id ],
      [ task.state, task.pool_code, task.recorded_by_membership_id ]

    post education_path, params: request, headers: csrf_headers, as: :json
    assert_response :created
    assert_equal event.id, response.parsed_body.dig("education_event", "id")
    assert_equal 1, Clinic::Care::PatientEducationEvent.where(encounter: @encounter).count
    assert_equal 1, Clinic::ClinicalTask.where(encounter: @encounter, task_kind: "patient_call").count

    get education_path, headers: @headers
    assert_response :success
    assert_equal event.id, response.parsed_body.fetch("events").sole.fetch("id")
    assert @practice.audit_events.exists?(action_code: "patient_education.record", outcome: "committed")

    assert_raises(ActiveRecord::StatementInvalid) do
      Clinic::Care::PatientEducationEvent.where(id: event.id).update_all(topic_title: "Rewritten education")
    end
  end

  test "patient context encounter state and audit failure cannot leave partial education evidence" do
    post education_path(patient: @other_patient), params: education_params("education-wrong-patient"),
      headers: csrf_headers, as: :json
    assert_response :not_found

    original_record = Clinic::AuditRecorder.method(:record!)
    Clinic::AuditRecorder.define_singleton_method(:record!) do |practice:, actor:, action_code:, **arguments|
      raise Clinic::AuditRecorder::Unavailable if action_code == "patient_education.record"

      original_record.call(practice:, actor:, action_code:, **arguments)
    end
    post education_path, params: education_params("education-audit-failure"), headers: csrf_headers, as: :json
    assert_response :service_unavailable
    assert_empty Clinic::Care::PatientEducationEvent.where(encounter: @encounter)
    assert_empty Clinic::ClinicalTask.where(encounter: @encounter, task_kind: "patient_call")
    assert_not Clinic::OperationReceipt.exists?(practice: @practice, request_key: "education-audit-failure")
    Clinic::AuditRecorder.define_singleton_method(:record!, original_record)

    @encounter.update!(status: "completed", ended_at: @encounter.started_at + 1.hour)
    post education_path, params: education_params("education-after-close"), headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_empty Clinic::Care::PatientEducationEvent.where(encounter: @encounter)
  ensure
    Clinic::AuditRecorder.define_singleton_method(:record!, original_record) if original_record
  end

  private

  def education_path(patient: @patient, encounter: @encounter)
    "/api/clinic/patients/#{patient.id}/encounters/#{encounter.id}/education_events"
  end

  def education_params(request_key)
    {
      education_event: {
        request_key:, topic_code: "medication", topic_title: "Medication safety",
        delivery_method: "handout", recipient: "patient", material_title: "Medication safety guide",
        language: "Spanish", interpreter_used: true, teach_back_status: "needs_reteaching",
        patient_response: "Patient described an incomplete response to warning signs.",
        reteaching_summary: "Reviewed warning signs and when to call the clinic.",
        follow_up_needed: true, follow_up_plan: "Call tomorrow to repeat teach-back."
      }
    }
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
