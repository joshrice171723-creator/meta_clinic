require "test_helper"
require_relative "../support/scribe_template_helpers"

class ScribeActivityPaginationTest < ActionDispatch::IntegrationTest
  include ScribeTemplateHelpers

  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    password = SecureRandom.hex(18)
    @actor = User.create!(email_address: "scribe-pages-#{SecureRandom.hex(5)}@example.invalid", password: password)
    @practice = Clinic::Practice.create!(name: "Synthetic scribe recovery clinic")
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "scribe.read", "scribe.write")
    @patient = @practice.patients.create!(display_name: "SYN_Recovery, Avery", reference: "SYN-RECOVERY-001")
    create_scribe_template_catalog!
    @encounter = Clinic::Scribe::Workflow.create_encounter(practice: @practice, actor: @actor, patient: @patient)
    get "/api/csrf", headers: @headers
    post "/api/session", params: { email_address: @actor.email_address, password: password },
      headers: @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token")), as: :json
    assert_response :success
  end

  test "older unfinished sources remain reachable with mixed recording pagination and stable ties" do
    timestamp = 1.minute.ago.change(usec: 123456)
    sources = 26.times.map { create_source(updated_at: timestamp) }
    recording = Clinic::Scribe::Recording.create!(practice: @practice, encounter: @encounter, created_by: @actor,
      status: "interrupted", mime_type: "audio/webm", idempotency_key: SecureRandom.uuid,
      request_digest: Digest::SHA256.hexdigest("Synthetic recording request"),
      consent_policy_version: Clinic::Scribe::Workflow::CONSENT_POLICY_VERSION, consented_at: timestamp,
      expected_encounter_version: @encounter.lock_version, updated_at: timestamp + 1.second)

    get "/api/clinic/reports/scribe_activity", headers: @headers
    assert_response :success
    report = response.parsed_body.fetch("report")
    first = report.fetch("recovery_items")
    assert_equal 25, first.length
    assert_equal({ "page" => 1, "per_page" => 25, "total" => 27, "total_pages" => 2 }, report.fetch("recovery_pagination"))
    assert_equal [ "recording", recording.id ], first.first.values_at("record_type", "id")
    assert_equal sources.last(24).reverse.map(&:id), first.drop(1).pluck("id")
    assert_equal timestamp.iso8601(6), first.last.fetch("updated_at")
    assert_equal 26, report.dig("source_counts", "incomplete")
    assert_equal 1, report.dig("recording_counts", "interrupted")
    assert_equal false, report.fetch("provider_verified")

    get "/api/clinic/reports/scribe_activity", params: { page: 2 }, headers: @headers
    assert_response :success
    second = response.parsed_body.fetch("report")
    assert_equal sources.first(2).reverse.map(&:id), second.fetch("recovery_items").pluck("id")
    assert_equal 2, second.dig("recovery_pagination", "page")
    assert_equal report.fetch("source_counts"), second.fetch("source_counts")
    assert_empty first.pluck("id").drop(1) & second.fetch("recovery_items").pluck("id")
    second.fetch("recovery_items").each do |item|
      assert_equal %w[encounter_id id record_type status updated_at], item.keys.sort
    end
    get "/api/clinic/reports/scribe_activity", headers: @headers
    assert_equal first, response.parsed_body.dig("report", "recovery_items")
  end

  test "recovery paging excludes deleted and foreign practice records and still denies revoked readers" do
    current = create_source
    create_source(status: "ready")
    deleted = Clinic::Scribe::Workflow.create_encounter(practice: @practice, actor: @actor, patient: @patient)
    create_source(encounter: deleted)
    deleted.update!(status: "deleted", deleted_at: Time.current)
    foreign = Clinic::Practice.create!(name: "Synthetic foreign scribe clinic")
    foreign_patient = foreign.patients.create!(display_name: "SYN_Foreign, Morgan", reference: "SYN-FOREIGN-001")
    foreign_encounter = foreign.scribe_encounters.create!(patient: foreign_patient, created_by: @actor,
      template_id: "soap", template_version: 1)
    create_source(encounter: foreign_encounter)

    get "/api/clinic/reports/scribe_activity", params: { page: 999, per_page: 1 }, headers: @headers
    assert_response :success
    assert_equal [ current.id ], response.parsed_body.dig("report", "recovery_items").pluck("id")
    assert_equal({ "page" => 1, "per_page" => 1, "total" => 1, "total_pages" => 1 },
      response.parsed_body.dig("report", "recovery_pagination"))
    set_permission!(@membership, "scribe.read", false)
    get "/api/clinic/reports/scribe_activity", params: { page: 2 }, headers: @headers
    assert_response :forbidden
    assert_not response.parsed_body.key?("report")
  end

  test "empty recovery and bounded page parameters remain explicit" do
    get "/api/clinic/reports/scribe_activity", headers: @headers
    assert_response :success
    assert_empty response.parsed_body.dig("report", "recovery_items")
    assert_equal({ "page" => 1, "per_page" => 25, "total" => 0, "total_pages" => 0 },
      response.parsed_body.dig("report", "recovery_pagination"))
    [ { page: 0 }, { page: "invalid" }, { per_page: 51 }, { per_page: 0 } ].each do |invalid|
      get "/api/clinic/reports/scribe_activity", params: invalid, headers: @headers
      assert_response :bad_request
      assert_not response.parsed_body.key?("report")
    end
  end

  private

  def create_source(encounter: @encounter, status: "incomplete", updated_at: Time.current)
    content = "Independently synthetic source content"
    encounter.sources.create!(practice: encounter.practice, imported_by: @actor,
      source_type: "transcript", status:, content:, content_digest: Digest::SHA256.hexdigest(content), updated_at:)
  end
end
