require "test_helper"

class ClinicBillingServicesTest < ActionDispatch::IntegrationTest
  setup do
    organization = Organization.create!(name: "Billing catalog test organization")
    @practice = Clinic::Practice.create!(name: "Billing catalog practice", organization: organization, timezone: "UTC")
    @other_practice = Clinic::Practice.create!(name: "Other billing practice", organization: organization, timezone: "UTC")
    @password = SecureRandom.hex(18)
    @actor = User.create!(email_address: "billing-catalog@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "billing.catalog.manage")
    @patient = @practice.patients.create!(display_name: "Catalog Patient", reference: "CATALOG-001")
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    post "/api/session", params: { email_address: @actor.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  test "catalog API is tenant scoped idempotent and optimistic" do
    payload = {
      service: {
        request_key: "catalog-create-office-visit", name: "Office visit", code: "VISIT",
        description: "Standard visit", unit_amount: "85.00", currency: "USD"
      }
    }
    post "/api/clinic/billing_services", params: payload, headers: csrf_headers, as: :json
    assert_response :created
    created = response.parsed_body.fetch("service")

    post "/api/clinic/billing_services", params: payload, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal created.fetch("id"), response.parsed_body.dig("service", "id")
    assert_equal 1, @practice.billing_services.count

    @other_practice.billing_services.create!(name: "Other practice visit", unit_amount: "10.00", currency: "USD")
    get "/api/clinic/billing_services?q=visit&active=true", headers: @headers
    assert_response :success
    assert_equal [ created.fetch("id") ], response.parsed_body.fetch("services").map { |service| service.fetch("id") }
    assert_equal true, response.parsed_body.fetch("can_manage")
    assert_equal 1, response.parsed_body.dig("pagination", "total")

    update = { service: { request_key: "catalog-update-office-visit", lock_version: created.fetch("lock_version"), unit_amount: "95.00" } }
    patch "/api/clinic/billing_services/#{created.fetch('id')}", params: update, headers: csrf_headers, as: :json
    assert_response :success
    updated = response.parsed_body.fetch("service")
    assert_equal "95.0", updated.fetch("unit_amount")

    patch "/api/clinic/billing_services/#{created.fetch('id')}", params: update, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal updated.fetch("lock_version"), response.parsed_body.dig("service", "lock_version")

    update[:service][:request_key] = "catalog-update-office-visit-stale"
    patch "/api/clinic/billing_services/#{created.fetch('id')}", params: update, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "stale_record", response.parsed_body.fetch("code")
  end

  test "catalog invoice lines snapshot authoritative terms and reject stale or foreign selections" do
    grant_permissions!(@membership, "billing.invoice_draft")
    service = @practice.billing_services.create!(
      name: "Follow-up visit", description: "Established patient", unit_amount: "70.00", currency: "USD"
    )
    request = [ { billing_service_id: service.id, service_lock_version: service.lock_version, quantity: "2" } ]
    invoice = Clinic::Billing::DraftInvoice.call(
      practice: @practice, actor: @actor, patient: @patient, currency: "USD", lines: request,
      request_key: "catalog-invoice-snapshot"
    )
    line = invoice.lines.sole
    assert_equal service.id, line.billing_service_id
    assert_equal "70.0", line.unit_amount.to_s("F")
    assert_equal "140.0", line.posted_amount.to_s("F")
    assert_equal "Follow-up visit — Established patient", line.description_snapshot

    service.update!(unit_amount: "80.00")
    replay = Clinic::Billing::DraftInvoice.call(
      practice: @practice, actor: @actor, patient: @patient, currency: "USD", lines: request,
      request_key: "catalog-invoice-snapshot"
    )
    assert_equal invoice.id, replay.id
    assert_equal "70.0", replay.lines.sole.unit_amount.to_s("F")
    assert_raises(ActiveRecord::StaleObjectError) do
      Clinic::Billing::DraftInvoice.call(
        practice: @practice, actor: @actor, patient: @patient, currency: "USD", lines: request,
        request_key: "catalog-invoice-stale-selection"
      )
    end

    foreign = @other_practice.billing_services.create!(name: "Foreign visit", unit_amount: "40.00", currency: "USD")
    assert_raises(ActiveRecord::RecordNotFound) do
      Clinic::Billing::DraftInvoice.call(
        practice: @practice, actor: @actor, patient: @patient, currency: "USD",
        lines: [ { billing_service_id: foreign.id, service_lock_version: foreign.lock_version, quantity: "1" } ],
        request_key: "catalog-invoice-foreign-service"
      )
    end

    service.update!(active: false)
    revised = Clinic::Billing::UpdateDraftInvoice.call(
      practice: @practice, actor: @actor, invoice: invoice, currency: "USD",
      lines: [ { invoice_line_id: line.id, quantity: "3" } ]
    )
    retained = revised.lines.sole
    assert_equal service.id, retained.billing_service_id
    assert_equal "70.0", retained.unit_amount.to_s("F")
    assert_equal "210.0", retained.posted_amount.to_s("F")
    assert_equal "Follow-up visit — Established patient", retained.description_snapshot

    euro_service = @practice.billing_services.create!(name: "Euro service", unit_amount: "40.00", currency: "EUR")
    assert_raises(ArgumentError) do
      Clinic::Billing::DraftInvoice.call(
        practice: @practice, actor: @actor, patient: @patient, currency: "USD",
        lines: [ { billing_service_id: euro_service.id, service_lock_version: euro_service.lock_version, quantity: "1" } ],
        request_key: "catalog-invoice-mixed-currency"
      )
    end

    custom = Clinic::Billing::DraftInvoice.call(
      practice: @practice, actor: @actor, patient: @patient, currency: "USD",
      lines: [ { quantity: "1", unit_amount: "15.00", description_snapshot: "Custom charge" } ],
      request_key: "catalog-invoice-custom-line"
    )
    assert_nil custom.lines.sole.billing_service_id
    assert_equal "Custom charge", custom.lines.sole.description_snapshot
  end

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
