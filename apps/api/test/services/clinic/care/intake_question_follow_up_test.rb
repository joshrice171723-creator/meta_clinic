require "test_helper"

class IntakeQuestionFollowUpTest < ActiveSupport::TestCase
  FollowUp = Clinic::Care::IntakeQuestionFollowUp
  Intake = Clinic::Care::PrevisitIntake

  def payload(state = "unknown")
    Intake.decode(Intake.encode(text: "", answers: { "goals" => { "state" => state, "value" => "" } },
      attested: false, status: "draft", recorder: "staff"))
  end

  test "question follow-up preserves unknown and declined source without assigning work" do
    %w[unknown declined not_asked unanswered negative not_applicable].each do |state|
      value = payload(state)
      entries = FollowUp.normalize({ "goals" => { "reason" => "Synthetic reason", "next_action" => "Discuss the recorded question" } }, form_id: Intake::FORM_ID)
      FollowUp.attach!(payload: value, prior: nil, entries:, member: Struct.new(:id).new(7), revision_version: 3)
      record = value.fetch("question_follow_up").fetch("goals")
      assert_equal state, record.dig("source_answer", "state")
      assert_equal state, value.dig("answers", "goals", "state")
      assert_equal 3, record["source_revision_version"]
      assert_equal 7, record["recorded_by_membership_id"]
      assert_equal Intake::FORM_ID, record["source_form_id"]
      assert_equal "What would you like help with?", record.dig("question", "label")
      assert_includes Intake.render(Intake::PREFIX + JSON.generate(value)), "Next action: Discuss the recorded question"
    end
  end

  test "question follow-up preserves prior context until explicitly rerecorded" do
    original = payload
    input = { "goals" => { "reason" => "Synthetic reason", "next_action" => "Discuss the question" } }
    entries = FollowUp.normalize(input, form_id: Intake::FORM_ID)
    FollowUp.attach!(payload: original, prior: nil, entries:, member: Struct.new(:id).new(7), revision_version: 1)
    original_copy = original.deep_dup
    corrected = payload("declined")
    FollowUp.attach!(payload: corrected, prior: original, entries:, member: Struct.new(:id).new(8), revision_version: 2)
    assert_equal original["question_follow_up"], corrected["question_follow_up"]
    assert_includes FollowUp.render(corrected).join, "Answer changed since"
    input["goals"]["rebind"] = true
    FollowUp.attach!(payload: corrected, prior: original, entries: FollowUp.normalize(input, form_id: Intake::FORM_ID),
      member: Struct.new(:id).new(8), revision_version: 2)
    assert_equal "declined", corrected.dig("question_follow_up", "goals", "source_answer", "state")
    assert_equal 2, corrected.dig("question_follow_up", "goals", "source_revision_version")
    assert_equal original_copy, original
    unchanged = payload
    FollowUp.attach!(payload: unchanged, prior: original, entries: nil, member: Struct.new(:id).new(8), revision_version: 3)
    assert_equal original["question_follow_up"], unchanged["question_follow_up"]
    FollowUp.attach!(payload: unchanged, prior: original, entries: {}, member: Struct.new(:id).new(8), revision_version: 3)
    assert_empty unchanged["question_follow_up"]
  end

  test "question follow-up rejects unknown questions incomplete text and forged metadata" do
    valid = { "reason" => "Synthetic reason", "next_action" => "Discuss the question" }
    [ { "missing" => valid }, { "goals" => valid.merge("reason" => " ") },
      { "goals" => valid.merge("next_action" => "x" * 601) },
      { "goals" => valid.merge("recorded_by_membership_id" => 9) },
      { "goals" => valid.merge("rebind" => "true") }, [] ].each do |input|
      assert_raises(ArgumentError) { FollowUp.normalize(input, form_id: Intake::FORM_ID) }
    end
  end
end
