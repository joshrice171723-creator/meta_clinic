require "test_helper"

class PrescriptionReconciliationWorklistTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @password = SecureRandom.hex(18)
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @practice = Clinic::Practice.create!(name: "Synthetic prescription worklist clinic", timezone: "UTC")
    @site = @practice.sites.create!(code: "RX-A", status: "active")
    @other_site = @practice.sites.create!(code: "RX-B", status: "active")
    @patient = @practice.patients.create!(display_name: "Synthetic prescription patient", reference: "RX-WORK")
    @encounter = @practice.encounters.create!(patient: @patient, site: @site, status: "open", started_at: Time.current)
    @reader = User.create!(email_address: "rx-work-reader@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @reader)
    grant_permissions!(@membership, "patients.read", "clinical_records.read")
    @destination = Clinic::Care::PharmacyDestination.create!(practice: @practice, name: "Synthetic pharmacy",
      address_line1: "1 Synthetic Way", city: "Austin", state_code: "TX", postal_code: "78701")
    login(@reader)
  end

  test "unresolved outcome coverage uses recorded series state and preserves version-bound history without writes" do
    expected = %w[unknown acknowledged accepted outcome_unknown rejected unavailable revoked duplicate].map { |kind| attempt(kind) }
    attempt("failure_before_send")
    before = ledger
    2.times do
      get worklist_path
      assert_response :success
      assert_equal "no-store", response.headers["Cache-Control"]
      data = response.parsed_body
      assert_equal @practice.id, data.fetch("practice_id")
      assert_equal @reader.id, data.fetch("actor_id")
      assert_nil data.fetch("site_id")
      assert_equal 8, data.fetch("unresolved_count")
      assert_equal expected.map(&:id), data.fetch("items").map { |item| item.fetch("id") }
      data.fetch("items").each do |item|
        source = expected.find { |record| record.id == item.fetch("id") }
        assert Clinic::Care::PrescriptionWorkflow.unresolved?(source.medication_request_revision)
        assert_equal "simulation", item.fetch("source")
        assert_equal "Prescriber/support queue", item.fetch("owner")
        assert_equal "/clinic/patients/#{@patient.id}/encounters/#{@encounter.id}?focus=clinical-plan-workspace&medication_request_revision_id=#{source.medication_request_revision_id}&prescription_attempt_id=#{source.id}", item.fetch("href")
      end
    end
    assert_equal before, ledger
    assert_not Ability.new(@reader, practice: @practice).allowed_permission?("medication_requests.write", site: @site)
    get "/api/clinic/patients/#{@patient.id}/medication_requests/#{expected.first.medication_request_revision_id}/events"
    assert_response :success
    assert_includes response.parsed_body.fetch("attempts").map { |item| item.fetch("id") }, expected.first.id
  end

  test "superseded revisions and completed encounters remain visible until series reconciliation even after review" do
    source = attempt("unknown")
    original = source.medication_request_revision
    newer = revision(prior: original)
    event(newer, "review", source: "manual")
    @encounter.update!(status: "completed", ended_at: Time.current)
    get worklist_path
    assert_response :success
    item = response.parsed_body.fetch("items").sole
    assert_equal [ source.id, original.id, 1 ], item.values_at("id", "medication_request_revision_id", "version_number")
    event(newer, "confirmed_not_sent", prior_event: source.prescription_event)
    before = ledger
    get worklist_path
    assert_response :success
    assert_equal 0, response.parsed_body.fetch("unresolved_count")
    assert_empty response.parsed_body.fetch("items")
    assert_not Clinic::Care::PrescriptionWorkflow.unresolved?(newer)
    assert_equal before, ledger
  end

  test "latest non-review event wins across the series rather than timestamps or individual revisions" do
    source = attempt("unknown")
    newer = revision(prior: source.medication_request_revision)
    event(newer, "confirmed_not_sent", prior_event: source.prescription_event)
    replacement = attempt("rejected", order: newer, submitted_at: 1.day.ago)
    event(newer, "review", source: "manual")
    get worklist_path
    assert_response :success
    assert_equal [ replacement.id ], response.parsed_body.fetch("items").map { |item| item.fetch("id") }
    assert_equal 1, response.parsed_body.fetch("unresolved_count")
    event(newer, "cancelled", prior_event: replacement.prescription_event)
    get worklist_path
    assert_response :success
    assert_empty response.parsed_body.fetch("items")
  end

  test "site permissions precede counts and cap while explicit unauthorized and foreign site requests are denied" do
    own = attempt("unknown")
    hidden_encounter = @practice.encounters.create!(patient: @patient, site: @other_site, status: "open", started_at: Time.current)
    51.times { attempt("unknown", encounter: hidden_encounter) }
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "patients.read")
    grant_permissions!(@membership, "clinical_records.read", scope_kind: "site", site: @site)
    get worklist_path
    assert_response :success
    assert_equal 1, response.parsed_body.fetch("unresolved_count")
    assert_equal false, response.parsed_body.fetch("truncated")
    assert_equal [ own.id ], response.parsed_body.fetch("items").map { |item| item.fetch("id") }
    get worklist_path, params: { page: 2 }
    assert_response :success
    assert_equal 1, response.parsed_body.dig("pagination", "total")
    assert_equal 1, response.parsed_body.dig("pagination", "page")
    assert_equal [ own.id ], response.parsed_body.fetch("items").map { |item| item.fetch("id") }
    get worklist_path, params: { site_id: @site.id }
    assert_response :success
    assert_equal @site.id, response.parsed_body.fetch("site_id")
    get worklist_path, params: { site_id: @other_site.id }
    assert_response :forbidden
    refute response.parsed_body.key?("items")
    foreign = Clinic::Practice.create!(name: "Foreign prescription clinic", timezone: "UTC").sites.create!(code: "FOREIGN")
    get worklist_path, params: { site_id: foreign.id }
    assert_response :not_found
    refute response.parsed_body.key?("items")
    get "/api/clinic/patients/#{@patient.id}"
    assert_response :success
  end

  test "bounded authorized work reports the full count and oldest recorded IDs without completing overflow" do
    records = 51.times.map { attempt("unknown") }
    before = ledger
    get worklist_path
    assert_response :success
    data = response.parsed_body
    assert_equal 50, data.fetch("limit")
    assert_equal 51, data.fetch("unresolved_count")
    assert_equal 50, data.fetch("returned_count")
    assert_equal true, data.fetch("truncated")
    assert_equal records.first(50).map(&:id), data.fetch("items").map { |item| item.fetch("id") }
    assert_equal({ "page" => 1, "per_page" => 50, "total" => 51, "total_pages" => 2 }, data.fetch("pagination"))
    get worklist_path, params: { page: 2 }
    assert_response :success
    second = response.parsed_body
    assert_equal 51, second.fetch("unresolved_count")
    assert_equal 1, second.fetch("returned_count")
    assert_equal 2, second.dig("pagination", "page")
    assert_equal [ records.last.id ], second.fetch("items").map { |item| item.fetch("id") }
    assert_includes second.fetch("items").sole.fetch("href"), "prescription_attempt_id=#{records.last.id}"
    get worklist_path, params: { page: 999_999 }
    assert_response :success
    assert_equal 2, response.parsed_body.dig("pagination", "page")
    assert_equal [ records.last.id ], response.parsed_body.fetch("items").map { |item| item.fetch("id") }
    assert_equal before, ledger
  end

  test "missing patient permission revoked clinical access and foreign practice history do not leak data" do
    own = attempt("unknown")
    foreign = Clinic::Practice.create!(name: "Foreign prescription clinic", timezone: "UTC")
    foreign_patient = foreign.patients.create!(display_name: "Foreign synthetic patient", reference: "FOREIGN-RX")
    foreign_site = foreign.sites.create!(code: "FOREIGN-RX")
    foreign_encounter = foreign.encounters.create!(patient: foreign_patient, site: foreign_site, status: "open", started_at: Time.current)
    foreign_member = foreign.memberships.create!(user: User.create!(email_address: "rx-foreign@example.invalid", password: @password))
    foreign_destination = Clinic::Care::PharmacyDestination.create!(practice: foreign, name: "Foreign synthetic pharmacy", address_line1: "2 Synthetic Way", city: "Austin", state_code: "TX", postal_code: "78701")
    attempt("unknown", encounter: foreign_encounter, membership: foreign_member, destination: foreign_destination)
    get worklist_path
    assert_response :success
    assert_equal [ own.id ], response.parsed_body.fetch("items").map { |item| item.fetch("id") }
    before = ledger
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "clinical_records.read")
    get worklist_path
    assert_response :forbidden
    refute response.parsed_body.key?("items")
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "patients.read")
    get worklist_path
    assert_response :forbidden
    refute response.parsed_body.key?("items")
    assert_equal before, ledger
  end

  test "page input rejects invalid values without changing prescription ledgers" do
    attempt("unknown")
    before = ledger
    [ "0", "-1", "1000000", "1.5", "other" ].each do |page|
      get worklist_path, params: { page: }
      assert_response :bad_request
      refute response.parsed_body.key?("items")
      assert_equal "page", response.parsed_body.fetch("field")
      assert_match(/\Apage must be/, response.parsed_body.fetch("error"))
    end
    assert_equal before, ledger
  end

  test "resolved overflow shrinks pages without losing original remaining history" do
    records = 51.times.map { attempt("unknown") }
    get worklist_path, params: { page: 2 }
    assert_response :success
    assert_equal [ records.last.id ], response.parsed_body.fetch("items").map { |item| item.fetch("id") }
    resolved = records.first
    event(resolved.medication_request_revision, "confirmed_not_sent", prior_event: resolved.prescription_event)
    before = ledger
    get worklist_path, params: { page: 2 }
    assert_response :success
    assert_equal 50, response.parsed_body.fetch("unresolved_count")
    assert_equal 1, response.parsed_body.dig("pagination", "page")
    assert_equal records.drop(1).map(&:id), response.parsed_body.fetch("items").map { |item| item.fetch("id") }
    assert_equal before, ledger
  end

  test "activity report attributes every projection to saved request sites without changing totals" do
    @site.update!(name: "Weight Management")
    own = attempt("unknown")
    other_encounter = @practice.encounters.create!(patient: @patient, site: @other_site, status: "open", started_at: Time.current)
    other = attempt("unknown", encounter: other_encounter)
    before = ledger

    get "/api/clinic/reports/prescription_simulator_activity"
    assert_response :success
    report = response.parsed_body.fetch("report")
    assert_equal 2, report.fetch("total")
    assert_equal({ "unknown" => 2 }, report.fetch("outcome_counts"))
    %w[current_revision_records current_revision_unknown_records current_revision_unresolved_records].each do |projection|
      rows = report.fetch(projection).index_by { |row| row.fetch("id") }
      assert_equal [ own.id, other.id ].sort, rows.keys.sort
      assert_equal [ @site.id, "Weight Management" ], rows.fetch(own.id).values_at("source_site_id", "source_site_name")
      assert_equal [ @other_site.id, "RX-B" ], rows.fetch(other.id).values_at("source_site_id", "source_site_name")
    end
    assert_equal before, ledger
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "clinical_records.read", scope_kind: "site", site: @site)
    get "/api/clinic/reports/prescription_simulator_activity"
    assert_response :forbidden
  end

  private

  def worklist_path
    "/api/clinic/prescription_reconciliation_worklist"
  end

  def revision(prior: nil, encounter: @encounter, membership: @membership)
    Clinic::Care::MedicationRequestRevision.create!(practice: encounter.practice, patient: encounter.patient, encounter:, site: encounter.site,
      recorded_by_membership: membership, prior_revision: prior, series_id: prior&.series_id || SecureRandom.uuid,
      version_number: prior ? prior.version_number + 1 : 1, recorded_at: Time.current,
      request_key: "rx-work-#{SecureRandom.hex(12)}", content_digest: Digest::SHA256.hexdigest("synthetic prescription"),
      medication_name: "Synthetic worklist medication", status: "authorized", intent: "order", transmission_state: "not_requested")
  end

  def event(order, kind, source: "simulation", prior_event: nil, request_key: "rx-event-#{SecureRandom.hex(12)}", membership: @membership)
    Clinic::Care::PrescriptionEvent.create!(practice: order.practice, patient_id: order.patient_id, medication_request_revision: order,
      recorded_by_membership: membership, prior_event:, kind:, source:, request_key:, recorded_at: Time.current, note: "Synthetic history evidence")
  end

  def attempt(outcome, order: nil, encounter: @encounter, membership: @membership, destination: @destination, submitted_at: Time.current)
    order ||= revision(encounter:, membership:)
    key = "rx-attempt-#{SecureRandom.hex(12)}"
    # Read-only worklist fixtures construct fresh synthetic ledger evidence, not a runtime submission path.
    review = event(order, "review", source: "manual", membership:)
    digest = Clinic::Care::PrescriptionPreparationWorkflow.digest(order:, review:, destination_snapshot: destination.snapshot,
      mode: "standard", signer_snapshot: {}, reviewer_snapshot: {})
    preparation = Clinic::Care::PrescriptionPreparation.create!(practice: order.practice, patient: order.patient,
      medication_request_revision: order, pharmacy_destination: destination, review_event: review,
      prepared_by_membership: membership, request_key: "prepare:#{key}", prepared_at: submitted_at,
      schema_version: Clinic::Care::PrescriptionTransmissionAttempt::SCHEMA_VERSION, payload_digest: digest,
      mode: "standard", signer_snapshot: {}, reviewer_snapshot: {}, destination_snapshot: destination.snapshot)
    recorded = event(order, outcome, request_key: "prescription-event:#{key}", membership:)
    Clinic::Care::PrescriptionTransmissionAttempt.create!(practice: encounter.practice, patient: encounter.patient, medication_request_revision: order,
      pharmacy_destination: destination, prescription_event: recorded, initiated_by_membership: membership, preparation:,
      adapter: Clinic::Care::PrescriptionTransmissionAttempt::ADAPTER, mode: "standard", outcome:, request_key: key,
      source: "simulation", transaction_type: "NewRx", schema_version: preparation.schema_version,
      payload_digest: digest, correlation_id: SecureRandom.uuid, review_event: review,
      submitted_at:, destination_snapshot: destination.snapshot)
  end

  def ledger
    [ Clinic::Care::MedicationRequestRevision, Clinic::Care::PrescriptionEvent, Clinic::Care::PrescriptionPreparation, Clinic::Care::PrescriptionTransmissionAttempt,
      Clinic::ClinicalTask, Clinic::Care::MedicationDispense ].map { |model| model.order(:id).map(&:attributes) }
  end

  def login(user)
    get "/api/csrf", headers: @headers
    assert_response :success
    post "/api/session", params: { email_address: user.email_address, password: @password },
      headers: @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token")), as: :json
    assert_response :success
  end
end
