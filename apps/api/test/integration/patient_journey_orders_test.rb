require "test_helper"

class PatientJourneyOrdersTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @actor = User.create!(email_address: "journey-orders@example.invalid", password: @password)
    @membership = Development::TestClinic.create!(@actor)
    @practice = @membership.practice
    @site = @practice.sites.create!(code: "JOURNEY-ORDERS", status: "active")
    @other_site = @practice.sites.create!(code: "OTHER-JOURNEY", status: "active")
    grant_permissions!(@membership, "clinical_records.read", "medication_requests.write", "service_requests.write")
    @patient = @practice.patients.create!(display_name: "Synthetic Order Journey", reference: "JOURNEY-ORDERS-1")
    @encounter = @practice.encounters.create!(patient: @patient, site: @site,
      status: "open", started_at: Current.business_time - 2.hours)
    @product = @practice.pharmacy_products.create!(name: "Synthetic instruction example 10 mg/mL",
      generic_name: "Synthetic instruction example", dosage_form: "solution", ndc: "00000-0001-01",
      sku: "JOURNEY-RX", stock_unit: "mL", quantity_scale: 2, package_size: 1, unit_reference: "1 mL vial")
    @location = @practice.inventory_locations.create!(site: @site, name: "Journey medication storage", kind: "storage")
    @batch = receive_batch("JOURNEY-LOT", @location, "4.00")
    login(@actor)
  end

  test "T06 T09 incomplete and stale reviews cannot release while independent lab preparation persists" do
    order = prescription(route: "outside_pharmacy", attributes: { medication_strength: nil })
    post_event(order, "review")
    assert_response :unprocessable_entity
    assert_empty Clinic::Care::PrescriptionWorkflow.events(order)

    order = revise(order, medication_strength: "10 mg/mL")
    post_event(order, "review", source: "simulation")
    assert_response :unprocessable_entity
    post_event(order, "review")
    assert_response :created
    prior = order
    order = revise(order, instructions: "Updated synthetic directions requiring a new review")

    post_event(prior, "unknown", source: "simulation")
    assert_response :conflict
    post_event(order, "acknowledged", source: "simulation")
    assert_response :unprocessable_entity
    assert_nil Clinic::Care::PrescriptionWorkflow.events(order).find_by(kind: "acknowledged")
    lab = prepare_lab
    assert_equal "draft", lab.status
    assert_equal @patient.id, lab.patient_id
    assert_empty @practice.lab_reports
    assert_nil @encounter.reload.ended_at
  end

  test "T09 uncertain outcome blocks replacement and ignores duplicate and obsolete reconciliation" do
    order = prescription(route: "outside_pharmacy")
    post_event(order, "review")
    assert_response :created
    key = SecureRandom.uuid
    post_event(order, "unknown", source: "simulation", key:)
    assert_response :created
    unknown = response.parsed_body.fetch("event")
    assert_equal "simulation", unknown.fetch("source")
    assert_no_difference "Clinic::Care::PrescriptionEvent.count" do
      post_event(order, "unknown", source: "simulation", key:)
      assert_response :created
      assert_equal unknown.fetch("id"), response.parsed_body.dig("event", "id")
    end
    assert_no_difference "Clinic::Care::PrescriptionEvent.count" do
      post_event(order, "acknowledged", source: "simulation")
      assert_response :unprocessable_entity
    end
    assert_no_difference "Clinic::Care::MedicationRequestRevision.count" do
      patch order_path(order), params: { medication_request: { expected_version: order.version_number,
        pharmacy_location: "Different synthetic pharmacy location", request_key: SecureRandom.uuid } }, headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
    end
    assert_equal @patient.id, prepare_lab.patient_id

    post_event(order, "confirmed_not_sent", source: "simulation", prior: unknown.fetch("id"), note: "Simulator lookup confirmed no acceptance")
    assert_response :created
    order = revise(order, pharmacy_location: "Different synthetic pharmacy location")
    post_event(order, "review")
    assert_response :created
    post_event(order, "acknowledged", source: "simulation")
    assert_response :created
    acknowledged = response.parsed_body.dig("event", "id")
    post_event(order, "confirmed_not_sent", source: "simulation", prior: unknown.fetch("id"), note: "Obsolete reconciliation")
    assert_response :unprocessable_entity
    post_event(order, "confirmed_not_sent", source: "simulation", prior: acknowledged, note: "Contradicts known acknowledgment")
    assert_response :unprocessable_entity
    post_event(order, "cancelled", source: "simulation", prior: acknowledged, note: "Simulator cancellation confirmed")
    assert_response :created
    assert_empty Clinic::Care::MedicationDispensing.records(order)
    assert_equal "not_requested", order.reload.transmission_state
  end

  test "T09 manual records cannot forge acceptance and failure before send permits another reviewed attempt" do
    order = prescription(route: "outside_pharmacy")
    post_event(order, "review")
    assert_response :created
    post_event(order, "acknowledged", source: "manual")
    assert_response :unprocessable_entity
    post_event(order, "unknown", source: "vendor")
    assert_response :unprocessable_entity
    patch order_path(order), params: { medication_request: { expected_version: order.version_number,
      transmission_state: "accepted", request_key: SecureRandom.uuid } }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    %w[failure_before_send rejected].each do |kind|
      post_event(order, kind, source: "simulation")
      assert_response :created
    end
    get events_path(order), headers: @headers
    assert_response :success
    assert_equal true, response.parsed_body.fetch("transmission_available")
    assert_equal %w[review failure_before_send rejected], response.parsed_body.fetch("events").pluck("kind")
    assert_empty response.parsed_body.fetch("dispenses")
  end

  test "T09 simulated pharmacy submission snapshots the destination and blocks a second unknown outcome" do
    order = prescription(route: "outside_pharmacy")
    post_event(order, "review")
    assert_response :created
    post "/api/clinic/pharmacy_destinations", params: { pharmacy_destination: {
      request_key: "journey-pharmacy-destination", name: "Synthetic destination pharmacy",
      address_line1: "100 Synthetic Way", city: "Austin", state_code: "TX", postal_code: "78701"
    } }, headers: csrf_headers, as: :json
    assert_response :created
    destination = response.parsed_body.fetch("pharmacy_destination")
    key = SecureRandom.uuid
    assert_difference [ "Clinic::Care::PrescriptionTransmissionAttempt.count", "Clinic::Care::PrescriptionEvent.count" ], 1 do
      submit_prescription(order, destination.fetch("id"), scenario: "unknown", key:)
      assert_response :created
    end
    attempt = response.parsed_body.fetch("attempt")
    assert_equal [ "simulated_pharmacy_network", "unknown", "Synthetic destination pharmacy" ],
      [ attempt.fetch("adapter"), attempt.fetch("outcome"), attempt.dig("destination_snapshot", "name") ]
    assert_no_difference [ "Clinic::Care::PrescriptionTransmissionAttempt.count", "Clinic::Care::PrescriptionEvent.count" ] do
      submit_prescription(order, destination.fetch("id"), scenario: "unknown", key:)
      assert_response :created
      assert_equal attempt.fetch("id"), response.parsed_body.dig("attempt", "id")
    end
    submit_prescription(order, destination.fetch("id"), scenario: "rejected")
    assert_response :unprocessable_entity
    get events_path(order), headers: @headers
    assert_response :success
    assert_equal 1, response.parsed_body.fetch("attempts").length
    assert_equal "Synthetic destination pharmacy", response.parsed_body.dig("attempts", 0, "destination_snapshot", "name")
  end

  test "T06 partial handover retries and reversal post exact stock once without creating administration" do
    order = prescription(route: "take_home")
    post_event(order, "review")
    assert_response :created
    key = SecureRandom.uuid
    assert_no_difference "Clinic::Care::MedicationAdministration.count" do
      assert_difference [ "Clinic::Care::MedicationDispense.count", "Clinic::Inventory::PharmacyMovement.count" ], 1 do
        post_dispense(order, quantity: "1.25", key:, reason: "Partial handover; remainder still owed")
        assert_response :created
      end
    end
    dispense_id = response.parsed_body.dig("dispense", "id")
    assert_equal BigDecimal("2.75"), @batch.reload.quantity
    assert_equal BigDecimal("1.75"), Clinic::Care::MedicationDispensing.remaining(order)
    assert_no_difference [ "Clinic::Care::MedicationDispense.count", "Clinic::Inventory::PharmacyMovement.count" ] do
      post_dispense(order, quantity: "1.25", key:, reason: "Partial handover; remainder still owed")
      assert_response :created
      assert_equal dispense_id, response.parsed_body.dig("dispense", "id")
    end
    post_dispense(order, quantity: "1.50", key:, reason: "Partial handover; remainder still owed")
    assert_response :conflict
    patch order_path(order), params: { medication_request: { status: "completed", completion_exception: "Cannot waive a remainder",
      expected_version: order.version_number, request_key: SecureRandom.uuid } }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal @patient.id, prepare_lab.patient_id
    @encounter.close!
    reversal_key = SecureRandom.uuid
    post_dispense(order, status: "reversed", original: dispense_id, key: reversal_key, reason: "Corrected an erroneous handover record; stock never left clinic")
    assert_response :created
    assert_equal dispense_id, response.parsed_body.dig("dispense", "original_dispense_id")
    assert_equal BigDecimal("4.00"), @batch.reload.quantity
    assert_equal BigDecimal("3.00"), Clinic::Care::MedicationDispensing.remaining(order)
    assert_no_difference [ "Clinic::Care::MedicationDispense.count", "Clinic::Inventory::PharmacyMovement.count" ] do
      post_dispense(order, status: "reversed", original: dispense_id, key: reversal_key, reason: "Corrected an erroneous handover record; stock never left clinic")
      assert_response :created
    end
    post_dispense(order, status: "reversed", original: dispense_id, reason: "Second reversal must not post stock")
    assert_response :unprocessable_entity
    assert_equal BigDecimal("4.00"), @batch.reload.quantity
    assert Clinic::ClinicalTask.where(patient: @patient, source_kind: "medication_request", state: "open").exists?
  end

  test "T06 completion compares the proposed prescribed quantity with actual handovers" do
    order = prescription(route: "take_home")
    post_event(order, "review")
    assert_response :created
    post_dispense(order, quantity: "3.00")
    assert_response :created
    assert_equal BigDecimal("0"), Clinic::Care::MedicationDispensing.remaining(order)
    assert_no_difference "Clinic::Care::MedicationRequestRevision.count" do
      patch order_path(order), params: { medication_request: { status: "completed", prescribed_quantity: "4.00",
        expected_version: order.version_number, request_key: "journey-completion-cannot-increase-quantity" } }, headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
    end
    patch order_path(order), params: { medication_request: { status: "completed",
      expected_version: order.version_number, request_key: "journey-exact-quantity-completion" } }, headers: csrf_headers, as: :json
    assert_response :created
    assert_equal "completed", response.parsed_body.dig("medication_request", "status")
    assert_equal BigDecimal("1.00"), @batch.reload.quantity
    assert_empty Clinic::Care::MedicationAdministration.where(patient: @patient)
  end

  test "T06 unsuitable lot and wrong unit never consume stock while a not-done outcome retains work" do
    order = prescription(route: "take_home")
    post_event(order, "review")
    assert_response :created
    other_location = @practice.inventory_locations.create!(site: @other_site, name: "Other storage", kind: "storage")
    other_batch = receive_batch("JOURNEY-OTHER", other_location, "4.00")
    held = receive_batch("JOURNEY-HELD", @location, "4.00")
    held.change_status!(status: "quarantined", reason: "Synthetic stock review", actor: @actor, request_key: SecureRandom.uuid)
    expired = receive_batch("JOURNEY-EXPIRED", @location, "4.00", expires_on: Date.current - 1)
    [other_batch, held, expired].each do |batch|
      assert_no_difference [ "Clinic::Care::MedicationDispense.count", "Clinic::Inventory::PharmacyMovement.count" ] do
        post_dispense(order, batch:, quantity: "1.00", reason: "Partial requested")
        assert_response :unprocessable_entity
      end
      assert_equal BigDecimal("4.00"), batch.reload.quantity
    end
    insufficient = receive_batch("JOURNEY-INSUFFICIENT", @location, "0.50")
    assert_no_difference [ "Clinic::Care::MedicationDispense.count", "Clinic::Inventory::PharmacyMovement.count" ] do
      post_dispense(order, batch: insufficient, quantity: "1.00", reason: "Requested amount exceeds this lot")
      assert_response :unprocessable_entity
    end
    assert_equal BigDecimal("0.50"), insufficient.reload.quantity
    post_dispense(order, quantity: "4.01", reason: "Cannot exceed stock or prescribed amount")
    assert_response :unprocessable_entity
    wrong_unit = prescription(route: "take_home", attributes: { quantity_unit: "tablet" })
    post_event(wrong_unit, "review")
    assert_response :created
    post_dispense(wrong_unit, quantity: "1.00", reason: "Unsupported unit conversion")
    assert_response :unprocessable_entity
    assert_no_difference "Clinic::Inventory::PharmacyMovement.count" do
      post_dispense(order, status: "not_done", reason: "No suitable stock selected")
      assert_response :created
    end
    assert_equal BigDecimal("3.00"), Clinic::Care::MedicationDispensing.remaining(order)
    assert_equal BigDecimal("4.00"), @batch.reload.quantity
  end

  test "T06 T09 wrong patient site and revoked role cannot read or mutate prescription evidence" do
    order = prescription(route: "take_home")
    other_patient = @practice.patients.create!(display_name: "Synthetic Other Patient", reference: "JOURNEY-OTHER")
    get events_path(order, patient: other_patient), headers: @headers
    assert_response :not_found
    viewer = User.create!(email_address: "journey-orders-viewer@example.invalid", password: @password)
    membership = @practice.memberships.create!(user: viewer)
    grant_permissions!(membership, "patients.read")
    grant_permissions!(membership, "clinical_records.read", scope_kind: "site", site: @site)
    login(viewer)
    get events_path(order), headers: @headers
    assert_response :success
    assert_no_difference "Clinic::Care::PrescriptionEvent.count" do
      post_event(order, "review")
      assert_response :forbidden
    end
    grant_permissions!(membership, "medication_requests.write", "medication_administrations.write", scope_kind: "site", site: @other_site)
    post_dispense(order, quantity: "1.00", reason: "Wrong-site authorization")
    assert_response :forbidden
    revoke_all_permissions!(membership)
    get events_path(order), headers: @headers
    assert_includes [403, 404], response.status
    assert_equal BigDecimal("4.00"), @batch.reload.quantity
  end

  test "T06 an authorized handover performer need not receive prescription editing authority" do
    order = prescription(route: "take_home")
    post_event(order, "review")
    assert_response :created
    nurse = User.create!(email_address: "journey-handover-performer@example.invalid", password: @password)
    membership = @practice.memberships.create!(user: nurse)
    grant_permissions!(membership, "patients.read")
    grant_permissions!(membership, "clinical_records.read", "medication_administrations.write",
      scope_kind: "site", site: @site)
    ability = Ability.new(nurse, practice: @practice)
    assert_not ability.allowed_permission?("medication_requests.write", site: @site)
    assert_not ability.allowed_permission?("inventory.adjust")
    login(nurse)
    assert_difference ["Clinic::Care::MedicationDispense.count", "Clinic::Inventory::PharmacyMovement.count"], 1 do
      post_dispense(order, quantity: "1.00", reason: "Partial handover from the reviewed prescription")
      assert_response :created
    end
    assert_equal membership.id, response.parsed_body.dig("dispense", "recorded_by_membership_id")
    assert_equal BigDecimal("3.00"), @batch.reload.quantity
    assert_no_difference "Clinic::Care::PrescriptionEvent.count" do
      post_event(order, "review")
      assert_response :forbidden
    end
  end

  test "T06 corrected handover after completion reopens the same responsibility and requires renewed authorization and review" do
    order = prescription(route: "take_home")
    post_event(order, "review")
    assert_response :created
    post_dispense(order, quantity: "3.00")
    assert_response :created
    original = response.parsed_body.dig("dispense", "id")
    order = revise(order, status: "completed")
    task = Clinic::ClinicalTask.find_by!(practice: @practice, patient: @patient, source_kind: "medication_request")
    assert_equal "completed", task.state
    @encounter.close!
    assert_no_difference "Clinic::ClinicalTask.count" do
      post_dispense(order, status: "reversed", original:, reason: "Corrected an erroneous handover; stock remained at the clinic")
      assert_response :created
    end
    assert_equal "open", task.reload.state
    assert_nil task.completed_at
    assert_equal BigDecimal("4.00"), @batch.reload.quantity
    post_dispense(order, quantity: "3.00")
    assert_response :unprocessable_entity
    order = revise(order, status: "authorized")
    post_dispense(order, quantity: "3.00")
    assert_response :unprocessable_entity
    post_event(order, "review")
    assert_response :created
    post_dispense(order, quantity: "3.00")
    assert_response :created
    assert_no_difference "Clinic::ClinicalTask.count" do
      order = revise(order, status: "completed")
    end
    assert_equal "completed", task.reload.state
    assert_equal BigDecimal("1.00"), @batch.reload.quantity
    assert_empty Clinic::Care::MedicationAdministration.where(patient: @patient)
    assert_raises(ArgumentError) { revise(order, status: "authorized") }
  end

  test "T09 exact order creation retry keeps one series while changed content conflicts" do
    path = "/api/clinic/patients/#{@patient.id}/encounters/#{@encounter.id}/service_requests"
    request = { service_request: { request_kind: "lab", intent: "order", priority: "routine",
      requested_display: "Synthetic retry preparation", request_key: "journey-create-retry" } }
    post path, params: request, headers: csrf_headers, as: :json
    assert_response :created
    first = response.parsed_body.fetch("service_request")
    assert_no_difference "Clinic::Care::ServiceRequestRevision.count" do
      post path, params: request, headers: csrf_headers, as: :json
      assert_response :created
      assert_equal first.fetch("id"), response.parsed_body.dig("service_request", "id")
      assert_equal first.fetch("series_id"), response.parsed_body.dig("service_request", "series_id")
      request[:service_request][:requested_display] = "Changed synthetic preparation"
      post path, params: request, headers: csrf_headers, as: :json
      assert_response :conflict
    end
    request[:service_request][:request_key] = "journey-create-independent"
    post path, params: request, headers: csrf_headers, as: :json
    assert_response :created
    assert_not_equal first.fetch("series_id"), response.parsed_body.dig("service_request", "series_id")
  end

  private

  def prescription(route:, attributes: {})
    draft = Clinic::Care::ClinicalPlanWorkflow.create(kind: :medication_requests, practice: @practice, actor: @actor,
      patient: @patient, encounter: @encounter, request_key: SecureRandom.uuid, attributes: {
        intent: "order", inventory_product_id: @product.id, medication_name: @product.name, medication_strength: "10 mg/mL",
        medication_form: "solution", dose_value: "1", dose_unit_code: "mL", route_code: "oral",
        frequency_text: "Synthetic once-only instruction", instructions: "Synthetic directions, not a clinical recommendation",
        prescribed_quantity: "3.00", quantity_unit: "mL", refills: 0, fulfillment_route: route,
        pharmacy_name: "Synthetic pharmacy", pharmacy_location: "Synthetic location 1",
        substitution_instruction: "not_allowed"
      }.merge(attributes))
    revise(draft, status: "authorized")
  end

  def revise(order, **attributes)
    Clinic::Care::ClinicalPlanWorkflow.revise(kind: :medication_requests, series_id: order.series_id, practice: @practice,
      actor: @actor, patient: @patient, encounter: @encounter, attributes:, expected_version: order.version_number,
      request_key: SecureRandom.uuid)
  end

  def prepare_lab
    Clinic::Care::ClinicalPlanWorkflow.create(kind: :service_requests, practice: @practice, actor: @actor,
      patient: @patient, encounter: @encounter, request_key: SecureRandom.uuid,
      attributes: { request_kind: "lab", intent: "order", priority: "routine", requested_display: "Synthetic selected test" })
  end

  def events_path(order, patient: @patient)
    "/api/clinic/patients/#{patient.id}/medication_requests/#{order.id}/events"
  end

  def order_path(order)
    "/api/clinic/patients/#{@patient.id}/encounters/#{@encounter.id}/medication_requests/#{order.series_id}"
  end

  def post_event(order, kind, source: "manual", key: SecureRandom.uuid, prior: nil, note: nil)
    post events_path(order), params: { prescription_event: { kind:, source:, request_key: key, prior_event_id: prior, note: } },
      headers: csrf_headers, as: :json
  end

  def post_dispense(order, status: "handed_over", batch: @batch, quantity: nil, key: SecureRandom.uuid, original: nil, reason: nil)
    post "/api/clinic/patients/#{@patient.id}/medication_requests/#{order.id}/dispenses", params: { dispense: {
      status:, batch_id: batch.id, quantity:, request_key: key, original_dispense_id: original, reason:,
      handed_over_at: (@encounter.started_at + 30.minutes).iso8601(6)
    } }, headers: csrf_headers, as: :json
  end

  def submit_prescription(order, destination_id, scenario: "acknowledged", key: SecureRandom.uuid)
    post "#{events_path(order).delete_suffix('/events')}/submit", params: { prescription_submission: {
      pharmacy_destination_id: destination_id, scenario:, request_key: key
    } }, headers: csrf_headers, as: :json
  end

  def receive_batch(lot, location, quantity, expires_on: Date.current + 90)
    Clinic::Inventory::Receiving.call(practice: @practice, actor: @actor, supplier: "Synthetic supplier",
      reason: "Synthetic opening stock", request_key: SecureRandom.uuid, lines: [{ product_id: @product.id,
        lot_number: lot, location_id: location.id, location: location.name, expires_on: expires_on.iso8601,
        amount: quantity, input_unit: @product.stock_unit }]).lines.sole.batch
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def login(user)
    post "/api/session", params: { email_address: user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end
end
