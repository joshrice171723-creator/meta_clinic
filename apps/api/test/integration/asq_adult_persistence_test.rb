require "test_helper"

class AsqAdultPersistenceTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    organization = Organization.create!(name: "Synthetic ASQ Persistence Organization")
    @practice = Clinic::Practice.create!(organization:, name: "Synthetic ASQ Persistence Practice", timezone: "UTC")
    @password = SecureRandom.hex(18)
    @user = User.create!(email_address: "asq-persistence@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "patients.read", "clinical_records.read", "intake.write", "notes.sign", "facilities.write")
    @site = @practice.sites.create!(code: "ASQ", status: "active")
    @practice.visit_types.create!(code: "Synthetic ASQ shared visit")
    Clinic::Configuration::PracticeFeatures.revise(practice: @practice, site: @site, actor: @membership,
      request_key: "asq-persistence-profile", expected_revision: 0, insurance_workflows_enabled: false,
      clinic_type: "behavioral_health", service_scope: [], assessment_scope: [ "psychiatry_assessment" ], finalize: true)
    @patient = @practice.patients.create!(display_name: "Synthetic ASQ Persistence Patient", reference: "SYN-ASQ-PERSISTENCE")
    @encounter = @practice.encounters.create!(patient: @patient, site: @site, started_at: Time.current, status: "open")
    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  test "current thoughts survives earlier answer correction persisted review and exact retry" do
    instrument = Clinic::Care::AsqAdultAssessment
    initial = save_assessment(nil, {
      category: "psychiatry_assessment", instrument_name: instrument::NAME, instrument_version: instrument::VERSION,
      response_source: "clinician_observed", assessed_at: Time.current.iso8601(6),
      response_summary: "Synthetic persistence verification only", item_responses: responses(q1: "yes", q5: "yes")
    }, "asq-initial")
    assert_equal "acute_positive", initial.fetch("score_value")

    corrected = save_assessment(initial, { item_responses: responses(q1: "no", q5: "yes") }, "asq-earlier-correction")
    assert_equal "acute_positive", corrected.fetch("score_value")
    assert_equal "yes", answer(corrected, "q5")
    assert_equal initial.fetch("id"), corrected.fetch("prior_revision_id")
    reloaded = workspace_assessment(corrected.fetch("id"))
    assert_equal "acute_positive", reloaded.fetch("score_value")
    assert_equal "yes", answer(reloaded, "q5")

    explicit = save_assessment(corrected, { item_responses: responses(q1: "no", q5: "no") }, "asq-explicit-correction")
    assert_equal "negative", explicit.fetch("score_value")
    assert_equal "no", answer(workspace_assessment(explicit.fetch("id")), "q5")

    review = {
      version: instrument::PROTOCOL_VERSION, findings: "Synthetic entered findings", disposition: "emergency_evaluation",
      disposition_reason: "Synthetic entered rationale", safety_plan: "Synthetic entered plan",
      means_discussion: "Synthetic entered discussion", resources: "Synthetic entered resources",
      urgent_actions: "Synthetic entered action documentation", follow_up_action: "Synthetic entered next action",
      coverage_exception: "Synthetic explicit coverage exception"
    }
    attributes = { item_responses: responses(q1: "no", q5: "yes"), status: "completed", follow_up_plan: review.to_json }
    completed = save_assessment(explicit, attributes, "asq-reviewed")
    assert_equal "acute_positive", completed.fetch("score_value")
    assert_equal "completed", completed.fetch("status")
    assert_equal @membership.id, completed.fetch("reviewer_membership_id")
    assert completed.fetch("reviewed_at").present?
    assert_equal "yes", answer(workspace_assessment(completed.fetch("id")), "q5")
    assert_no_difference "Clinic::Care::AssessmentRevision.count" do
      replay = save_assessment(explicit, attributes, "asq-reviewed")
      assert_equal completed.values_at("id", "reviewed_at", "version_number"), replay.values_at("id", "reviewed_at", "version_number")
    end
    [ [ corrected, "yes", "acute_positive" ], [ explicit, "no", "negative" ] ].each do |record, value, result|
      historical = Clinic::Care::AssessmentRevision.find(record.fetch("id"))
      assert_equal result, historical.score_value
      assert_equal value, instrument.response_evidence(historical).fetch(:items).find { |item| item.fetch("item_id") == "q5" }.fetch("value")
    end
    get "#{workspace_path}/clinical_plan_workspace", headers: @headers
    assert_response :success
    history = response.parsed_body.fetch("asq_history")
    assert_equal "acute_positive", history.find { |record| record.fetch("id") == corrected.fetch("id") }.fetch("result")
    assert_equal false, history.find { |record| record.fetch("id") == corrected.fetch("id") }.fetch("comparable")
    assert_equal true, history.find { |record| record.fetch("id") == completed.fetch("id") }.fetch("comparable")
    stored = Clinic::Care::AssessmentRevision.find(completed.fetch("id"))
    assert_empty stored.item_responses
    raw = ApplicationRecord.connection.select_value("SELECT response_summary FROM clinic_assessment_revisions WHERE id = #{stored.id}")
    refute_includes raw, "Synthetic persistence verification only"
    refute_includes raw, '"item_id":"q5"'
  end

  private

  def answer(record, id)
    record.fetch("item_responses").find { |item| item.fetch("item_id") == id }&.fetch("value", nil)
  end

  def responses(q1:, q5:)
    answers = { "q1" => q1, "q5" => q5 }
    %w[q1 q2 q3 q4 q5].map do |item_id|
      { item_id:, state: "answered", value: answers.fetch(item_id, "no") }
    end + [ { item_id: "adult_eligibility", state: "answered", value: "recorder_attestation" } ]
  end

  def workspace_path
    "/api/clinic/patients/#{@patient.id}/encounters/#{@encounter.id}"
  end

  def save_assessment(previous, attributes, key)
    payload = { assessment: attributes.merge(request_key: key) }
    if previous
      payload[:assessment][:expected_version] = previous.fetch("version_number")
      patch "#{workspace_path}/assessments/#{previous.fetch('series_id')}", params: payload, headers: csrf_headers, as: :json
    else
      post "#{workspace_path}/assessments", params: payload, headers: csrf_headers, as: :json
    end
    assert_response :created
    response.parsed_body.fetch("assessment")
  end

  def workspace_assessment(id)
    get "#{workspace_path}/clinical_plan_workspace", headers: @headers
    assert_response :success
    response.parsed_body.fetch("records").fetch("assessments").find { |record| record.fetch("id") == id } || raise("Saved assessment missing")
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    assert_response :success
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
