require "test_helper"

class ClinicAdministrativePermissionsTest < ActionDispatch::IntegrationTest
  setup do
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Synthetic Administrative Organization")
    @practice = Clinic::Practice.create!(name: "Synthetic Administrative Practice", organization: organization)
    @site = @practice.sites.create!(code: "MAIN")
    @patient = @practice.patients.create!(display_name: "SYN_Admin, Avery", reference: "SYN-ADMIN-001")
    @users = %w[front_desk scheduler billing_operator].to_h do |role|
      user = User.create!(email_address: "admin-#{role}@example.invalid", password: @password)
      membership = @practice.memberships.create!(user: user)
      permissions = case role
      when "billing_operator" then %w[patients.identity.read billing.read billing.invoice_draft billing.invoice_post billing.payment_record]
      else %w[patients.identity.read appointments.read appointments.book appointments.status_transition]
      end
      grant_permissions!(membership, *permissions)
      [ role, user ]
    end
    @appointment = @practice.appointments.create!(patient: @patient, site: @site,
      starts_at: 1.hour.from_now, ends_at: 90.minutes.from_now, status: "scheduled")
    login(@users.fetch("front_desk"))
  end

  test "administrative lookup exposes only bounded identity fields" do
    get "/api/clinic/patients/lookup", params: { q: @patient.reference }, headers: @headers
    assert_response :success
    row = response.parsed_body.fetch("patients").sole
    assert_equal %w[display_name id reference], row.keys.sort
    assert_equal @patient.id, row.fetch("id")
    get "/api/clinic/patients/#{@patient.id}", headers: @headers
    assert_response :forbidden
  end

  test "front desk and scheduler are scheduling-only and billing operator is billing-only" do
    get "/api/clinic/facilities", params: { type: "visit_types" }, headers: @headers
    assert_response :success
    get "/api/clinic/clinicians", headers: @headers
    assert_response :success
    get "/api/clinic/appointments", headers: @headers
    assert_response :success
    assert_equal %w[display_name id reference], response.parsed_body.fetch("appointments").sole.fetch("patient").keys.sort
    get "/api/clinic/invoices/#{invoice.id}", headers: @headers
    assert_response :forbidden

    login(@users.fetch("billing_operator"))
    get "/api/clinic/patients/lookup", headers: @headers
    assert_response :success
    get "/api/clinic/appointments", headers: @headers
    assert_response :forbidden
    get "/api/clinic/invoices/#{invoice.id}", headers: @headers
    assert_response :success
    get "/api/clinic/patients/#{@patient.id}/invoices", headers: @headers
    assert_response :success
    row = response.parsed_body.fetch("invoices").sole
    assert_equal "10.0", row.fetch("total_amount")
    assert_equal "0.0", row.fetch("allocated_amount")
    assert_equal "0.0", row.fetch("credit_amount")
    assert_equal "10.0", row.fetch("balance_amount")
    assert_not row.key?("lines")
  end

  test "context reports atomic capabilities and staff write stays false" do
    get "/api/clinic/context", headers: @headers
    capabilities = response.parsed_body.fetch("capabilities")
    assert_equal true, capabilities.fetch("patient_identity_read")
    assert_equal true, capabilities.fetch("appointments_read")
    assert_equal true, capabilities.fetch("appointments_book")
    assert_equal true, capabilities.fetch("appointments_status_transition")
    assert_equal false, capabilities.fetch("billing_read")
    assert_equal false, capabilities.fetch("staff_write")
  end

  test "identity permission cannot generic-read a patient" do
    assert_equal false, Ability.new(@users.fetch("front_desk"), practice: @practice).can?(:read, @patient)
    assert_equal true, Ability.new(@users.fetch("front_desk"), practice: @practice).can?(:read_identity, @patient)
  end

  test "appointment read and booking remain separate atomic actions" do
    reader = administrative_user("schedule-reader", "patients.identity.read", "appointments.read")
    login(reader)
    get "/api/clinic/appointments", headers: @headers
    assert_response :success
    post "/api/clinic/appointments", params: appointment_payload, headers: csrf_headers, as: :json
    assert_response :forbidden
    assert @practice.audit_events.where(action_code: "appointments.book", outcome: "denied").exists?

    login(@users.fetch("scheduler"))
    post "/api/clinic/appointments", params: appointment_payload, headers: csrf_headers, as: :json
    assert_response :created
  end

  test "billing actions are atomic and legacy billing write remains compatible" do
    reader = administrative_user("billing-reader", "patients.identity.read", "billing.read")
    login(reader)
    get "/api/clinic/invoices/#{invoice.id}", headers: @headers
    assert_response :success
    get "/api/clinic/billing", headers: @headers
    assert_response :success
    post "/api/clinic/patients/#{@patient.id}/invoices", params: invoice_payload,
      headers: csrf_headers, as: :json
    assert_response :forbidden
    assert @practice.audit_events.where(action_code: "billing.invoice_draft", outcome: "denied").exists?

    drafter = administrative_user("billing-drafter", "billing.invoice_draft")
    login(drafter)
    post "/api/clinic/patients/#{@patient.id}/invoices", params: invoice_payload,
      headers: csrf_headers, as: :json
    assert_response :created
    atomic_invoice_id = response.parsed_body.dig("invoice", "id")
    post "/api/clinic/invoices/#{atomic_invoice_id}/post", headers: csrf_headers, as: :json
    assert_response :forbidden
    assert @practice.audit_events.where(action_code: "billing.invoice_post", outcome: "denied").exists?

    legacy = administrative_user("legacy-billing-writer", "billing.write")
    login(legacy)
    get "/api/clinic/billing", headers: @headers
    assert_response :forbidden
    post "/api/clinic/patients/#{@patient.id}/invoices", params: invoice_payload,
      headers: csrf_headers, as: :json
    assert_response :created
    legacy_invoice_id = response.parsed_body.dig("invoice", "id")
    post "/api/clinic/invoices/#{legacy_invoice_id}/post", headers: csrf_headers, as: :json
    assert_response :success
    post "/api/clinic/invoices/#{legacy_invoice_id}/payment_allocations",
      params: { payment: { external_event_reference: "SYN-LEGACY-PAYMENT", currency: "USD", amount: "5.00" } },
      headers: csrf_headers, as: :json
    assert_response :created
  end

  test "legacy patients reader retains existing appointment visibility" do
    legacy = User.create!(email_address: "legacy-schedule-reader@example.invalid", password: @password)
    membership = @practice.memberships.create!(user: legacy)
    grant_permissions!(membership, "patients.read")
    login(legacy)
    get "/api/clinic/appointments/#{@appointment.id}", headers: @headers
    assert_response :success
    assert_equal @appointment.id, response.parsed_body.dig("appointment", "id")
  end

  test "revoked atomic grant denies lookup" do
    membership = @users.fetch("front_desk").clinic_membership
    grant = permission_grant!(membership, "patients.identity.read")
    grant.update!(revoked_at: Time.current, revision: grant.revision + 1)
    get "/api/clinic/patients/lookup", headers: @headers
    assert_response :forbidden
  end

  private

  def invoice
    @invoice ||= Clinic::Billing::DraftInvoice.call(practice: @practice, actor: @users.fetch("billing_operator"), patient: @patient,
      currency: "USD", lines: [ { quantity: "1", unit_amount: "10", description_snapshot: "Synthetic administrative service" } ])
  end

  def administrative_user(label, *permissions)
    user = User.create!(email_address: "#{label}@example.invalid", password: @password)
    membership = @practice.memberships.create!(user: user)
    grant_permissions!(membership, *permissions)
    user
  end

  def appointment_payload
    {
      appointment: {
        patient_id: @patient.id,
        site_id: @site.id,
        starts_at: 3.hours.from_now.iso8601,
        ends_at: 4.hours.from_now.iso8601
      }
    }
  end

  def invoice_payload
    {
      invoice: {
        currency: "USD",
        lines: [ { quantity: "1", unit_amount: "25.00", description_snapshot: "Synthetic administrative service" } ]
      }
    }
  end

  def login(user)
    post "/api/session", params: { email_address: user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
