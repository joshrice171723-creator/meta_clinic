require "test_helper"

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
    post "/api/demo/run", params: { template_key: "primary_care" }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_no_difference "User.count" do
      register_visitor
    end
    visitor = Development::DemoVisitor.order(:id).last
    assert_equal "Taylor Example", visitor.name
    assert_equal "taylor@example.test", visitor.email
    assert_equal "Example Clinic", visitor.company

    primary = start_demo("primary_care")
    assert_equal "primary_care", primary.fetch("template_key")
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
    assert_equal 404, other.response.status
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

    post "/api/demo/run", params: { template_key: "weight_management" }, headers: csrf_headers, as: :json
    assert_response :created
    fresh = response.parsed_body.fetch("run")
    refute_equal run.dig("clinic", "id"), fresh.dig("clinic", "id")
    assert_equal 0, Clinic::Inventory::Receipt.where(practice_id: fresh.dig("clinic", "id")).count
  end

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def start_demo(template_key)
    register_visitor
    post "/api/demo/run", params: { template_key: }, headers: csrf_headers, as: :json
    assert_response :created
    response.parsed_body.fetch("run")
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
end
