require "test_helper"

class PrevisitIntakeContractTest < ActiveSupport::TestCase
  Intake = Clinic::Care::PrevisitIntake
  Workflow = Clinic::Care::NurseWorkflow

  test "behavioral health uses scoped groups and preserves explicit answer states" do
    form = "behavioral-health-initial-v1"
    ids = Intake.fields(form).map { |field| field[:id] }
    assert_includes ids, "bh_functioning"
    %w[weight pregnancy_status treatment_product_class nutrition_pattern].each { |id| assert_not_includes ids, id }
    assert_equal 4, Workflow.chunks_for(form_id: form).size
    assert_equal ids.sort, Workflow.chunks_for(form_id: form).flat_map { |chunk| chunk[:fields] }.sort
    answers = { "bh_functioning" => { "state" => "answered", "value" => "Difficulty concentrating at work" },
      "bh_substance_context" => { "state" => "declined" }, "bh_history" => { "state" => "unknown" } }
    payload = Intake.decode(Intake.encode(text: "", answers:, attested: false, status: "draft", recorder: "staff", form_id: form))
    assert_equal form, payload["form_id"]
    assert_equal "declined", payload.dig("answers", "bh_substance_context", "state")
    assert_equal "unknown", payload.dig("answers", "bh_history", "state")
    assert_includes Intake.fields("behavioral-health-follow-up-v1").map { |field| field[:id] }, "treatment_response"
    original = Intake.encode(text: "", answers: { "goals" => "Prior visit goal" }, attested: true)
    historical = Intake.decode(original)
    assert_equal Intake::FORM_ID, historical["form_id"]
    assert_equal "Prior visit goal", historical.dig("answers", "goals", "value")
    assert_equal Intake::FORM_ID, Intake.form_for(practice: nil, payload: historical)[:id]
  end

  test "unconfigured scored instruments are not offered as completed screens" do
    %w[patient staff].each do |recorder|
      assert_not_includes Intake.fields_for_recorder(recorder:).map { |field| field[:id] }, "instrument_status"
    end
    assert Intake.fields.any? { |field| field[:id] == "instrument_status" }, "Legacy answers remain readable"
  end

  test "confirmed sections validate normalized answers and preserve unrelated reviews" do
    answers = Intake.fields.to_h { |field| [ field[:id], { "state" => "not_asked", "value" => "" } ] }
    questionnaire = { "text" => "", "status" => "submitted", "confirmed" => true,
      "confirmed_chunks" => [ 0 ], "answers" => answers }
    base = { status: "incomplete", identity_state: "not_confirmed", visit_reason_state: "not_recorded",
      history_state: "not_recorded", vitals_state: "not_recorded" }
    blank = questionnaire.deep_dup
    blank["answers"]["goals"] = { "state" => "answered", "value" => "  " }
    error = assert_raises(ArgumentError) { Workflow.normalize_intake(base.merge(questionnaire: blank)) }
    assert_match(/each question/, error.message)

    saved = Workflow.normalize_intake(base.merge(questionnaire: questionnaire))
    previous = Struct.new(:encrypted_questionnaire).new(saved[:encrypted_questionnaire])
    assert_raises(ArgumentError) do
      Workflow.normalize_intake(base.merge(questionnaire: blank), previous_intake: previous)
    end
    # A correction can be saved without pretending its prior confirmation is current.
    draft = blank.merge("status" => "draft", "confirmed" => false, "confirmed_chunks" => [])
    result = Workflow.normalize_intake(base.merge(questionnaire: draft), previous_intake: previous)
    assert_equal [], Intake.decode(result[:encrypted_questionnaire])["confirmed_chunks"]

    second = questionnaire.merge("confirmed_chunks" => [ 0, 1 ])
    saved = Workflow.normalize_intake(base.merge(questionnaire: second), previous_intake: previous)
    previous = Struct.new(:encrypted_questionnaire).new(saved[:encrypted_questionnaire])
    changed = second.deep_dup
    changed["answers"]["goals"] = { "state" => "answered", "value" => "Synthetic changed goal" }
    changed.merge!("status" => "draft", "confirmed" => false)
    error = assert_raises(ArgumentError) do
      Workflow.normalize_intake(base.merge(questionnaire: changed), previous_intake: previous)
    end
    assert_match(/affected section/, error.message)
    changed.merge!("status" => "submitted", "confirmed" => true)
    result = Workflow.normalize_intake(base.merge(questionnaire: changed), previous_intake: previous)
    assert_equal [ 0, 1 ], Intake.decode(result[:encrypted_questionnaire])["confirmed_chunks"]
    changed["answers"]["care_needs"] = { "state" => "answered", "value" => "Synthetic changed care need" }
    error = assert_raises(ArgumentError) do
      Workflow.normalize_intake(base.merge(questionnaire: changed), previous_intake: previous)
    end
    assert_match(/one intake section/, error.message)
  end

  test "schema versions reject invalid explicit values while preserving older records" do
    encoded = Intake.encode(text: "", answers: { goals: "Synthetic priority" }, attested: true, recorder: "staff")
    payload = Intake.decode(encoded)
    [ 0, -1, false, nil, "2", Intake::QUESTIONNAIRE_VERSION + 1 ].each do |version|
      assert_nil Intake.decode(Intake::PREFIX + payload.merge("questionnaire_version" => version).to_json)
    end
    [ 1, 2, Intake::QUESTIONNAIRE_VERSION ].each do |version|
      assert Intake.decode(Intake::PREFIX + payload.merge("questionnaire_version" => version).to_json)
    end
    assert Intake.decode(Intake::PREFIX + payload.except("questionnaire_version").to_json)
  end

  test "reproductive questions remain independent and every specialty question belongs to a group" do
    %w[pregnancy_plans breastfeeding_status contraception_context].each do |id|
      field = Intake.fields.find { |item| item[:id] == id }
      assert_nil field[:depends_on]
    end
    Intake::SPECIALTY_FORMS.each do |form_id, fields|
      grouped = Workflow.chunks_for(form_id:).flat_map { |chunk| chunk[:fields] }
      assert_empty fields.map { |field| field[:id] } - grouped, form_id
    end
  end

  test "nested visibility respects multiselect and hidden ancestors" do
    fields = [
      { id: "domains" },
      { id: "use", depends_on: "domains", depends_values: ["medication"] },
      { id: "details", depends_on: "use", depends_values: ["yes", "unknown"] }
    ]
    answers = { "domains" => { "state" => "answered", "values" => ["medication"] },
      "use" => { "state" => "unknown" } }
    assert Intake.visible?(fields.last, answers, definitions: fields)
    answers["domains"]["values"] = ["sleep"]
    assert_not Intake.visible?(fields.last, answers, definitions: fields)
  end

  test "review summary retains all captured history detail without inferring a clinical decision" do
    answers = {
      allergies: { state: "answered", entries: [ { name: "Synthetic product", kind: "intolerance", details: "Synthetic reaction detail" } ] },
      history: { state: "answered", entries: [ { name: "Synthetic condition", kind: "other", managing_clinician: "Synthetic clinician", details: "Synthetic complication" } ] },
      prior_approaches: { state: "answered", entries: [ { name: "Synthetic program", kind: "diet_program", stop_reason: "cost_or_access", adverse_effects: "reported", adverse_effect_details: "Synthetic effect" } ] },
      procedures: { state: "answered", entries: [ { name: "Synthetic procedure", kind: "procedure", complication_state: "known", complication_details: "Synthetic procedure detail" } ] }
    }
    rendered = Intake.render(Intake.encode(text: "", answers:, attested: true, recorder: "staff"))
    [ "Synthetic reaction detail", "Synthetic clinician", "Synthetic complication", "cost_or_access",
      "Synthetic effect", "Synthetic procedure detail" ].each { |value| assert_includes rendered, value }
    assert_includes rendered, "not a patient attestation or clinical review"
  end
end
