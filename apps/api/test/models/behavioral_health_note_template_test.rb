require "test_helper"

class BehavioralHealthNoteTemplateTest < ActiveSupport::TestCase
  test "behavioral progress prompts preserve provenance without asserting normal findings" do
    template = Clinic::Care::NoteTemplateCatalog.fetch!("behavioral-health-progress", 1)
    assert_includes template[:caution], "not separately maintained psychotherapy notes"
    assert_includes template[:sections][:objective], "Actual session start, end and duration"
    assert_includes template[:sections][:assessment], "unknown is not negative"
    payload = Clinic::Care::SoapNotePayload.dump(template_id: template[:id], template_version: 1,
      sections: { subjective: "Patient reports difficulty sleeping", assessment: "Safety assessment not performed" },
      session_duration_minutes: 50)
    loaded = Clinic::Care::SoapNotePayload.load!(payload)
    assert_equal template[:id], loaded[:template_id]
    assert_equal "Safety assessment not performed", loaded.dig(:sections, :assessment)
    assert_empty loaded.dig(:sections, :objective)
    assert_equal 50, loaded[:session_duration_minutes]
  end

  test "actual session duration is optional revision data with explicit bounds" do
    payload = Clinic::Care::SoapNotePayload.dump(
      template_id: "behavioral-health-progress",
      template_version: 1,
      sections: { subjective: "Synthetic session" },
      session_duration_minutes: 45
    )

    assert_equal 45, Clinic::Care::SoapNotePayload.load!(payload)[:session_duration_minutes]
    assert_nil Clinic::Care::SoapNotePayload.load!(
      Clinic::Care::SoapNotePayload.dump(
        template_id: "behavioral-health-progress",
        template_version: 1,
        sections: { subjective: "Synthetic session" }
      )
    )[:session_duration_minutes]

    error = assert_raises(ArgumentError) do
      Clinic::Care::SoapNotePayload.dump(
        template_id: "behavioral-health-progress",
        template_version: 1,
        sections: { subjective: "Synthetic session" },
        session_duration_minutes: 0
      )
    end
    assert_equal "Actual session duration must be between 1 and 1440 minutes.", error.message

    assert_raises(ArgumentError) do
      Clinic::Care::SoapNotePayload.dump(
        template_id: "behavioral-health-progress",
        template_version: 1,
        sections: { subjective: "Synthetic session" },
        session_duration_minutes: 45.5
      )
    end
  end
end
