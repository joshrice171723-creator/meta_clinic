module ScribeTemplateHelpers
  def create_scribe_template_catalog!
    sections = { subjective: "", objective: "", assessment: "", plan: "" }
    Clinic::Scribe::NoteTemplate.create!(template_id: "soap", version: 1, label: "SOAP note",
      note_kind: "soap", status: "active", sections: sections)
    Clinic::Scribe::NoteTemplate.create!(template_id: "soap-with-labs", version: 1,
      label: "SOAP note with labs", note_kind: "soap", status: "disabled",
      disabled_reason: "An authorized laboratory source contract is required before this template can be used.",
      sections: sections)
  end
end
