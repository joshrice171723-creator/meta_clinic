require "test_helper"
require "digest"

class GuidedClinicDemoTest < ActionDispatch::IntegrationTest
  setup do
    @previous_environment = Rails.env
    @previous_flag = ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env = "development"
    ENV["APP_DEVELOPMENT_LOGIN"] = "1"
    Rails.cache.clear
    ActionMailer::Base.deliveries.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
  end

  teardown do
    Rails.env = @previous_environment
    ENV["APP_DEVELOPMENT_LOGIN"] = @previous_flag
  end

  test "starts isolated templates with an empty catalog and unfinished lessons" do
    get "/api/demo/run", headers: @headers
    assert_response :success
    assert_equal false, response.parsed_body.fetch("visitor_registered")
    assert_empty response.parsed_body.fetch("options")
    post "/api/demo/visitor", params: { name: "Taylor", email: "invalid", company: "Example Clinic" }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    post "/api/demo/run", params: { template_key: "primary_care", clinic_name: "Taylor Example Clinic" }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_no_difference "User.count" do
      register_visitor
    end
    visitor = Development::DemoVisitor.order(:id).last
    assert_equal "Taylor Example", visitor.name
    assert_equal "taylor@example.test", visitor.email
    assert_equal "Example Clinic", visitor.company

    post "/api/demo/run", params: { template_key: "primary_care", clinic_name: "   " }, headers: csrf_headers, as: :json
    assert_response :bad_request
    primary = start_demo("primary_care", clinic_name: "  Taylor Example Clinic  ")
    assert_equal "primary_care", primary.fetch("template_key")
    assert_equal "Taylor Example Clinic", primary.dig("clinic", "name")
    assert_equal "primary_care", Clinic::Configuration::PracticeFeatures.snapshot(practice: practice_for(primary)).fetch(:clinic_type)
    refute Clinic::Configuration::PracticeFeatures.snapshot(practice: practice_for(primary)).fetch(:finalized)
    assert_empty Clinic::Care::SubscriptionProjection.catalog(practice: practice_for(primary))
    assert_equal "locked", step(primary, "enroll").fetch("status")
    assert_equal "locked", step(primary, "payment").fetch("status")
    assert_equal 0, Clinic::Inventory::Receipt.where(practice_id: primary.dig("clinic", "id")).count
    assert_equal 0, Clinic::Inventory::CountSession.where(practice_id: primary.dig("clinic", "id")).count
    assert_equal 0, Clinic::Inventory::PharmacyMovement.where(practice_id: primary.dig("clinic", "id"), kind: "adjustment_out").count

    other = open_session
    other.host! "localhost:3000"
    other.cookies["guided_clinic_demo_run"] = cookies["guided_clinic_demo_run"]
    other.get "/api/demo/run", headers: @headers
    assert_equal 200, other.response.status
    assert_equal false, other.response.parsed_body.fetch("active")
  end

  test "gates patient access, enrolls a generated account, reconciles payment, and returns to its clinic" do
    run = start_demo("primary_care")
    post "/api/demo/run/view", params: { view: "patient" }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity

    finalize!(run)
    version_id = publish_catalog(practice_for(run))
    post "/api/demo/run/view", params: { view: "patient" }, headers: csrf_headers, as: :json
    assert_response :success

    post "/api/demo/run/enrollment", params: { version_id:, selections: [] }, headers: csrf_headers, as: :json
    assert_response :created
    assert_equal "/memberships/account?payment=local", response.parsed_body.fetch("destination")
    prospect = Development::DemoRun.find(run.fetch("id")).membership_prospect
    assert_equal "Alex Morgan", prospect.display_name
    assert_empty ActionMailer::Base.deliveries
    assert prospect.checkout_session_id.present?

    post "/api/public/membership_accounts/local_payment", params: { payment: { outcome: "paid", request_key: "guided-paid" } }, headers: csrf_headers, as: :json
    assert_response :success
    get "/api/demo/run", headers: @headers
    active = response.parsed_body.fetch("run")
    assert_equal prospect.reload.patient_id, active.dig("patient", "id")
    assert_equal "complete", step(active, "payment").fetch("status")

    post "/api/demo/run/view", params: { view: "clinic" }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "clinic", response.parsed_body.dig("run", "view")
  end

  test "rejects foreign catalog IDs and changed enrollment replays" do
    run = start_demo("primary_care")
    finalize!(run)
    version_id = publish_catalog(practice_for(run))
    changed_version_id = publish_catalog(practice_for(run), label: "changed")
    foreign_user = User.create!(email_address: "guided-foreign@example.test", password: SecureRandom.urlsafe_base64(24), active: true)
    foreign = Development::TestClinic.create!(foreign_user).practice
    foreign_version = publish_catalog(foreign)

    post "/api/demo/run/enrollment", params: { version_id: foreign_version, selections: [] }, headers: csrf_headers, as: :json
    assert_response :not_found
    post "/api/demo/run/enrollment", params: { version_id:, selections: [] }, headers: csrf_headers, as: :json
    assert_response :created
    post "/api/demo/run/enrollment", params: { version_id: foreign_version, selections: [] }, headers: csrf_headers, as: :json
    assert_response :not_found
    post "/api/demo/run/enrollment", params: { version_id: changed_version_id, selections: [] }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
  end

  test "denies the route outside local development" do
    Rails.env = "test"
    get "/api/demo/run", headers: @headers
    assert_response :not_found
  end

  test "reset deactivates generated accounts while retaining the visitor for a fresh clinic" do
    run = start_demo("primary_care")
    finalize!(run)
    version_id = publish_catalog(practice_for(run))
    post "/api/demo/run/enrollment", params: { version_id:, selections: [] }, headers: csrf_headers, as: :json
    assert_response :created
    record = Development::DemoRun.find(run.fetch("id"))
    operator_id = record.operator_user_id
    patient_id = record.patient_user_id
    visitor_id = record.visitor_id

    post "/api/demo/run/reset", headers: csrf_headers, as: :json
    assert_response :success
    assert_equal false, response.parsed_body.fetch("active")
    assert_equal true, response.parsed_body.fetch("visitor_registered")
    assert_equal %w[primary_care weight_management], response.parsed_body.fetch("options").pluck("key")
    refute Development::DemoRun.find(record.id).active?
    refute User.find(operator_id).active?
    refute User.find(patient_id).active?
    assert_equal 0, MemberSession.where(user_id: [operator_id, patient_id]).count
    assert_equal visitor_id, Development::DemoVisitor.find(visitor_id).id

    post "/api/demo/run", params: { template_key: "weight_management", clinic_name: "Taylor Weight Clinic" }, headers: csrf_headers, as: :json
    assert_response :created
    fresh = response.parsed_body.fetch("run")
    refute_equal run.dig("clinic", "id"), fresh.dig("clinic", "id")
    assert_equal 0, Clinic::Inventory::Receipt.where(practice_id: fresh.dig("clinic", "id")).count
  end

  test "persisted receiving count completion and stock adjustment unlock inventory lessons" do
    run = paid_clinic_run
    record = Development::DemoRun.find(run.fetch("id"))
    practice = record.practice
    order = practice.inventory_purchase_orders.sole
    line = order.lines.sole
    shipment = order.shipments.sole
    location = practice.inventory_locations.find_by!(name: "Supply cabinet")
    profile = practice.inventory_profiles.order(version: :desc).first!
    assert_equal "configured", profile.status
    assert_equal [ "inventory" ], profile.capabilities
    receive_key = SecureRandom.uuid
    count_key = SecureRandom.uuid
    observe_key = SecureRandom.uuid
    complete_key = SecureRandom.uuid
    adjustment_key = SecureRandom.uuid

    post "/api/clinic/inventory/receipts?response=ack", params: { receipt: {
      purchase_order_id: order.id.to_s, shipment_id: shipment.id.to_s, purchase_order_line_id: line.id.to_s,
      lot_number: "GUIDED-LOT-#{record.id}", expiration_date: "2099-01-01", quantity_packages: "2",
      destination_location_id: location.id.to_s, reason: "Fictional guided delivery", request_key: receive_key
    } }, headers: csrf_headers, as: :json
    assert_response :success, response.body
    assert_equal 1, Clinic::Inventory::Receipt.where(practice:).count

    post "/api/clinic/inventory/count-sessions", params: { session: {
      location_id: location.id.to_s, assignee_id: record.operator_user_id.to_s, due_on: Date.current.iso8601,
      blind: false, reason: "Guided count", request_key: count_key
    } }, headers: csrf_headers, as: :json
    assert_response :created, response.body
    count = Clinic::Inventory::CountSession.find(response.parsed_body.fetch("id"))
    line_item = count.lines.sole
    post "/api/clinic/inventory/count-session-lines/#{line_item.id}/observe", params: { count: {
      counted_units: "200", reason: "Guided observed count", request_key: observe_key
    } }, headers: csrf_headers, as: :json
    assert_response :created, response.body
    post "/api/clinic/inventory/count-sessions/#{count.id}/complete", params: { event: {
      reason: "Guided count complete", request_key: complete_key
    } }, headers: csrf_headers, as: :json
    assert_response :success, response.body

    batch = practice.pharmacy_products.find_by!(sku: "GUIDED-GLOVES").batches.sole
    post "/api/clinic/inventory/lots/#{batch.lot_id}/adjust", params: { adjustment: {
      lot_id: batch.lot_id, location_id: batch.location_id, delta_units: "-1", reason: "Fictional glove use",
      request_key: adjustment_key
    } }, headers: csrf_headers, as: :json
    assert_response :success, response.body

    get "/api/demo/run", headers: @headers
    updated = response.parsed_body.fetch("run")
    %w[inventory_receive inventory_count inventory_use].each do |id|
      assert_equal "complete", step(updated, id).fetch("status")
    end
  end

  test "a changed visitor email retires its active run and creates a separate clinic" do
    original = start_demo("primary_care", clinic_name: "Original Clinic")
    old_run = Development::DemoRun.find(original.fetch("id"))
    old_operator = old_run.operator_user

    post "/api/demo/visitor", params: { name: "Jordan Example", email: "jordan@example.test", company: "Second Clinic" },
      headers: csrf_headers, as: :json
    assert_response :success
    assert_equal false, response.parsed_body.fetch("active")
    assert_equal true, response.parsed_body.fetch("visitor_registered")
    refute old_run.reload.active?
    refute old_operator.reload.active?
    assert_equal 0, MemberSession.where(user_id: old_operator.id).count

    get "/api/demo/run", headers: @headers
    assert_response :success
    assert_equal false, response.parsed_body.fetch("active")

    replacement = start_demo("weight_management", clinic_name: "  Jordan's Clinic  ", register_visitor: false)
    refute_equal original.dig("clinic", "id"), replacement.dig("clinic", "id")
    assert_equal "Jordan's Clinic", replacement.dig("clinic", "name")
  end

  test "a same-email visitor update keeps its authenticated clinic run" do
    run = start_demo("primary_care", clinic_name: "Retained Clinic")

    post "/api/demo/visitor", params: { name: "Taylor Updated", email: "TAYLOR@EXAMPLE.TEST", company: "Updated Clinic" },
      headers: csrf_headers, as: :json
    assert_response :success
    assert_equal true, response.parsed_body.fetch("active")
    assert_equal run.fetch("id"), response.parsed_body.dig("run", "id")
    assert_equal "Retained Clinic", response.parsed_body.dig("run", "clinic", "name")
  end

  test "a visitor cookie never recovers another browser's clinic from an email" do
    original = start_demo("primary_care", clinic_name: "First Browser Clinic")
    other = open_session
    other.host! "localhost:3000"
    other_headers = csrf_headers_for(other)
    other.post "/api/demo/visitor", params: { name: "Taylor Example", email: "taylor@example.test", company: "Example Clinic" },
      headers: other_headers, as: :json
    assert_equal 200, other.response.status
    other_headers = csrf_headers_for(other)
    other.post "/api/demo/run", params: { template_key: "weight_management", clinic_name: "Second Browser Clinic" },
      headers: other_headers, as: :json
    assert_equal 201, other.response.status

    refute_equal original.dig("clinic", "id"), other.response.parsed_body.dig("run", "clinic", "id")
  end

  test "booking, starting, and closing the paid patient's visit unlocks the clinical lessons" do
    run = paid_clinic_run
    record = Development::DemoRun.find(run.fetch("id"))
    practice = record.practice
    patient = record.patient
    site = practice.sites.first!
    room = practice.rooms.find_by!(site:)
    clinician = practice.clinician_profiles.first!
    visit_type = practice.visit_types.first!
    starts_at = Current.business_time.in_time_zone(practice.timezone).change(hour: 10, min: 0, sec: 0)
    starts_at += 1.day if starts_at <= Current.business_time
    appointment_key = SecureRandom.uuid
    follow_up_key = SecureRandom.uuid
    note_key = SecureRandom.uuid
    close_key = SecureRandom.uuid

    post "/api/clinic/appointments", params: { appointment: {
      patient_id: patient.id.to_s, starts_at: starts_at.iso8601, ends_at: (starts_at + 30.minutes).iso8601,
      site_id: site.id.to_s, room_id: room.id.to_s, booked_clinician_id: clinician.id.to_s,
      visit_type_id: visit_type.id.to_s, reason: "Guided first visit", request_key: appointment_key,
      visit_modality: "in_person"
    } }, headers: csrf_headers, as: :json
    assert_response :created, response.body
    appointment = Clinic::Appointment.find(response.parsed_body.dig("appointment", "id"))

    get "/api/demo/run", headers: @headers
    booked = response.parsed_body.fetch("run")
    assert_equal "complete", step(booked, "schedule").fetch("status")
    assert_equal "available", step(booked, "check_in").fetch("status")
    assert_equal "/clinic/front-desk?date=#{starts_at.in_time_zone(practice.timezone).to_date.iso8601}", step(booked, "check_in").fetch("href")
    assert_equal "locked", step(booked, "visit").fetch("status")

    post "/api/clinic/patients/#{patient.id}/encounters", params: { encounter: {
      patient_id: patient.id.to_s, appointment_id: appointment.id.to_s
    } }, headers: csrf_headers, as: :json
    assert_response :created
    encounter = Clinic::Encounter.find(response.parsed_body.dig("encounter", "id"))

    get "/api/demo/run", headers: @headers
    checked_in = response.parsed_body.fetch("run")
    assert_equal "complete", step(checked_in, "check_in").fetch("status")
    assert_equal "available", step(checked_in, "visit").fetch("status")

    put "/api/clinic/encounters/#{encounter.id}/follow_up", params: { follow_up: {
      request_key: follow_up_key, expected_version: 0, status: "not_required", plan: ""
    } }, headers: csrf_headers, as: :json
    assert_response :success, response.body
    assert_equal "not_required", response.parsed_body.dig("follow_up", "status")

    note_input = {
      note_kind: "soap", template_id: "adult-physical-exam-detailed", template_version: 1,
      subjective: "Fictional guided visit", objective: "", assessment: "", plan: "",
      patient_instructions: "Use the fictional care instructions.", request_key: note_key
    }
    post "/api/clinic/encounters/#{encounter.id}/notes", params: { encounter_note: note_input }, headers: csrf_headers, as: :json
    assert_response :created, response.body
    note = response.parsed_body.fetch("note")
    revision = note.fetch("current_revision")
    signed_payload = Clinic::Care::SoapNotePayload.dump(
      template_id: note_input.fetch(:template_id), template_version: note_input.fetch(:template_version),
      sections: note_input.slice(:subjective, :objective, :assessment, :plan),
      patient_instructions: note_input.fetch(:patient_instructions)
    )
    post "/api/clinic/notes/#{note.fetch('id')}/signatures", params: { signature: {
      revision_no: revision.fetch("revision_no"), content_digest: Digest::SHA256.hexdigest(signed_payload),
      attestation_version: "guided-demo-v1"
    } }, headers: csrf_headers, as: :json
    assert_response :created

    get "/api/clinic/encounters/#{encounter.id}/completion?patient_id=#{patient.id}", headers: @headers
    assert_response :success
    checklist = response.parsed_body
    assert_equal encounter.id, checklist.fetch("encounter_id")
    evidence = checklist.fetch("evidence")

    post "/api/clinic/encounters/#{encounter.id}/close", params: { close: {
      patient_id: patient.id, request_key: close_key, disposition_code: "completed_as_planned",
      instructions_status: "provided", education_status: "not_required",
      follow_up_id: evidence.dig("follow_up", "id"), follow_up_version: evidence.dig("follow_up", "version"),
      expected_follow_up_state: evidence.dig("follow_up", "status"),
      instruction_note_revision_id: evidence.dig("signed_instruction", "revision_id"),
      expected_education_event_ids: evidence.fetch("education_events").pluck("id"),
      expected_open_task_versions: evidence.fetch("open_tasks").map { |task| "#{task.fetch('id')}:#{task.fetch('version')}" },
      open_work_reviewed: true, exception_note: nil
    } }, headers: csrf_headers, as: :json
    assert_response :success, response.body
    assert_equal encounter.id, response.parsed_body.dig("completion_review", "encounter_id")

    get "/api/demo/run", headers: @headers
    assert_equal "complete", step(response.parsed_body.fetch("run"), "visit").fetch("status")
  end

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def start_demo(template_key, clinic_name: "Taylor Example Clinic", register_visitor: true)
    register_visitor() if register_visitor
    post "/api/demo/run", params: { template_key:, clinic_name: }, headers: csrf_headers, as: :json
    assert_response :created
    response.parsed_body.fetch("run")
  end

  def csrf_headers_for(session)
    session.get "/api/csrf", headers: @headers
    assert_equal 200, session.response.status
    @headers.merge("X-CSRF-Token" => session.response.parsed_body.fetch("csrf_token"))
  end

  def register_visitor
    post "/api/demo/visitor", params: { name: "  Taylor Example  ", email: " TAYLOR@EXAMPLE.TEST ", company: "  Example Clinic  " },
      headers: csrf_headers, as: :json
    assert_response :success
  end

  def practice_for(run)
    Clinic::Practice.find(run.dig("clinic", "id"))
  end

  def step(run, id)
    run.fetch("steps").find { |item| item.fetch("id") == id }
  end

  def finalize!(run)
    practice = practice_for(run)
    membership = Clinic::Membership.find_by!(practice:, user_id: Development::DemoRun.find(run.fetch("id")).operator_user_id)
    snapshot = Clinic::Configuration::PracticeFeatures.snapshot(practice:)
    Clinic::Configuration::PracticeFeatures.revise(practice:, actor: membership, request_key: "guided-finalize-#{run.fetch('id')}",
      expected_revision: snapshot.fetch(:revision), insurance_workflows_enabled: false,
      clinic_type: snapshot.fetch(:clinic_type), service_scope: snapshot.fetch(:service_scope),
      assessment_scope: snapshot.fetch(:assessment_scope), finalize: true)
  end

  def publish_catalog(practice = Clinic::Practice.find(Development::DemoRun.order(:id).last.practice_id), label: "base")
    actor = practice.memberships.first!.user
    family = Clinic::Care::SubscriptionCatalog.save(practice:, actor:, kind: "family", id: nil,
      attributes: { "name" => "Guided #{label} program", "lock_version" => 0 })
    Clinic::Care::SubscriptionCatalog.save(practice:, actor:, kind: "family", id: family.id,
      attributes: { "lock_version" => family.reload.lock_version, "publish" => true })
    service = Clinic::Care::SubscriptionCatalog.save(practice:, actor:, kind: "service", id: nil,
      attributes: { "name" => "Guided #{label} visit", "lock_version" => 0 })
    package = Clinic::Care::SubscriptionCatalog.save(practice:, actor:, kind: "package", id: nil,
      attributes: { "name" => "Guided #{label} membership", "family_id" => family.id, "lock_version" => 0,
        "draft" => { "amount" => "79.00", "currency" => "USD", "duration" => 1, "duration_unit" => "months",
          "renewal" => "none", "cancellation" => "immediate", "terms" => "Fictional terms.",
          "components" => [{ "service_id" => service.id, "mode" => "included" }] } })
    Clinic::Care::SubscriptionCatalog.publish(practice:, actor:, id: package.id,
      request_key: "guided-publish-#{practice.id}-#{label}", lock_version: package.lock_version).id
  end

  def paid_clinic_run
    run = start_demo("primary_care")
    finalize!(run)
    version_id = publish_catalog(practice_for(run))
    post "/api/demo/run/enrollment", params: { version_id:, selections: [] }, headers: csrf_headers, as: :json
    assert_response :created
    post "/api/public/membership_accounts/local_payment", params: { payment: { outcome: "paid", request_key: "guided-paid-#{run.fetch('id')}" } }, headers: csrf_headers, as: :json
    assert_response :success
    post "/api/demo/run/view", params: { view: "clinic" }, headers: csrf_headers, as: :json
    assert_response :success
    response.parsed_body.fetch("run")
  end
end
