require "test_helper"

class ClinicSiteScopedProviderTest < ActionDispatch::IntegrationTest
  setup do
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Synthetic Site Provider Organization")
    @user = User.create!(email_address: "site-provider@example.invalid", password: @password)
    @practice = Clinic::Practice.create!(name: "Synthetic Site Provider Practice", organization: organization)
    @membership = @practice.memberships.create!(user: @user)
    @allowed_site = @practice.sites.create!(code: "ALLOWED")
    @other_site = @practice.sites.create!(code: "OTHER")
    @patient = @practice.patients.create!(display_name: "SYN_Site, Avery", reference: "SYN-SITE-001")
    @allowed_encounter = @practice.encounters.create!(patient: @patient, site: @allowed_site,
      started_at: Time.utc(2026, 9, 2, 14), status: "open")
    @other_encounter = @practice.encounters.create!(patient: @patient, site: @other_site,
      started_at: Time.utc(2026, 9, 2, 15), status: "open")

    grant_permissions!(@membership, *%w[patients.read notes.read notes.write notes.sign encounters.write observations.write])
    @allowed_note = create_signed_note(@allowed_encounter, "site-provider-allowed")
    @other_note = create_signed_note(@other_encounter, "site-provider-other")
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "patients.read")
    grant_permissions!(@membership, "notes.read", "notes.write", "notes.sign", "encounters.write", "observations.write",
      scope_kind: "site", site: @allowed_site)
    login
  end

  test "site-only provider context exposes encounter capabilities for an allowed site" do
    get "/api/clinic/context", headers: @headers

    assert_response :success
    capabilities = response.parsed_body.fetch("capabilities")
    assert_equal true, capabilities.fetch("encounters")
    assert_equal true, capabilities.fetch("notes_read")
    assert_equal true, capabilities.fetch("notes_write")
  end

  test "site-only provider can write observations and close only an allowed-site encounter" do
    post "/api/clinic/patients/#{@patient.id}/observations", params: {
      observation: {
        request_key: "site-observation-allowed",
        encounter_id: @allowed_encounter.id,
        code: "SYN-TEMP",
        code_system: "synthetic",
        code_version: "1",
        value_kind: "numeric",
        numeric_value: "98.6",
        unit_code: "F",
        observed_at: "2026-09-02T14:10:00Z"
      }
    }, headers: csrf_headers, as: :json
    assert_response :created

    post "/api/clinic/patients/#{@patient.id}/observations", params: {
      observation: {
        request_key: "site-observation-denied",
        encounter_id: @other_encounter.id,
        code: "SYN-TEMP",
        code_system: "synthetic",
        code_version: "1",
        value_kind: "numeric",
        numeric_value: "98.6",
        unit_code: "F",
        observed_at: "2026-09-02T15:10:00Z"
      }
    }, headers: csrf_headers, as: :json
    assert_response :forbidden
    assert_not @other_encounter.observations.exists?(code: "SYN-TEMP")

    post "/api/clinic/encounters/#{@allowed_encounter.id}/close", params: {
      close: { patient_id: @patient.id, ended_at: "2026-09-02T14:30:00Z", request_key: "site-close-allowed" }
    }, headers: csrf_headers, as: :json
    assert_response :success

    post "/api/clinic/encounters/#{@other_encounter.id}/close", params: {
      close: { patient_id: @patient.id, ended_at: "2026-09-02T15:30:00Z", request_key: "site-close-denied" }
    }, headers: csrf_headers, as: :json
    assert_response :forbidden
    assert_equal "open", @other_encounter.reload.status
  end

  test "site-only provider chart history is restricted to the authorized site" do
    get "/api/clinic/patients/#{@patient.id}/previous_signed_soap", headers: @headers

    assert_response :success
    assert_equal @allowed_note.id, response.parsed_body.dig("chart", "note_id")
    assert_not_equal @other_note.id, response.parsed_body.dig("chart", "note_id")

    get "/api/clinic/patients/#{@patient.id}/previous_signed_soap",
      params: { exclude_encounter_id: @other_encounter.id }, headers: @headers
    assert_response :success
    assert_nil response.parsed_body.fetch("excluded_encounter_id")
    assert_equal @allowed_note.id, response.parsed_body.dig("chart", "note_id")

    get "/api/clinic/patients/#{@patient.id}/previous_signed_soap",
      params: { exclude_encounter_id: @allowed_encounter.id }, headers: @headers
    assert_response :success
    assert_equal @allowed_encounter.id, response.parsed_body.fetch("excluded_encounter_id")
    assert_nil response.parsed_body.fetch("chart")

    get "/api/clinic/notes/#{@other_note.id}", headers: @headers
    assert_response :forbidden

    get "/api/clinic/note_templates", headers: @headers
    assert_response :success
  end

  private

  def create_signed_note(encounter, key)
    note = Clinic::Care::CreateEncounterNote.call(
      practice: @practice,
      actor: @user,
      encounter: encounter,
      note_kind: "soap",
      payload_version: Clinic::Care::SoapNotePayload::VERSION,
      request_key: key,
      encrypted_body: Clinic::Care::SoapNotePayload.dump(
        template_id: "adult-physical-exam-detailed",
        template_version: 1,
        sections: { subjective: "Synthetic site history", objective: "Synthetic finding", assessment: "Synthetic assessment", plan: "Synthetic plan" }
      )
    )
    revision = note.revisions.first
    Clinic::Care::SignEncounterNote.call(
      note: note,
      actor: @user,
      revision_no: revision.revision_no,
      content_digest: Digest::SHA256.hexdigest(revision.encrypted_body),
      attestation_version: "synthetic-site-test-v1",
      signed_at: Time.utc(2026, 9, 2, 16)
    )
    note
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
