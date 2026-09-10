require "test_helper"
require_relative "../support/scribe_template_helpers"

class ScribeWorkspaceTest < ActionDispatch::IntegrationTest
  include ScribeTemplateHelpers

  PASSWORD = "Scribe-workspace-2026!".freeze

  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @user = User.create!(email_address: "scribe-#{SecureRandom.hex(5)}@example.invalid", password: PASSWORD)
    @practice = Clinic::Practice.create!(name: "Scribe Workspace Clinic", timezone: "UTC")
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "scribe.read", "scribe.write", "scribe.approve", "scribe.export", "scribe.delete",
      "patients.read", "observations.write", "notes.read", "notes.write", "notes.sign")
    @site = @practice.sites.create!(code: "SCRIBE", name: "Scribe clinic", status: "active")
    @patient = @practice.patients.create!(display_name: "Rivera, Avery", reference: "PAT-SCRIBE-001")
    create_scribe_template_catalog!
    login
  end

  test "reviewer context persists before consent without creating a spoken source and supports scoped search" do
    post "/api/clinic/scribe/encounters", params: { encounter: { patient_id: @patient.id, site_id: @site.id,
      context: { content: "Reviewer supplied visit context", source_type: "reviewer_authored" } } }, headers: csrf_headers, as: :json

    assert_response :created
    encounter = response.parsed_body.fetch("encounter")
    assert_equal "Reviewer supplied visit context", encounter.fetch("context_content")
    assert_equal({ "id" => @patient.id, "reference" => @patient.reference, "display_name" => @patient.display_name }, encounter.fetch("patient"))
    assert_empty Clinic::Scribe::Source.where(encounter_id: encounter.fetch("id"))
    raw_context = ApplicationRecord.connection.select_value(
      "SELECT context_content FROM clinic_scribe_encounters WHERE id = #{Integer(encounter.fetch('id'))}"
    )
    assert_not_includes raw_context, "Reviewer supplied visit context"

    get "/api/clinic/scribe/encounters", params: { q: "Aver" }, headers: @headers
    assert_response :success
    assert_equal [encounter.fetch("id")], response.parsed_body.fetch("encounters").pluck("id")
    get "/api/clinic/scribe/encounters", params: { q: "missing" }, headers: @headers
    assert_empty response.parsed_body.fetch("encounters")
  end

  test "visit launch lookup resumes only the requested patient and clinical encounter" do
    visits = [create_clinical_encounter, create_clinical_encounter]
    sessions = visits.map do |visit|
      post "/api/clinic/scribe/encounters", params: { encounter: {
        patient_id: @patient.id, clinical_encounter_id: visit.id
      } }, headers: csrf_headers, as: :json
      assert_response :created
      response.parsed_body.fetch("encounter")
    end
    get "/api/clinic/scribe/encounters", params: {
      patient_id: @patient.id, clinical_encounter_id: visits.first.id, per_page: 1
    }, headers: @headers
    assert_response :success
    assert_equal [sessions.first.fetch("id")], response.parsed_body.fetch("encounters").pluck("id")

    other_patient = @practice.patients.create!(display_name: "Morgan, Casey", reference: "PAT-SCRIBE-002")
    get "/api/clinic/scribe/encounters", params: {
      patient_id: other_patient.id, clinical_encounter_id: visits.first.id
    }, headers: @headers
    assert_response :success
    assert_empty response.parsed_body.fetch("encounters")
  end

  test "template catalog exposes SOAP and keeps labs disabled without an authorized source" do
    get "/api/clinic/scribe/templates", headers: @headers
    assert_response :success
    templates = response.parsed_body.fetch("templates")
    assert_equal "active", templates.find { |template| template.fetch("id") == "soap" }.fetch("status")
    labs = templates.find { |template| template.fetch("id") == "soap-with-labs" }
    assert_equal "disabled", labs.fetch("status")
    assert_includes labs.fetch("disabled_reason"), "authorized laboratory source contract"
  end

  test "context version conflicts and tenant scope reject stale or foreign writes" do
    encounter = create_context_encounter
    patch "/api/clinic/scribe/encounters/#{encounter.fetch('id')}/context",
      params: { context: { content: "Changed once", expected_version: encounter.fetch("version") } }, headers: csrf_headers, as: :json
    assert_response :success

    patch "/api/clinic/scribe/encounters/#{encounter.fetch('id')}/context",
      params: { context: { content: "Stale overwrite", expected_version: encounter.fetch("version") } }, headers: csrf_headers, as: :json
    assert_response :conflict

    foreign = Clinic::Practice.create!(name: "Foreign Scribe Clinic", timezone: "UTC")
    foreign_patient = foreign.patients.create!(display_name: "Foreign Patient", reference: "FOREIGN-001")
    foreign_encounter = Clinic::Scribe::Encounter.create!(practice: foreign, patient: foreign_patient, created_by: @user,
      template_id: "soap", template_version: 1)
    patch "/api/clinic/scribe/encounters/#{foreign_encounter.id}/context",
      params: { context: { content: "Cross tenant", expected_version: 0 } }, headers: csrf_headers, as: :json
    assert_response :not_found
  end

  test "context-only generation isolates multiple documents and supersedes only the target current revision" do
    encounter = create_context_encounter
    accept_consent(encounter.fetch("id"))
    first = generate(encounter.fetch("id"))
    second = generate(encounter.fetch("id"))
    assert_not_equal first.dig("document", "id"), second.dig("document", "id")

    refreshed = get_encounter(encounter.fetch("id"))
    first_document = refreshed.fetch("documents").find { |document| document.fetch("id") == first.dig("document", "id") }
    post "/api/clinic/scribe/encounters/#{encounter.fetch('id')}/generate",
      params: { generation: { template_id: "soap", document_id: first_document.fetch("id"),
        expected_version: first_document.fetch("version") } }, headers: csrf_headers, as: :json
    assert_response :created
    replacement = response.parsed_body

    revisions = get_encounter(encounter.fetch("id")).fetch("drafts")
      .select { |draft| draft.fetch("document_id") == first.dig("document", "id") }
    assert_equal false, revisions.find { |draft| draft.fetch("id") == first.dig("draft", "id") }.fetch("current")
    assert_equal replacement.dig("draft", "id"), replacement.dig("document", "current_draft_id")
    assert_equal second.dig("draft", "id"), get_encounter(encounter.fetch("id")).fetch("documents")
      .find { |document| document.fetch("id") == second.dig("document", "id") }.fetch("current_draft_id")
  end

  test "bulk save and restore append exact review-required revisions and stale context blocks approval" do
    encounter = create_context_encounter
    accept_consent(encounter.fetch("id"))
    generated = generate(encounter.fetch("id"))
    saved = save_sections(generated.fetch("draft"), subjective: "Exact manual subjective")
    assert_equal "Exact manual subjective", saved.dig("draft", "sections").find { |section| section.fetch("section_key") == "subjective" }.fetch("effective_content")
    assert saved.dig("draft", "sections").all? { |section| section.fetch("status") == "needs_review" }

    current = saved.fetch("draft")
    current = review_all(current)
    latest_encounter = get_encounter(encounter.fetch("id"))
    patch "/api/clinic/scribe/encounters/#{encounter.fetch('id')}/context",
      params: { context: { content: "New reviewer context", expected_version: latest_encounter.fetch("version") } },
      headers: csrf_headers, as: :json
    assert_response :success
    post "/api/clinic/scribe/drafts/#{current.fetch('id')}/approve",
      params: { expected_version: current.fetch("version") }, headers: csrf_headers, as: :json
    assert_response :conflict

    post "/api/clinic/scribe/drafts/#{generated.dig('draft', 'id')}/restore",
      params: { restore: { expected_version: current.fetch("version") } }, headers: csrf_headers, as: :json
    assert_response :created
    restored = response.parsed_body.fetch("draft")
    assert_equal generated.dig("draft", "sections").map { |section| section.fetch("effective_content") },
      restored.fetch("sections").map { |section| section.fetch("effective_content") }
    assert_nil restored.fetch("approved_at")
    assert restored.fetch("sections").all? { |section| section.fetch("status") == "needs_review" }
  end

  test "deletion scrubs encrypted context sources and revision content" do
    encounter = create_context_encounter
    accept_consent(encounter.fetch("id"))
    generated = generate(encounter.fetch("id"))
    delete "/api/clinic/scribe/encounters/#{encounter.fetch('id')}", headers: csrf_headers
    assert_response :success
    assert_nil response.parsed_body.dig("encounter", "context_content")
    assert generated.fetch("draft").fetch("sections").any? { |section| section.fetch("effective_content").present? }
    assert Clinic::Scribe::Draft.find(generated.dig("draft", "id")).sections.all? { |section| section.effective_content == "deleted" }
  end

  test "bound export writes one unsigned SOAP chart note and idempotent replay returns the same record" do
    clinical_encounter = create_clinical_encounter
    encounter = create_context_encounter
    post "/api/clinic/scribe/encounters/#{encounter.fetch('id')}/bind_clinical_encounter",
      params: { clinical_encounter: { clinical_encounter_id: clinical_encounter.id,
        expected_version: encounter.fetch("version") } }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal clinical_encounter.id, response.parsed_body.dig("encounter", "clinical_encounter_id")

    accept_consent(encounter.fetch("id"))
    current = save_sections(generate(encounter.fetch("id")).fetch("draft"), subjective: "Reviewed symptom history").fetch("draft")
    current = review_all(current)
    post "/api/clinic/scribe/drafts/#{current.fetch('id')}/approve",
      params: { expected_version: current.fetch("version") }, headers: csrf_headers, as: :json
    assert_response :success
    approved = response.parsed_body.fetch("draft")

    export_key = "scribe-chart-#{SecureRandom.hex(8)}"
    export_params = { export: { destination: "parent_record_adapter", idempotency_key: export_key,
      confirmed: true, expected_version: approved.fetch("version") } }
    post "/api/clinic/scribe/drafts/#{approved.fetch('id')}/export", params: export_params,
      headers: csrf_headers, as: :json
    assert_response :created
    first = response.parsed_body.fetch("export")
    assert_equal true, first.fetch("chart_written")

    note = clinical_encounter.notes.find(first.fetch("encounter_note_id"))
    revision = note.revisions.find(first.fetch("encounter_note_revision_id"))
    assert_empty note.signatures
    payload = Clinic::Care::SoapNotePayload.load!(revision.encrypted_body)
    assert_equal "scribe-reviewed-soap", payload.fetch(:template_id)
    assert_equal "Reviewed symptom history", payload.dig(:sections, :subjective)

    post "/api/clinic/scribe/drafts/#{approved.fetch('id')}/export", params: export_params,
      headers: csrf_headers, as: :json
    assert_response :created
    replay = response.parsed_body.fetch("export")
    assert_equal first.slice("id", "encounter_note_id", "encounter_note_revision_id"),
      replay.slice("id", "encounter_note_id", "encounter_note_revision_id")
    assert_equal 1, clinical_encounter.notes.where(note_kind: "soap").count
  end

  test "a corrected current lab version makes a reviewed Scribe draft stale" do
    lab_encounter = create_clinical_encounter
    lab_order = create_lab_order(lab_encounter)
    report = Clinic::Care::LabReports.create(
      practice: @practice, actor: @user, patient: @patient, request_key: "lab-create-#{SecureRandom.hex(8)}",
      confirmed_patient: true, source_name: "Clinic laboratory", external_report_id: nil,
      service_request_revision_id: lab_order.id,
      specimen: {
        specimen_identifier: nil, specimen_type_code: "venous-blood",
        specimen_type_display: "Venous blood", condition_code: "satisfactory"
      },
      version: lab_version_attributes(status: "final", value: "4.2")
    ).value
    first_version = report.current_version
    Clinic::Care::LabReports.review(practice: @practice, actor: @user, patient: @patient, report: report,
      version: first_version, request_key: "lab-review-#{SecureRandom.hex(8)}", confirmed_patient: true)

    encounter = create_context_encounter
    accept_consent(encounter.fetch("id"))
    encounter = get_encounter(encounter.fetch("id"))
    limited_user = User.create!(email_address: "scribe-lab-limited-#{SecureRandom.hex(5)}@example.invalid", password: PASSWORD)
    limited_membership = @practice.memberships.create!(user: limited_user)
    grant_permissions!(limited_membership, "scribe.write", "patients.read")
    assert_raises Clinic::Authorization::Denied do
      Clinic::Scribe::Workflow.replace_lab_selections!(encounter: Clinic::Scribe::Encounter.find(encounter.fetch("id")),
        actor: limited_user, lab_report_versions: [first_version], expected_version: encounter.fetch("version"))
    end
    assert_empty Clinic::Scribe::LabSelection.where(encounter_id: encounter.fetch("id"))

    post "/api/clinic/scribe/encounters/#{encounter.fetch('id')}/lab_selections",
      params: { lab_selections: { lab_report_version_ids: [first_version.id],
        expected_version: encounter.fetch("version") } }, headers: csrf_headers, as: :json
    assert_response :success
    generated = generate(encounter.fetch("id")).fetch("draft")
    objective = generated.fetch("sections").find { |section| section.fetch("section_key") == "objective" }
    assert_includes objective.fetch("effective_content"), "Clinic laboratory"
    assert_includes objective.fetch("effective_content"), "Potassium [2823-3]: 4.2 mmol/L"
    assert_equal [first_version.id], objective.dig("provenance", "lab_report_version_ids")
    assert_equal first_version.id,
      generated.fetch("input_sources").find { |source| source.fetch("kind") == "lab_report_version" }
        .fetch("lab_report_version_id")
    current = save_sections(generated, subjective: "Reviewed lab visit history").fetch("draft")
    current = review_all(current)

    corrected = Clinic::Care::LabReports.append_version(
      practice: @practice, actor: @user, patient: @patient, report: report,
      request_key: "lab-correction-#{SecureRandom.hex(8)}", confirmed_patient: true,
      expected_current_version_id: first_version.id,
      version: lab_version_attributes(status: "corrected", value: "4.6")
    ).value
    Clinic::Care::LabReports.review(practice: @practice, actor: @user, patient: @patient, report: report,
      version: corrected, request_key: "lab-correction-review-#{SecureRandom.hex(8)}", confirmed_patient: true)

    post "/api/clinic/scribe/drafts/#{current.fetch('id')}/approve",
      params: { expected_version: current.fetch("version") }, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "stale_record", response.parsed_body.fetch("code")

    post "/api/clinic/scribe/encounters/#{encounter.fetch('id')}/consent",
      params: { consent: { decision: "withdrawn", method: "in_person" } }, headers: csrf_headers, as: :json
    assert_response :success
    withdrawn = response.parsed_body.fetch("encounter")
    assert_empty Clinic::Scribe::LabSelection.where(encounter_id: encounter.fetch("id"))
    post "/api/clinic/scribe/encounters/#{encounter.fetch('id')}/lab_selections",
      params: { lab_selections: { lab_report_version_ids: [corrected.id],
        expected_version: withdrawn.fetch("version") } }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_empty Clinic::Scribe::LabSelection.where(encounter_id: encounter.fetch("id"))
  end

  test "export refuses to overwrite an existing SOAP chart note" do
    clinical_encounter = create_clinical_encounter
    Clinic::Care::CreateEncounterNote.call(
      practice: @practice, actor: @user, encounter: clinical_encounter, note_kind: "soap",
      encrypted_body: Clinic::Care::SoapNotePayload.dump(
        template_id: "scribe-reviewed-soap", template_version: 1,
        sections: { subjective: "Existing chart draft", objective: "", assessment: "", plan: "" }
      ),
      request_key: "existing-soap-#{SecureRandom.hex(8)}"
    )
    post "/api/clinic/scribe/encounters", params: { encounter: {
      patient_id: @patient.id, clinical_encounter_id: clinical_encounter.id,
      context: { content: "Reviewer supplied context", source_type: "reviewer_authored" }
    } }, headers: csrf_headers, as: :json
    assert_response :created
    encounter = response.parsed_body.fetch("encounter")
    accept_consent(encounter.fetch("id"))
    current = save_sections(generate(encounter.fetch("id")).fetch("draft"), subjective: "New Scribe draft").fetch("draft")
    current = review_all(current)
    post "/api/clinic/scribe/drafts/#{current.fetch('id')}/approve",
      params: { expected_version: current.fetch("version") }, headers: csrf_headers, as: :json
    assert_response :success
    approved = response.parsed_body.fetch("draft")

    post "/api/clinic/scribe/drafts/#{approved.fetch('id')}/export", params: { export: {
      destination: "parent_record_adapter", idempotency_key: "no-overwrite-#{SecureRandom.hex(8)}",
      confirmed: true, expected_version: approved.fetch("version")
    } }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "already has a SOAP note"
    assert_equal 1, clinical_encounter.notes.where(note_kind: "soap").count
    assert_empty Clinic::Scribe::Export.where(draft_id: approved.fetch("id"))
  end

  test "explicit Scribe correction appends to the selected signed Scribe chart revision and replays exactly" do
    clinical_encounter = create_clinical_encounter
    note = Clinic::Care::CreateEncounterNote.call(
      practice: @practice, actor: @user, encounter: clinical_encounter, note_kind: "soap",
      encrypted_body: Clinic::Care::SoapNotePayload.dump(
        template_id: "scribe-reviewed-soap", template_version: 1,
        sections: { subjective: "Signed chart history", objective: "", assessment: "", plan: "" }
      ),
      request_key: "signed-scribe-soap-#{SecureRandom.hex(8)}"
    )
    signed_revision = note.revisions.sole
    Clinic::Care::SignEncounterNote.call(
      note: note, actor: @user, revision_no: signed_revision.revision_no,
      content_digest: Digest::SHA256.hexdigest(signed_revision.encrypted_body),
      attestation_version: "synthetic-scribe-correction-v1"
    )
    approved = approved_bound_draft(clinical_encounter, subjective: "Reviewed corrected Scribe history")

    export_key = "scribe-correction-#{SecureRandom.hex(8)}"
    export_params = { export: {
      destination: "parent_record_adapter", idempotency_key: export_key, confirmed: true,
      expected_version: approved.fetch("version"), existing_note_action: "append_correction",
      encounter_note_id: note.id, expected_note_revision_id: signed_revision.id,
      expected_note_revision: signed_revision.revision_no, correction_reason: "Correct the signed transcription"
    } }
    post "/api/clinic/scribe/drafts/#{approved.fetch('id')}/export", params: export_params,
      headers: csrf_headers, as: :json
    assert_response :created
    first = response.parsed_body.fetch("export")
    correction = note.revisions.find(first.fetch("encounter_note_revision_id"))
    payload = Clinic::Care::SoapNotePayload.load!(correction.encrypted_body)

    assert_equal note.id, first.fetch("encounter_note_id")
    assert_equal signed_revision.id, correction.prior_revision_id
    assert_equal signed_revision.id, payload.dig(:correction, :corrected_revision_id)
    assert_equal "scribe_export", payload.dig(:correction, :source, :kind)
    assert_equal approved.fetch("id"), payload.dig(:correction, :source, :draft_id)
    assert_equal "Reviewed corrected Scribe history", payload.dig(:sections, :subjective)
    assert_empty correction.signatures
    assert_equal [signed_revision.id], note.signatures.pluck(:revision_id)

    post "/api/clinic/scribe/drafts/#{approved.fetch('id')}/export", params: export_params,
      headers: csrf_headers, as: :json
    assert_response :created
    assert_equal first, response.parsed_body.fetch("export")
    assert_equal 2, note.revisions.reload.count

    changed = Marshal.load(Marshal.dump(export_params))
    changed[:export][:correction_reason] = "Different correction request"
    post "/api/clinic/scribe/drafts/#{approved.fetch('id')}/export", params: changed,
      headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "idempotency_conflict", response.parsed_body.fetch("code")
    assert_equal 2, note.revisions.reload.count
  end

  test "Scribe correction refuses a signed chart note from another SOAP template" do
    clinical_encounter = create_clinical_encounter
    note = Clinic::Care::CreateEncounterNote.call(
      practice: @practice, actor: @user, encounter: clinical_encounter, note_kind: "soap",
      encrypted_body: Clinic::Care::SoapNotePayload.dump(
        template_id: "adult-physical-exam-detailed", template_version: 1,
        sections: { subjective: "Signed physical history", objective: "", assessment: "", plan: "" }
      ),
      request_key: "signed-other-template-#{SecureRandom.hex(8)}"
    )
    signed_revision = note.revisions.sole
    Clinic::Care::SignEncounterNote.call(
      note: note, actor: @user, revision_no: signed_revision.revision_no,
      content_digest: Digest::SHA256.hexdigest(signed_revision.encrypted_body),
      attestation_version: "synthetic-template-guard-v1"
    )
    approved = approved_bound_draft(clinical_encounter, subjective: "Reviewed Scribe mismatch")

    post "/api/clinic/scribe/drafts/#{approved.fetch('id')}/export", params: { export: {
      destination: "parent_record_adapter", idempotency_key: "scribe-template-guard-#{SecureRandom.hex(8)}",
      confirmed: true, expected_version: approved.fetch("version"), existing_note_action: "append_correction",
      encounter_note_id: note.id, expected_note_revision_id: signed_revision.id,
      expected_note_revision: signed_revision.revision_no, correction_reason: "Attempt template mismatch"
    } }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal 1, note.revisions.reload.count
    assert_empty Clinic::Scribe::Export.where(draft_id: approved.fetch("id"))
  end

  test "documentation worklist uses current Scribe drafts from completed visits" do
    needs_review_visit = create_clinical_encounter
    needs_review = create_bound_scribe_draft(needs_review_visit)
    first_draft_id = needs_review.dig("draft", "id")
    post "/api/clinic/scribe/encounters/#{needs_review.dig('encounter', 'id')}/generate",
      params: { generation: { template_id: "soap", document_id: needs_review.dig("document", "id"),
        expected_version: needs_review.dig("document", "version") } }, headers: csrf_headers, as: :json
    assert_response :created
    needs_review = response.parsed_body
    needs_review_visit.close!(ended_at: needs_review_visit.started_at + 30.minutes)

    changed_visit = create_clinical_encounter
    changed = create_bound_scribe_draft(changed_visit)
    patch "/api/clinic/scribe/encounters/#{changed.dig('encounter', 'id')}/context",
      params: { context: { content: "Updated after generation",
        expected_version: changed.dig("encounter", "version") } }, headers: csrf_headers, as: :json
    assert_response :success
    changed_visit.close!(ended_at: changed_visit.started_at + 30.minutes)

    ready_visit = create_clinical_encounter
    ready = create_bound_scribe_draft(ready_visit)
    ready_draft = save_sections(ready.fetch("draft"), subjective: "Reviewed completed visit").fetch("draft")
    ready_draft = review_all(ready_draft)
    post "/api/clinic/scribe/drafts/#{ready_draft.fetch('id')}/approve",
      params: { expected_version: ready_draft.fetch("version") }, headers: csrf_headers, as: :json
    assert_response :success
    ready_draft = response.parsed_body.fetch("draft")
    ready_visit.close!(ended_at: ready_visit.started_at + 30.minutes)

    open_visit = create_clinical_encounter
    open_draft = create_bound_scribe_draft(open_visit).fetch("draft")

    get "/api/clinic/scribe/encounters", headers: @headers
    assert_response :success
    worklist = response.parsed_body.fetch("documentation_worklist")
    items = worklist.fetch("items")

    assert_equal "recent_completed_visits", worklist.fetch("scope")
    assert_equal 25, worklist.fetch("candidate_limit_per_source")
    assert_equal false, worklist.fetch("truncated")
    assert_equal items.length, worklist.fetch("returned_count")
    assert_equal "needs_review", items.find { |item| item["draft_id"] == needs_review.dig("draft", "id") }.fetch("state")
    assert_equal "inputs_changed", items.find { |item| item["draft_id"] == changed.dig("draft", "id") }.fetch("state")
    assert_equal "ready_to_add_to_chart", items.find { |item| item["draft_id"] == ready_draft.fetch("id") }.fetch("state")
    refute_includes items.pluck("draft_id"), first_draft_id
    refute_includes items.pluck("draft_id"), open_draft.fetch("id")
    assert_equal items.count { |item| item.fetch("state") == "needs_review" },
      worklist.fetch("returned_counts").fetch("needs_review")
  end

  test "documentation worklist bounds latest unsigned notes and honors note access" do
    25.times do |index|
      encounter = create_clinical_encounter
      encounter.close!(ended_at: encounter.started_at + 30.minutes)
      create_soap_note_fixture(encounter, "Unsigned completed visit #{index}")
    end
    encounter = create_clinical_encounter
    encounter.close!(ended_at: encounter.started_at + 30.minutes)
    note = create_soap_note_fixture(encounter, "First current revision")
    first_revision = note.revisions.sole
    latest_revision = Clinic::Care::ReviseEncounterNote.call(
      note: note, actor: @user, encrypted_body: soap_payload("Latest current revision"), expected_revision: 1,
      request_key: "worklist-revise-#{SecureRandom.hex(8)}"
    )

    get "/api/clinic/scribe/encounters", headers: @headers
    assert_response :success
    worklist = response.parsed_body.fetch("documentation_worklist")
    unsigned_items = worklist.fetch("items").select { |item| item.fetch("state") == "unsigned_note" }

    assert_equal true, worklist.fetch("unsigned_notes_available")
    assert_equal true, worklist.fetch("truncated")
    assert_equal 25, unsigned_items.length
    assert_equal 25, worklist.fetch("returned_counts").fetch("unsigned_note")
    assert_equal latest_revision.id,
      unsigned_items.find { |item| item.fetch("note_id") == note.id }.fetch("note_revision_id")
    refute_includes unsigned_items.pluck("note_revision_id"), first_revision.id

    Clinic::Care::SignEncounterNote.call(
      note: note, actor: @user, revision_no: latest_revision.revision_no,
      content_digest: Digest::SHA256.hexdigest(latest_revision.encrypted_body),
      attestation_version: "scribe-worklist-v1"
    )
    get "/api/clinic/scribe/encounters", headers: @headers
    assert_response :success
    signed_worklist = response.parsed_body.fetch("documentation_worklist")
    assert_equal false, signed_worklist.fetch("truncated")
    assert_equal 25, signed_worklist.fetch("returned_counts").fetch("unsigned_note")
    refute signed_worklist.fetch("items").any? { |item| item["note_id"] == note.id }

    limited_user = User.create!(email_address: "scribe-worklist-limited-#{SecureRandom.hex(5)}@example.invalid", password: PASSWORD)
    limited_membership = @practice.memberships.create!(user: limited_user)
    grant_permissions!(limited_membership, "scribe.read", "patients.read")
    post "/api/session", params: { email_address: limited_user.email_address, password: PASSWORD },
      headers: csrf_headers, as: :json
    assert_response :success
    get "/api/clinic/scribe/encounters", headers: @headers
    assert_response :success
    limited_worklist = response.parsed_body.fetch("documentation_worklist")
    assert_equal false, limited_worklist.fetch("unsigned_notes_available")
    refute limited_worklist.fetch("items").any? { |item| item.fetch("kind") == "soap_note" }
  end

  private

  def create_bound_scribe_draft(clinical_encounter)
    post "/api/clinic/scribe/encounters", params: { encounter: {
      patient_id: @patient.id, clinical_encounter_id: clinical_encounter.id,
      context: { content: "Reviewer supplied context", source_type: "reviewer_authored" }
    } }, headers: csrf_headers, as: :json
    assert_response :created
    scribe_encounter = response.parsed_body.fetch("encounter")
    accept_consent(scribe_encounter.fetch("id"))
    generate(scribe_encounter.fetch("id"))
  end

  def create_soap_note_fixture(encounter, subjective)
    note = encounter.notes.create!(practice: @practice, patient: @patient, note_kind: "soap")
    note.revisions.create!(practice: @practice, revision_no: 1, author_membership: @membership,
      encrypted_body: soap_payload(subjective), payload_version: Clinic::Care::SoapNotePayload::VERSION)
    note
  end

  def soap_payload(subjective)
    Clinic::Care::SoapNotePayload.dump(
      template_id: "scribe-reviewed-soap", template_version: 1,
      sections: { subjective: subjective, objective: "", assessment: "", plan: "" }
    )
  end

  def create_context_encounter
    post "/api/clinic/scribe/encounters", params: { encounter: { patient_id: @patient.id, site_id: @site.id,
      context: { content: "Reviewer supplied context", source_type: "reviewer_authored" } } }, headers: csrf_headers, as: :json
    assert_response :created
    response.parsed_body.fetch("encounter")
  end

  def create_clinical_encounter
    @practice.encounters.create!(patient: @patient, site: @site, started_at: Time.current, status: "in_progress")
  end

  def create_lab_order(encounter)
    key = "scribe-lab-order-#{SecureRandom.hex(8)}"
    Clinic::Care::ServiceRequestRevision.create!(
      practice: @practice, patient: @patient, encounter:, site: @site, series_id: SecureRandom.uuid,
      version_number: 1, status: "active", recorded_by_membership: @membership, recorded_at: Time.current,
      request_key: key, content_digest: Digest::SHA256.hexdigest(key), request_kind: "lab", intent: "order",
      priority: "routine", requested_display: "Basic metabolic panel", destination: "External laboratory"
    )
  end

  def approved_bound_draft(clinical_encounter, subjective:)
    post "/api/clinic/scribe/encounters", params: { encounter: {
      patient_id: @patient.id, clinical_encounter_id: clinical_encounter.id,
      context: { content: "Reviewer supplied context", source_type: "reviewer_authored" }
    } }, headers: csrf_headers, as: :json
    assert_response :created
    encounter = response.parsed_body.fetch("encounter")
    accept_consent(encounter.fetch("id"))
    current = save_sections(generate(encounter.fetch("id")).fetch("draft"), subjective: subjective).fetch("draft")
    current = review_all(current)
    post "/api/clinic/scribe/drafts/#{current.fetch('id')}/approve",
      params: { expected_version: current.fetch("version") }, headers: csrf_headers, as: :json
    assert_response :success
    response.parsed_body.fetch("draft")
  end

  def lab_version_attributes(status:, value:)
    {
      title: "Basic metabolic panel", status: status,
      collected_at: Time.current - 1.hour, issued_at: Time.current,
      results: [ { name: "Potassium", code: "2823-3", value: value, unit: "mmol/L",
        reference_range: "3.5-5.1", flag: nil } ]
    }
  end

  def accept_consent(encounter_id)
    post "/api/clinic/scribe/encounters/#{encounter_id}/consent",
      params: { consent: { decision: "accepted", method: "in_person" } }, headers: csrf_headers, as: :json
    assert_response :success
  end

  def generate(encounter_id)
    post "/api/clinic/scribe/encounters/#{encounter_id}/generate",
      params: { generation: { template_id: "soap" } }, headers: csrf_headers, as: :json
    assert_response :created
    response.parsed_body
  end

  def save_sections(draft, subjective:)
    post "/api/clinic/scribe/drafts/#{draft.fetch('id')}/sections", params: { revision: {
      expected_version: draft.fetch("version"), sections: { subjective: subjective, objective: "Manual objective",
        assessment: "Manual assessment", plan: "Manual plan" }
    } }, headers: csrf_headers, as: :json
    assert_response :created
    response.parsed_body
  end

  def review_all(draft)
    Clinic::Scribe::Workflow::SECTIONS.each do |section_key|
      post "/api/clinic/scribe/drafts/#{draft.fetch('id')}/review", params: { review: {
        action: "accept", section_key: section_key, expected_version: draft.fetch("version")
      } }, headers: csrf_headers, as: :json
      assert_response :success
      draft = response.parsed_body.fetch("draft")
    end
    draft
  end

  def get_encounter(id)
    get "/api/clinic/scribe/encounters/#{id}", headers: @headers
    assert_response :success
    response.parsed_body.fetch("encounter")
  end

  def login
    post "/api/session", params: { email_address: @user.email_address, password: PASSWORD }, headers: csrf_headers, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
