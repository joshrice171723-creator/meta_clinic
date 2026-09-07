require "test_helper"

class ClinicEncounterNotesIdempotencyTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Synthetic Note Idempotency Organization")
    @user = User.create!(email_address: "note-idempotency@example.invalid", password: @password)
    @practice = Clinic::Practice.create!(name: "Synthetic Note Idempotency Practice", organization: organization)
    @membership = @practice.memberships.create!(user: @user)
    @site = @practice.sites.create!(code: "NOTES")
    grant_permissions!(@membership, "notes.read", "notes.write", "notes.sign", scope_kind: "site", site: @site)
    @patient = @practice.patients.create!(display_name: "SYN_Notes, Avery", reference: "SYN-NOTES-001")
    @other_patient = @practice.patients.create!(display_name: "SYN_Notes, Briar", reference: "SYN-NOTES-002")
    @encounter = @practice.encounters.create!(patient: @patient, site: @site,
      started_at: Time.utc(2026, 9, 2, 14), status: "open")
    login
  end

  test "requires a valid client request key at the API boundary" do
    post "/api/clinic/encounters/#{@encounter.id}/notes",
      params: create_params(request_key: "bad key"), headers: csrf_headers, as: :json

    assert_response :bad_request
    assert_equal "request_key", response.parsed_body.fetch("field")
    assert_empty @encounter.notes
    assert_not Clinic::OperationReceipt.exists?(practice: @practice)
  end

  test "identical create retries return the same note without mutation replay" do
    params = create_params(request_key: "note-create-retry")
    post "/api/clinic/encounters/#{@encounter.id}/notes", params: params, headers: csrf_headers, as: :json
    assert_response :created
    first = response.parsed_body

    post "/api/clinic/encounters/#{@encounter.id}/notes", params: params, headers: csrf_headers, as: :json
    assert_response :created
    assert_equal first, response.parsed_body
    assert_equal 1, @encounter.notes.reload.count
    assert_equal 1, @encounter.notes.sole.revisions.count
    assert_equal 1, Clinic::OperationReceipt.where(practice: @practice, request_key: "note-create-retry").count
    assert_equal 1, @practice.audit_events.where(action_code: "notes.create", outcome: "committed").count
  end

  test "create receipt records the created note resource for replay" do
    first_params = create_params(request_key: "note-create-specific")
    post "/api/clinic/encounters/#{@encounter.id}/notes", params: first_params, headers: csrf_headers, as: :json
    assert_response :created
    first = response.parsed_body
    receipt = Clinic::OperationReceipt.find_by!(practice: @practice, request_key: "note-create-specific")
    assert_equal "Clinic::EncounterNote", receipt.resource_type
    assert_equal first.fetch("note").fetch("id"), receipt.resource_id

    post "/api/clinic/encounters/#{@encounter.id}/notes", params: first_params, headers: csrf_headers, as: :json
    assert_response :created
    assert_equal first, response.parsed_body
    assert_equal first.fetch("note").fetch("id"), response.parsed_body.fetch("note").fetch("id")
  end

  test "create replay remains compatible with a legacy encounter resource receipt" do
    body = Clinic::Care::SoapNotePayload.dump(
      template_id: "adult-physical-exam-detailed",
      template_version: 1,
      sections: {
        subjective: "Synthetic legacy replay",
        objective: "Synthetic objective",
        assessment: "",
        plan: ""
      }
    )
    payload = {
      encounter_id: @encounter.id,
      patient_id: @encounter.patient_id,
      note_kind: "soap",
      payload_version: Clinic::Care::SoapNotePayload::VERSION,
      encrypted_body: body
    }
    original_note = Clinic::Care::CreateEncounterNote.call(
      practice: @practice,
      actor: @user,
      encounter: @encounter,
      note_kind: "soap",
      encrypted_body: body,
      request_key: "note-create-legacy-original",
      payload_version: Clinic::Care::SoapNotePayload::VERSION
    )
    Clinic::OperationReceipt.create!(
      practice: @practice,
      actor_membership: @membership,
      operation_code: "notes.create",
      request_key: "note-create-legacy-resource",
      payload_digest: Clinic::Idempotency.payload_digest(payload),
      digest_algorithm: Clinic::Idempotency::DIGEST_ALGORITHM,
      digest_key_id: Clinic::Idempotency::DEFAULT_DIGEST_KEY_ID,
      outcome: :committed,
      resource_type: "Clinic::Encounter",
      resource_id: @encounter.id
    )
    note = Clinic::Care::CreateEncounterNote.call(
      practice: @practice,
      actor: @user,
      encounter: @encounter,
      note_kind: "soap",
      encrypted_body: body,
      request_key: "note-create-legacy-resource",
      payload_version: Clinic::Care::SoapNotePayload::VERSION
    )

    assert_equal original_note.id, note.id
    assert_equal @encounter.id, note.encounter_id
    assert_equal "Synthetic legacy replay",
      Clinic::Care::SoapNotePayload.load!(note.revisions.sole.encrypted_body).dig(:sections, :subjective)
  end

  test "changed create retry conflicts and does not create a second note" do
    post "/api/clinic/encounters/#{@encounter.id}/notes",
      params: create_params(request_key: "note-create-conflict"), headers: csrf_headers, as: :json
    assert_response :created

    changed = create_params(request_key: "note-create-conflict", subjective: "Synthetic changed SOAP draft")
    post "/api/clinic/encounters/#{@encounter.id}/notes", params: changed, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "idempotency_conflict", response.parsed_body.fetch("code")
    assert_equal 1, @encounter.notes.reload.count
    assert_equal 1, Clinic::OperationReceipt.where(practice: @practice, request_key: "note-create-conflict").count
  end

  test "identical and changed revise retries preserve the exact revision chain" do
    post "/api/clinic/encounters/#{@encounter.id}/notes",
      params: create_params(request_key: "note-revise-create"), headers: csrf_headers, as: :json
    note_id = response.parsed_body.dig("note", "id")
    revision_params = revise_params(request_key: "note-revise-retry")

    post "/api/clinic/notes/#{note_id}/revisions", params: revision_params, headers: csrf_headers, as: :json
    assert_response :created
    first = response.parsed_body

    post "/api/clinic/notes/#{note_id}/revisions", params: revision_params, headers: csrf_headers, as: :json
    assert_response :created
    assert_equal first, response.parsed_body
    assert_equal 2, @encounter.notes.sole.revisions.count

    changed = revise_params(request_key: "note-revise-retry", subjective: "Synthetic changed revision")
    post "/api/clinic/notes/#{note_id}/revisions", params: changed, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "idempotency_conflict", response.parsed_body.fetch("code")
    assert_equal 2, @encounter.notes.sole.revisions.reload.count
    assert_equal 1, @practice.audit_events.where(action_code: "notes.revise", outcome: "committed").count
  end

  test "signed SOAP correction preserves history and replays the exact unsigned revision" do
    post "/api/clinic/encounters/#{@encounter.id}/notes",
      params: create_params(request_key: "note-correction-create"), headers: csrf_headers, as: :json
    assert_response :created
    note = @encounter.notes.sole
    signed_revision = note.revisions.sole
    Clinic::Care::SignEncounterNote.call(
      note: note,
      actor: @user,
      revision_no: signed_revision.revision_no,
      content_digest: Digest::SHA256.hexdigest(signed_revision.encrypted_body),
      attestation_version: "synthetic-correction-test-v1"
    )

    secret_reason = "Synthetic clinician correction reason #{SecureRandom.hex(6)}"
    params = correction_params(
      request_key: "note-correction-retry",
      revision: signed_revision,
      reason: secret_reason
    )
    post "/api/clinic/notes/#{note.id}/corrections", params: params, headers: csrf_headers, as: :json
    assert_response :created
    first = response.parsed_body
    correction = first.dig("note", "current_revision")

    assert_equal false, first.dig("note", "current_revision_signed")
    assert_equal true, first.dig("note", "has_signed_history")
    assert_equal true, first.dig("note", "signed")
    assert_equal "adult-physical-exam-detailed", first.dig("note", "current_template_id")
    assert_equal false, correction.fetch("signed")
    assert_equal signed_revision.id, correction.dig("body", "correction", "corrected_revision_id")
    assert_equal signed_revision.revision_no, correction.dig("body", "correction", "corrected_revision_no")
    assert_equal secret_reason, correction.dig("body", "correction", "reason")
    assert_equal "manual", correction.dig("body", "correction", "source", "kind")
    assert_equal "Synthetic SOAP draft", first.dig("note", "revisions", 0, "body", "sections", "subjective")
    assert_equal true, first.dig("note", "revisions", 0, "signed")

    post "/api/clinic/notes/#{note.id}/corrections", params: params, headers: csrf_headers, as: :json
    assert_response :created
    assert_equal first, response.parsed_body
    assert_equal 2, note.revisions.reload.count
    receipt = Clinic::OperationReceipt.find_by!(practice: @practice, request_key: "note-correction-retry")
    assert_equal "Clinic::EncounterNoteRevision", receipt.resource_type
    assert_equal correction.fetch("id"), receipt.resource_id

    changed = correction_params(
      request_key: "note-correction-retry",
      revision: signed_revision,
      reason: "A different correction reason"
    )
    post "/api/clinic/notes/#{note.id}/corrections", params: changed, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal 2, note.revisions.reload.count
    assert_equal 1, note.signatures.count
    assert_equal signed_revision.id, note.signatures.sole.revision_id

    raw = ApplicationRecord.connection.select_value(
      "SELECT encrypted_body FROM clinic_encounter_note_revisions WHERE id = #{Integer(correction.fetch('id'))}"
    )
    assert_not_includes raw, secret_reason
    assert_not_includes receipt.attributes.to_json, secret_reason
    assert_not_includes @practice.audit_events.where(action_code: "notes.correct").sole.attributes.to_json, secret_reason

    revision_params = revise_params(request_key: "note-correction-edit", subjective: "Edited corrected SOAP history")
    revision_params[:revision][:expected_revision] = correction.fetch("revision_no")
    post "/api/clinic/notes/#{note.id}/revisions", params: revision_params, headers: csrf_headers, as: :json
    assert_response :created
    edited = response.parsed_body.dig("note", "current_revision", "body")
    assert_equal "soap-note-v2", edited.fetch("schema")
    assert_equal secret_reason, edited.dig("correction", "reason")
    assert_equal signed_revision.id, edited.dig("correction", "corrected_revision_id")
    assert_equal "Edited corrected SOAP history", edited.dig("sections", "subjective")
  end

  test "correction requires the exact current signed revision and preserves its template" do
    post "/api/clinic/encounters/#{@encounter.id}/notes",
      params: create_params(request_key: "note-correction-guards-create"), headers: csrf_headers, as: :json
    note = @encounter.notes.sole
    unsigned = note.revisions.sole
    params = correction_params(request_key: "note-correction-unsigned", revision: unsigned)

    post "/api/clinic/notes/#{note.id}/corrections", params: params, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal 1, note.revisions.reload.count

    Clinic::Care::SignEncounterNote.call(
      note: note,
      actor: @user,
      revision_no: unsigned.revision_no,
      content_digest: Digest::SHA256.hexdigest(unsigned.encrypted_body),
      attestation_version: "synthetic-correction-guards-v1"
    )
    limited_user = User.create!(email_address: "note-correction-limited@example.invalid", password: SecureRandom.hex(18))
    @practice.memberships.create!(user: limited_user)
    correction_body = Clinic::Care::SoapNotePayload.dump_correction(
      template_id: "adult-physical-exam-detailed",
      template_version: 1,
      sections: { subjective: "Unauthorized correction", objective: "", assessment: "", plan: "" },
      corrected_revision_id: unsigned.id,
      corrected_revision_no: unsigned.revision_no,
      reason: "Attempt without chart write authority"
    )
    assert_raises Clinic::Authorization::Denied do
      Clinic::Care::CorrectEncounterNote.call(
        note: note, actor: limited_user, encrypted_body: correction_body,
        corrected_revision_id: unsigned.id, expected_revision: unsigned.revision_no,
        request_key: "note-correction-unauthorized"
      )
    end
    assert_equal 1, note.revisions.reload.count

    stale = correction_params(request_key: "note-correction-stale", revision: unsigned)
    stale[:correction][:expected_revision_id] = unsigned.id + 1_000_000
    post "/api/clinic/notes/#{note.id}/corrections", params: stale, headers: csrf_headers, as: :json
    assert_response :conflict

    switched = correction_params(request_key: "note-correction-template", revision: unsigned)
    switched[:correction][:template_id] = "scribe-reviewed-soap"
    post "/api/clinic/notes/#{note.id}/corrections", params: switched, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal 1, note.revisions.reload.count
  end

  test "stale concurrent revisions allow one append and reject the other" do
    note = Clinic::Care::CreateEncounterNote.call(
      practice: @practice,
      actor: @user,
      encounter: @encounter,
      note_kind: "legacy",
      encrypted_body: "Synthetic initial note",
      request_key: "note-race-create"
    )
    ready = Queue.new
    release = Queue.new
    results = Queue.new

    workers = 2.times.map do |index|
      Thread.new do
        ApplicationRecord.connection_pool.with_connection do
          ready << true
          release.pop
          begin
            Clinic::Care::ReviseEncounterNote.call(
              note: Clinic::EncounterNote.find(note.id),
              actor: @user,
              encrypted_body: "Synthetic concurrent revision #{index}",
              expected_revision: 1,
              request_key: "note-race-revise-#{index}"
            )
            results << :accepted
          rescue ActiveRecord::StaleObjectError
            results << :stale
          end
        end
      end
    end
    2.times { ready.pop }
    2.times { release << true }
    workers.each(&:join)

    assert_equal [ :accepted, :stale ], 2.times.map { results.pop }.sort_by(&:to_s)
    assert_equal 2, note.revisions.reload.count
    assert_equal "open", @encounter.reload.status
    assert_nil @encounter.ended_at
    assert_empty note.signatures
  ensure
    workers&.each { |worker| worker.kill if worker.alive? }
  end

  test "audit failure rolls back the note, encrypted revision and receipt" do
    secret = "Synthetic audit rollback SOAP phrase"
    original_record = Clinic::AuditRecorder.method(:record!)
    Clinic::AuditRecorder.define_singleton_method(:record!) { |**| raise Clinic::AuditRecorder::Unavailable }

    post "/api/clinic/encounters/#{@encounter.id}/notes",
      params: create_params(request_key: "note-audit-failure", subjective: secret), headers: csrf_headers, as: :json

    assert_response :service_unavailable
    assert_not_includes response.body, secret
    assert_empty @encounter.notes.reload
    assert_not Clinic::OperationReceipt.exists?(practice: @practice, request_key: "note-audit-failure")
    assert_not_includes @practice.audit_events.to_a.map(&:attributes).to_json, secret
  ensure
    Clinic::AuditRecorder.define_singleton_method(:record!, original_record) if original_record
  end

  test "revision audit failure rolls back the append and receipt" do
    post "/api/clinic/encounters/#{@encounter.id}/notes",
      params: create_params(request_key: "note-revision-audit-create"), headers: csrf_headers, as: :json
    note_id = response.parsed_body.dig("note", "id")
    original_record = Clinic::AuditRecorder.method(:record!)
    Clinic::AuditRecorder.define_singleton_method(:record!) { |**| raise Clinic::AuditRecorder::Unavailable }

    post "/api/clinic/notes/#{note_id}/revisions",
      params: revise_params(request_key: "note-revision-audit-failure"), headers: csrf_headers, as: :json

    assert_response :service_unavailable
    assert_equal 1, @encounter.notes.sole.revisions.reload.count
    assert_not Clinic::OperationReceipt.exists?(practice: @practice, request_key: "note-revision-audit-failure")
  ensure
    Clinic::AuditRecorder.define_singleton_method(:record!, original_record) if original_record
  end

  test "wrong site, tenant and patient bindings cannot write a note" do
    other_site = @practice.sites.create!(code: "OTHER")
    other_encounter = @practice.encounters.create!(patient: @patient, site: other_site,
      started_at: Time.utc(2026, 9, 2, 15), status: "open")
    post "/api/clinic/encounters/#{other_encounter.id}/notes",
      params: create_params(request_key: "note-wrong-site"), headers: csrf_headers, as: :json
    assert_response :forbidden
    assert_empty other_encounter.notes

    foreign_practice = Clinic::Practice.create!(name: "Synthetic Foreign Note Practice")
    foreign_patient = foreign_practice.patients.create!(display_name: "SYN_Foreign, Note", reference: "SYN-FOREIGN-NOTE")
    foreign_site = foreign_practice.sites.create!(code: "FOREIGN")
    foreign_encounter = foreign_practice.encounters.create!(patient: foreign_patient, site: foreign_site,
      started_at: Time.utc(2026, 9, 2, 16), status: "open")
    post "/api/clinic/encounters/#{foreign_encounter.id}/notes",
      params: create_params(request_key: "note-wrong-tenant"), headers: csrf_headers, as: :json
    assert_response :not_found
    assert_empty foreign_encounter.notes

    forged_note = Clinic::EncounterNote.new(practice: @practice, patient: @other_patient,
      encounter: @encounter, note_kind: "soap")
    assert_raises(ArgumentError) do
      Clinic::Care::ReviseEncounterNote.call(
        note: forged_note,
        actor: @user,
        encrypted_body: "Synthetic forged note",
        expected_revision: 1,
        request_key: "note-wrong-patient"
      )
    end
  end

  test "protected values stay out of raw ciphertext metadata, receipts, audit and errors" do
    secret = "Synthetic protected SOAP phrase"
    log = StringIO.new
    original_logger = Rails.logger
    Rails.logger = ActiveSupport::Logger.new(log)
    post "/api/clinic/encounters/#{@encounter.id}/notes",
      params: create_params(request_key: "note-leakage", subjective: secret), headers: csrf_headers, as: :json
    assert_response :created

    revision = @encounter.notes.sole.revisions.sole
    raw = ApplicationRecord.connection.select_value("SELECT encrypted_body FROM clinic_encounter_note_revisions WHERE id = #{revision.id}")
    assert_not_includes raw, secret
    assert_not_includes Clinic::OperationReceipt.where(request_key: "note-leakage").sole.attributes.to_json, secret
    assert_not_includes @practice.audit_events.where(action_code: "notes.create").sole.attributes.to_json, secret
    assert_not_includes log.string, secret
  ensure
    Rails.logger = original_logger if original_logger
  end

  private

  def create_params(request_key:, subjective: "Synthetic SOAP draft")
    { encounter_note: {
      note_kind: "soap",
      template_id: "adult-physical-exam-detailed",
      template_version: 1,
      subjective: subjective,
      objective: "Synthetic objective",
      assessment: "",
      plan: "",
      request_key: request_key
    } }
  end

  def revise_params(request_key:, subjective: "Synthetic revised SOAP draft")
    { revision: {
      template_id: "adult-physical-exam-detailed",
      template_version: 1,
      subjective: subjective,
      objective: "Synthetic revised objective",
      assessment: "",
      plan: "",
      expected_revision: 1,
      request_key: request_key
    } }
  end

  def correction_params(request_key:, revision:, reason: "Correct a reviewed transcription error")
    { correction: {
      template_id: "adult-physical-exam-detailed",
      template_version: 1,
      subjective: "Corrected synthetic SOAP history",
      objective: "Corrected synthetic objective",
      assessment: "",
      plan: "",
      reason: reason,
      expected_revision_id: revision.id,
      expected_revision: revision.revision_no,
      request_key: request_key
    } }
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def login
    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end
end
