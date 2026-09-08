class WorkflowPropertyCase
  def clinical_property_error
    yield
    nil
  rescue ArgumentError, ActiveRecord::RecordInvalid, ActiveRecord::StaleObjectError,
    Clinic::Idempotency::Conflict, Clinic::Idempotency::InvalidRequest => error
    error.class.name
  end

  def notes_contract(input)
    patient = @practice.patients.create!(display_name: "Property Patient", reference: "PROPERTY-CLINICAL")
    encounter = @practice.encounters.create!(patient: patient, started_at: 1.hour.ago, status: "open")
    text = "Property note #{input.fetch('suffix', 1)}"
    payload = Clinic::Care::SoapNotePayload.dump(template_id: "scribe-reviewed-soap", template_version: 1, sections: { subjective: text })
    create = {practice: @practice, actor: @actor, encounter: encounter, encrypted_body: payload, note_kind: "soap", request_key: SecureRandom.uuid}
    action = input.fetch("action")
    if action == "blank_create"
      parsed = JSON.parse(payload)
      parsed["sections"].transform_values! { input.fetch("blank") }
      error = clinical_property_error { Clinic::Care::CreateEncounterNote.call(**create.merge(encrypted_body: JSON.generate(parsed))) }
      return {error: error, notes: encounter.notes.count}
    end
    if action == "invalid_close"
      error = clinical_property_error { Clinic::Scheduling::CloseEncounter.call(encounter: encounter, actor: @actor, request_key: SecureRandom.uuid, ended_at: encounter.started_at - input.fetch("seconds")) }
      return {error: error, status: encounter.reload.status, ended: !!encounter.ended_at}
    end
    if action == "close_retry"
      args = {encounter: encounter, actor: @actor, request_key: SecureRandom.uuid, ended_at: encounter.started_at + input.fetch("seconds")}
      first = Clinic::Scheduling::CloseEncounter.call(**args)
      replay = Clinic::Scheduling::CloseEncounter.call(**args)
      changed = clinical_property_error { Clinic::Scheduling::CloseEncounter.call(**args.merge(ended_at: args[:ended_at] + 1)) }
      return {same: first.id == replay.id, status: encounter.reload.status, changed: changed,
        receipts: Clinic::OperationReceipt.where(practice: @practice, request_key: args[:request_key]).count}
    end
    note = Clinic::Care::CreateEncounterNote.call(**create)
    original = note.revisions.sole
    if action == "create_retry"
      replay = Clinic::Care::CreateEncounterNote.call(**create)
      changed = clinical_property_error { Clinic::Care::CreateEncounterNote.call(**create.merge(encrypted_body: payload + " ")) }
      return {same: replay.id == note.id, notes: encounter.notes.count, revisions: note.revisions.count, changed: changed}
    end
    if action == "revise_retry"
      replacement = Clinic::Care::SoapNotePayload.dump(template_id: "scribe-reviewed-soap", template_version: 1, sections: {subjective: text + " revised"})
      args = {note: note, actor: @actor, encrypted_body: replacement, expected_revision: 1, request_key: SecureRandom.uuid}
      first = Clinic::Care::ReviseEncounterNote.call(**args)
      replay = Clinic::Care::ReviseEncounterNote.call(**args)
      stale = clinical_property_error { Clinic::Care::ReviseEncounterNote.call(**args.merge(request_key: SecureRandom.uuid)) }
      return {same: first.id == replay.id, revisions: note.revisions.count, original_preserved: original.reload.encrypted_body == payload, stale: stale}
    end
    sign = {note: note, actor: @actor, revision_no: 1, content_digest: Digest::SHA256.hexdigest(payload), attestation_version: "property-attestation-v1"}
    if action == "invalid_sign"
      sign[input.fetch("field").to_sym] = input.fetch("value")
      error = clinical_property_error { Clinic::Care::SignEncounterNote.call(**sign) }
      return {error: error, signatures: note.signatures.count}
    end
    if action == "unsigned_correction"
      correction = Clinic::Care::SoapNotePayload.dump_correction(template_id: "scribe-reviewed-soap", template_version: 1,
        sections: {subjective: text + " correction"}, corrected_revision_id: original.id, corrected_revision_no: 1, reason: "Correct wording")
      error = clinical_property_error { Clinic::Care::CorrectEncounterNote.call(note: note, actor: @actor, encrypted_body: correction,
        corrected_revision_id: original.id, expected_revision: 1, request_key: SecureRandom.uuid) }
      return {error: error, revisions: note.revisions.count}
    end
    signature = Clinic::Care::SignEncounterNote.call(**sign)
    if action == "sign_retry"
      replay = Clinic::Care::SignEncounterNote.call(**sign)
      edit = clinical_property_error { Clinic::Care::ReviseEncounterNote.call(note: note, actor: @actor, encrypted_body: payload,
        expected_revision: 1, request_key: SecureRandom.uuid) }
      return {same: signature.id == replay.id, signatures: note.signatures.count, revisions: note.revisions.count, edit: edit}
    end
    reason = action == "blank_correction" ? input.fetch("blank") : "Correct wording #{input.fetch('suffix', 1)}"
    correction = nil
    error = clinical_property_error {
      correction = Clinic::Care::SoapNotePayload.dump_correction(template_id: "scribe-reviewed-soap", template_version: 1,
        sections: {subjective: text + " correction"}, corrected_revision_id: original.id, corrected_revision_no: 1, reason: reason)
    }
    return {error: error, revisions: note.revisions.count} if action == "blank_correction"
    args = {note: note, actor: @actor, encrypted_body: correction, corrected_revision_id: original.id, expected_revision: 1, request_key: SecureRandom.uuid}
    first = Clinic::Care::CorrectEncounterNote.call(**args)
    replay = Clinic::Care::CorrectEncounterNote.call(**args)
    {same: first.id == replay.id, revisions: note.revisions.count, signatures: note.signatures.count,
      original_preserved: original.reload.encrypted_body == payload, unsigned_correction: first.signatures.empty?, prior: first.prior_revision_id == original.id}
  end

  def lab_contract(input)
    patient = @practice.patients.create!(display_name: "Property Patient", reference: "PROPERTY-LAB")
    action = input.fetch("action")
    value = input.fetch("suffix", 1).to_s
    version = {title: "Property lab report", status: "final", collected_at: 2.hours.ago, issued_at: 1.hour.ago,
      results: [{name: "Example measurement", value: value, unit: "example-unit"}]}
    create = {practice: @practice, actor: @actor, patient: patient, request_key: SecureRandom.uuid, confirmed_patient: true,
      source_name: "Example laboratory", external_report_id: SecureRandom.uuid, version: version}
    if action == "invalid_create"
      field = input.fetch("field")
      invalid = input.fetch("value")
      if %w[source_name confirmed_patient].include?(field)
        create[field.to_sym] = invalid
      elsif %w[name value].include?(field)
        version[:results][0][field.to_sym] = invalid
      else
        version[field.to_sym] = invalid
      end
      error = clinical_property_error { Clinic::Care::LabReports.create(**create) }
      return {error: error, reports: @practice.lab_reports.count}
    end
    report = Clinic::Care::LabReports.create(**create).value
    first = report.current_version
    if action == "create_retry"
      replay = Clinic::Care::LabReports.create(**create)
      return {same: replay.value.id == report.id, replayed: replay.replayed, reports: @practice.lab_reports.count, versions: report.report_versions.count}
    end
    review = {practice: @practice, actor: @actor, patient: patient, report: report, version: first, request_key: SecureRandom.uuid, confirmed_patient: true}
    if action == "required_follow_up_blank"
      error = clinical_property_error { Clinic::Care::LabReports.review(**review.merge(follow_up: {disposition: "required", note: input.fetch("blank")})) }
      return {error: error, reviewed: !!first.reload.reviewed_at, follow_up: !!first.follow_up}
    end
    if action == "follow_up_before_review"
      error = clinical_property_error { Clinic::Care::LabResultFollowUps.record(**review.except(:confirmed_patient).merge(disposition: "required", note: "Contact patient")) }
      return {error: error, follow_up: !!first.reload.follow_up}
    end
    if action == "version_retry"
      args = create.except(:source_name, :external_report_id).merge(report: report, request_key: SecureRandom.uuid,
        expected_current_version_id: first.id, version: version.merge(status: "corrected", results: [{name: "Example measurement", value: value + " revised"}]))
      second = Clinic::Care::LabReports.append_version(**args).value
      replay = Clinic::Care::LabReports.append_version(**args).value
      stale = clinical_property_error { Clinic::Care::LabReports.review(**review) }
      return {same: second.id == replay.id, versions: report.report_versions.count, original_value: first.reload.results.sole.fetch("value"), expected_value: value, stale: stale, prior_reviewed: !!first.reviewed_at}
    end
    reviewed = Clinic::Care::LabReports.review(**review.merge(follow_up: {disposition: "required", note: "Contact patient #{value}"})).value
    replay = Clinic::Care::LabReports.review(**review.merge(follow_up: {disposition: "required", note: "Contact patient #{value}"})).value
    if action == "review_retry"
      return {same: reviewed.id == replay.id, follow_ups: report.follow_ups.count, reviewed: !!first.reload.reviewed_at}
    end
    complete = review.except(:confirmed_patient).merge(request_key: SecureRandom.uuid, outcome: action == "completion_blank" ? input.fetch("blank") : "Contact completed #{value}")
    if action == "completion_blank"
      error = clinical_property_error { Clinic::Care::LabResultFollowUps.complete(**complete) }
      return {error: error, state: first.reload.follow_up.state}
    end
    done = Clinic::Care::LabResultFollowUps.complete(**complete).value
    again = Clinic::Care::LabResultFollowUps.complete(**complete).value
    {same: done.id == again.id, state: done.reload.state, follow_ups: report.follow_ups.count}
  end
end
