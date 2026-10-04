require "test_helper"

class ClinicAssistantWorkflowsTest < ActionDispatch::IntegrationTest
  setup do
    travel_to Time.utc(2026, 10, 4, 8)
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Workflow assistant organization")
    @practice = Clinic::Practice.create!(organization:, name: "Workflow assistant practice", timezone: "UTC")
    @actor = User.create!(email_address: "workflow-assistant-#{SecureRandom.hex(6)}@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "facilities.read", "facilities.write", "patients.identity.read",
      "patients.read", "patients.write", "billing.catalog.manage")
    @site = @practice.sites.create!(code: "WORKFLOW", status: "active")
    configure_site!(@site, membership: @membership)
    @patient = @practice.patients.create!(display_name: "Synthetic Workflow Patient", reference: "WF-001")
    login(@actor)
    get "/api/clinic/context", headers: @headers
    assert_response :success
  end

  teardown { travel_back }

  test "optional patient context supports named selection, clearing, and an authorized read" do
    post "/api/clinic/assistant/workflows/context", params: {}, headers: csrf_headers, as: :json
    assert_response :created
    empty_context = response.parsed_body
    refute empty_context.key?("patient")

    post "/api/clinic/assistant/workflows/options", params: {
      context_id: empty_context.fetch("context_id"), operation: "context", field: "patient", query: "Synthetic Workflow"
    }, headers: csrf_headers, as: :json
    assert_response :success
    selection = response.parsed_body.fetch("options").sole
    assert_equal "Synthetic Workflow Patient · WF-001", selection.fetch("label")

    post "/api/clinic/assistant/workflows/context", params: {
      context_id: empty_context.fetch("context_id"), patient_selection_id: selection.fetch("selection_id")
    }, headers: csrf_headers, as: :json
    assert_response :created
    selected_context = response.parsed_body
    assert_equal @patient.display_name, selected_context.dig("patient", "name")
    bound_context = Clinic::Assistant::WorkflowContextRecord.find_by!(public_id: selected_context.fetch("context_id"))

    post "/api/clinic/assistant/workflows/read", params: {
      context_id: selected_context.fetch("context_id"), operation: "facilities.site", inputs: {}
    }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "result", response.parsed_body.fetch("status")
    assert_equal "Selected site and operating hours", response.parsed_body.fetch("title")

    post "/api/clinic/assistant/workflows/proposals", params: {
      context_id: selected_context.fetch("context_id"), operation: "care.coordination_add",
      inputs: { group: "primary_care", name: "Synthetic clinic", source: "patient",
        address_confirmed: true }
    }, headers: csrf_headers, as: :json
    assert_response :created
    pending = Clinic::Assistant::WorkflowProposal.find_by!(public_id: response.parsed_body.fetch("proposal_id"))

    post "/api/clinic/assistant/workflows/context", params: {
      context_id: selected_context.fetch("context_id")
    }, headers: csrf_headers, as: :json
    assert_response :created
    cleared = response.parsed_body
    refute cleared.key?("patient")
    assert bound_context.reload.invalidated_at
    assert_equal "invalidated", pending.reload.status
    assert Clinic::AuditEvent.where(practice: @practice, action_code: "assistant.workflow.context.invalidated").exists?
  end

  test "change requires proposal and confirmation, stores readback, and rejects duplicate confirmation" do
    context = create_empty_context
    inputs = { name: "Assistant-added service", code: "WF-SVC", description: "Synthetic test",
      unit_amount: "125.00", currency: "USD" }
    post "/api/clinic/assistant/workflows/proposals", params: {
      context_id: context.fetch("context_id"), operation: "billing.create_service", inputs:
    }, headers: csrf_headers, as: :json
    assert_response :created
    proposal = response.parsed_body
    record = Clinic::Assistant::WorkflowProposal.find_by!(public_id: proposal.fetch("proposal_id"))
    assert_equal inputs.stringify_keys, record.arguments_data
    assert_equal "pending", record.status
    refute Clinic::BillingService.where(practice: @practice, name: inputs.fetch(:name)).exists?

    post "/api/clinic/assistant/workflows/proposals/#{proposal.fetch('proposal_id')}/confirm",
      params: { context_id: context.fetch("context_id") }, headers: csrf_headers, as: :json
    assert_response :success
    receipt = response.parsed_body
    assert_equal "receipt", receipt.fetch("status")
    service = Clinic::BillingService.find_by!(practice: @practice, name: inputs.fetch(:name))
    assert_includes response.body, service.name

    get "/api/clinic/assistant/workflows/proposals/#{proposal.fetch('proposal_id')}",
      params: { context_id: context.fetch("context_id") }, headers: @headers
    assert_response :success
    assert_equal receipt, response.parsed_body

    post "/api/clinic/assistant/workflows/proposals/#{proposal.fetch('proposal_id')}/confirm",
      params: { context_id: context.fetch("context_id") }, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "duplicate_submission", response.parsed_body.fetch("code")
    assert_equal 1, Clinic::BillingService.where(practice: @practice, name: inputs.fetch(:name)).count
    assert Clinic::AuditEvent.where(practice: @practice, action_code: "assistant.workflow.proposal.confirmed").exists?
  end

  test "stale named options and forged fields cannot be proposed" do
    context = create_empty_context
    service = Clinic::BillingService.create!(practice: @practice, name: "Old service", unit_amount: "10.00", currency: "USD")
    post "/api/clinic/assistant/workflows/options", params: {
      context_id: context.fetch("context_id"), operation: "billing.update_service", field: "service"
    }, headers: csrf_headers, as: :json
    assert_response :success
    token = response.parsed_body.fetch("options").sole.fetch("selection_id")
    service.update!(name: "Renamed service")

    post "/api/clinic/assistant/workflows/proposals", params: {
      context_id: context.fetch("context_id"), operation: "billing.update_service",
      inputs: { service: token, unit_amount: "15.00" }
    }, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal 0, Clinic::Assistant::WorkflowProposal.where(status: "pending").count

    post "/api/clinic/assistant/workflows/proposals", params: {
      context_id: context.fetch("context_id"), operation: "billing.create_service",
      inputs: { name: "Forged", code: "", description: "", unit_amount: "1.00", currency: "USD", site_id: @site.id }
    }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal 0, Clinic::BillingService.where(practice: @practice, name: "Forged").count
    assert Clinic::AuditEvent.where(practice: @practice, action_code: "assistant.workflow.invalid").exists?
  end

  test "a confirmed site update refreshes the bound context so its receipt remains recoverable" do
    context = create_empty_context
    post "/api/clinic/assistant/workflows/proposals", params: {
      context_id: context.fetch("context_id"), operation: "configuration.site_update",
      inputs: { address_line1: "100 Synthetic Avenue", city: "Sample City", state: "TX",
        postal_code: "75001", country: "US" }
    }, headers: csrf_headers, as: :json
    assert_response :created
    proposal_id = response.parsed_body.fetch("proposal_id")

    post "/api/clinic/assistant/workflows/proposals/#{proposal_id}/confirm",
      params: { context_id: context.fetch("context_id") }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "100 Synthetic Avenue", @site.reload.address_line1
    context_record = Clinic::Assistant::WorkflowContextRecord.find_by!(public_id: context.fetch("context_id"))
    assert_equal Clinic::Assistant::ContextRegistry.record_version(@site),
      context_record.session_snapshot.fetch("site_record_version")

    get "/api/clinic/assistant/workflows/proposals/#{proposal_id}",
      params: { context_id: context.fetch("context_id") }, headers: @headers
    assert_response :success
    assert_equal "receipt", response.parsed_body.fetch("status")
  end

  test "expired proposal is rejected and remains unexecuted" do
    context = create_empty_context
    post "/api/clinic/assistant/workflows/proposals", params: {
      context_id: context.fetch("context_id"), operation: "billing.create_service",
      inputs: { name: "Expired service", code: "WF-EXP", description: "", unit_amount: "8.00", currency: "USD" }
    }, headers: csrf_headers, as: :json
    assert_response :created
    proposal_id = response.parsed_body.fetch("proposal_id")
    Clinic::Assistant::WorkflowProposal.find_by!(public_id: proposal_id).update!(expires_at: 1.second.ago)

    post "/api/clinic/assistant/workflows/proposals/#{proposal_id}/confirm",
      params: { context_id: context.fetch("context_id") }, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "proposal_expired", response.parsed_body.fetch("code")
    assert_not Clinic::BillingService.where(practice: @practice, name: "Expired service").exists?
  end

  test "concurrent duplicate confirmations commit one workflow and reject the replay" do
    context = create_empty_context
    post "/api/clinic/assistant/workflows/proposals", params: {
      context_id: context.fetch("context_id"), operation: "billing.create_service",
      inputs: { name: "Concurrent service", code: "WF-RACE", description: "", unit_amount: "9.00", currency: "USD" }
    }, headers: csrf_headers, as: :json
    assert_response :created
    proposal_id = response.parsed_body.fetch("proposal_id")
    token = csrf_headers.fetch("X-CSRF-Token")
    cookie = integration_session.cookies.to_hash.map { |name, value| "#{name}=#{Rack::Utils.escape(value)}" }.join("; ")
    ready = Queue.new
    release = Queue.new
    workers = 2.times.map do
      Thread.new do
        ApplicationRecord.connection_pool.with_connection do
          browser = ActionDispatch::Integration::Session.new(Rails.application)
          browser.host! "localhost:3000"
          browser_headers = @headers.merge("Cookie" => cookie, "X-CSRF-Token" => token)
          ready << true
          release.pop
          browser.post "/api/clinic/assistant/workflows/proposals/#{proposal_id}/confirm",
            params: { context_id: context.fetch("context_id") }, headers: browser_headers, as: :json
          [browser.response.status, browser.response.parsed_body]
        end
      end
    end
    2.times { ready.pop }
    2.times { release << true }
    results = workers.map(&:value)
    assert_equal [200, 409], results.map(&:first).sort, results.inspect
    duplicate = results.find { |status, _body| status == 409 }.last
    assert_equal "duplicate_submission", duplicate.fetch("code")
    assert_equal 1, Clinic::BillingService.where(practice: @practice, name: "Concurrent service").count
  ensure
    workers&.each { |worker| worker.kill if worker.alive? }
  end

  test "audit outage prevents workflow data from being released" do
    context = create_empty_context
    with_stubbed_method(Clinic::AuditRecorder, :record!, ->(**_arguments) { raise Clinic::AuditRecorder::Unavailable }) do
      get "/api/clinic/assistant/workflows/catalog", params: { context_id: context.fetch("context_id") }, headers: @headers
    end
    assert_response :service_unavailable
    assert_equal "audit_unavailable", response.parsed_body.fetch("code")
    refute response.parsed_body.key?("operations")
  end

  test "workflow context cannot cross a member session and authorization generation change invalidates it" do
    context = create_empty_context
    browser = ActionDispatch::Integration::Session.new(Rails.application)
    browser.host! "localhost:3000"
    browser_headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    browser.get "/api/csrf", headers: browser_headers
    browser_headers = browser_headers.merge("X-CSRF-Token" => browser.response.parsed_body.fetch("csrf_token"))
    browser.post "/api/session", params: { email_address: @actor.email_address, password: @password },
      headers: browser_headers, as: :json
    assert_equal 200, browser.response.status
    browser.get "/api/clinic/context", headers: browser_headers
    assert_equal 200, browser.response.status
    browser.get "/api/clinic/assistant/workflows/catalog",
      params: { context_id: context.fetch("context_id") }, headers: browser_headers
    assert_equal 404, browser.response.status

    @membership.update!(authorization_generation: @membership.authorization_generation + 1)
    get "/api/clinic/assistant/workflows/catalog", params: { context_id: context.fetch("context_id") }, headers: @headers
    assert_response :conflict
    assert_equal "stale_context", response.parsed_body.fetch("code")
    assert Clinic::AuditEvent.where(practice: @practice, action_code: "assistant.workflow.context.invalidated").exists?
  end

  test "model suggestion cannot select another operation or inject server authority" do
    context = create_empty_context
    with_stubbed_method(Clinic::Assistant::WorkflowModelGateway, :call,
      ->(**_arguments) { { operation: "configuration.site_update", inputs: { address_line1: "Forged" }, message: nil } }) do
      post "/api/clinic/assistant/workflows/messages", params: {
        context_id: context.fetch("context_id"), operation: "billing.create_service", message: "create a service"
      }, headers: csrf_headers, as: :json
    end
    assert_response :bad_gateway
    assert_equal "assistant_request_failed", response.parsed_body.fetch("code")
    assert_not_equal "Forged", @site.reload.address_line1

    with_stubbed_method(Clinic::Assistant::WorkflowModelGateway, :call,
      ->(**_arguments) { { operation: "billing.create_service", inputs: { name: "Unsafe", site_id: @site.id }, message: nil } }) do
      post "/api/clinic/assistant/workflows/messages", params: {
        context_id: context.fetch("context_id"), operation: "billing.create_service", message: "create a service"
      }, headers: csrf_headers, as: :json
    end
    assert_response :unprocessable_entity
    assert_not Clinic::BillingService.where(practice: @practice, name: "Unsafe").exists?
  end

  private

  def create_empty_context
    post "/api/clinic/assistant/workflows/context", params: {}, headers: csrf_headers, as: :json
    assert_response :created
    response.parsed_body
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def login(user)
    post "/api/session", params: { email_address: user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  def with_stubbed_method(receiver, name, implementation)
    original = receiver.method(name)
    receiver.define_singleton_method(name) do |*args, **kwargs, &block|
      implementation.call(*args, **kwargs, &block)
    end
    yield
  ensure
    receiver.define_singleton_method(name, original) if original
  end
end
