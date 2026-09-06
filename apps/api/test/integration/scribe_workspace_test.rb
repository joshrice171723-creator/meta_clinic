require "test_helper"

class ScribeWorkspaceTest < ActionDispatch::IntegrationTest
  PASSWORD = "Scribe-workspace-2026!".freeze

  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @user = User.create!(email_address: "scribe-#{SecureRandom.hex(5)}@example.invalid", password: PASSWORD)
    @practice = Clinic::Practice.create!(name: "Scribe Workspace Clinic", timezone: "UTC")
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "scribe.read", "scribe.write", "scribe.approve", "scribe.export", "scribe.delete")
    @site = @practice.sites.create!(code: "SCRIBE", name: "Scribe clinic", status: "active")
    @patient = @practice.patients.create!(display_name: "Rivera, Avery", reference: "PAT-SCRIBE-001")
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

  private

  def create_context_encounter
    post "/api/clinic/scribe/encounters", params: { encounter: { patient_id: @patient.id, site_id: @site.id,
      context: { content: "Reviewer supplied context", source_type: "reviewer_authored" } } }, headers: csrf_headers, as: :json
    assert_response :created
    response.parsed_body.fetch("encounter")
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
