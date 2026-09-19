require "test_helper"

class PrevisitIntakeContractTest < ActiveSupport::TestCase
  Intake = Clinic::Care::PrevisitIntake
  Workflow = Clinic::Care::NurseWorkflow

  test "confirmed chunks validate normalized answers and cannot keep changed downstream confirmations" do
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
    error = assert_raises(ArgumentError) do
      Workflow.normalize_intake(base.merge(questionnaire: changed), previous_intake: previous)
    end
    assert_match(/reconfirming/, error.message)
    changed["confirmed_chunks"] = [ 0 ]
    result = Workflow.normalize_intake(base.merge(questionnaire: changed), previous_intake: previous)
    assert_equal [ 0 ], Intake.decode(result[:encrypted_questionnaire])["confirmed_chunks"]
  end

  test "schema versions reject invalid explicit values while preserving older records" do
    encoded = Intake.encode(text: "", answers: { goals: "Synthetic priority" }, attested: true, recorder: "staff")
    payload = Intake.decode(encoded)
    [ 0, -1, false, nil, "2", 3 ].each do |version|
      assert_nil Intake.decode(Intake::PREFIX + payload.merge("questionnaire_version" => version).to_json)
    end
    [ 1, 2 ].each do |version|
      assert Intake.decode(Intake::PREFIX + payload.merge("questionnaire_version" => version).to_json)
    end
    assert Intake.decode(Intake::PREFIX + payload.except("questionnaire_version").to_json)
  end

  test "reproductive questions remain independent and every specialty question belongs to a group" do
    %w[pregnancy_plans breastfeeding_status contraception_context].each do |id|
      field = Intake.fields.find { |item| item[:id] == id }
      assert_nil field[:depends_on]
    end
    grouped = Workflow::INTAKE_CHUNKS.flat_map { |chunk| chunk[:fields] }
    Intake::SPECIALTY_FORMS.each do |form_id, fields|
      assert_empty fields.map { |field| field[:id] } - grouped, form_id
    end
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
