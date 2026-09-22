require "test_helper"

class BehavioralHealthNoteTemplateTest < ActiveSupport::TestCase
  test "behavioral progress prompts preserve provenance without asserting normal findings" do
    template = Clinic::Care::NoteTemplateCatalog.fetch!("behavioral-health-progress", 1)
    assert_includes template[:caution], "not separately maintained psychotherapy notes"
    assert_includes template[:sections][:objective], "Actual session start, end and duration"
    assert_includes template[:sections][:assessment], "unknown is not negative"
    payload = Clinic::Care::SoapNotePayload.dump(template_id: template[:id], template_version: 1,
      sections: { subjective: "Patient reports difficulty sleeping", assessment: "Safety assessment not performed" })
    loaded = Clinic::Care::SoapNotePayload.load!(payload)
    assert_equal template[:id], loaded[:template_id]
    assert_equal "Safety assessment not performed", loaded.dig(:sections, :assessment)
    assert_empty loaded.dig(:sections, :objective)
  end
end
