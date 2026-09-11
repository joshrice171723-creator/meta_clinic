# Loaded by rails runner in a disposable test database. One transaction per generated case.
require "json"
require "action_dispatch/testing/integration"
require Rails.root.join("test/support/authorization_helpers")

abort "Scratch test database required" unless Rails.env.test? &&
  ApplicationRecord.connection_db_config.database.match?(/\Aapply_properties_[0-9a-f]{12}\z/)
Rails.logger = Logger.new(File::NULL)
ActiveRecord::Base.logger = Rails.logger
$stdout.sync = true

class WorkflowPropertyCase
  include AuthorizationHelpers

  def initialize
    warn "Property bridge: creating isolated authenticated fixture"
    ApplicationRecord.transaction do
    @password = SecureRandom.hex(18)
    @actor = User.create!(email_address: "property-#{SecureRandom.hex(8)}@example.invalid", password: @password)
    @practice = Clinic::Practice.create!(name: "Property clinic")
    @membership = Clinic::Membership.create!(practice: @practice, user: @actor)
    grant_permissions!(@membership, "patients.read", "patients.write", "facilities.read", "facilities.write", "notes.read", "notes.write", "notes.sign", "encounters.write", "observations.write", "service_requests.write", "medication_requests.write", "medication_administrations.write", "appointments.read", "appointments.book", "appointments.status_transition", "inventory.read", "inventory.receive", "inventory.adjust", "billing.invoice_draft", "billing.invoice_post", "billing.payment_record")
    grant_permissions!(@membership, "encounters.assign_provider", "staff_messaging.attach", "staff_messaging.acknowledge", "staff_messaging.read", "documents.read", "roles.manage")
    end
    warn "Property bridge: fixture committed; checking login"
    @session = ActionDispatch::Integration::Session.new(Rails.application)
    @session.host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    response = request(:post, "/api/session", { email_address: @actor.email_address, password: @password })
    raise "Test login failed with #{response[:status]}" unless [200, 201].include?(response[:status])
  end

  def facility(input)
    payload = { code: "PROP", name: "Property clinic", status: "active", address_line1: "1 Example Way", city: "Example", state: "TX", postal_code: "75000", country: "US" }.stringify_keys
    before = @practice.sites.count
    created = request(:post, "/api/clinic/facilities", { site: payload.merge(input.fetch("create", {})) })
    result = { status: created[:status], created: @practice.sites.count - before }
    if input["edit"] && created[:status] == 201
      record = @practice.sites.find(created[:body].fetch("id"))
      edited = request(:patch, "/api/clinic/facilities/#{record.id}", { site: input["edit"] })
      result.merge!(edit_status: edited[:status], name: record.reload.name, hours: record.operating_hours.count)
    end
    result
  end

  # Model-level contracts exercise actual ActiveRecord validation. They do not
  # establish controller, form, authorization, or complete workflow coverage.
  def model(input)
    name = input.fetch("model")
    constructors = {
      "visit_type" => -> { @practice.visit_types.new(code: "Example visit") },
      "billing_service" => -> { Clinic::BillingService.new(practice: @practice, name: "Example service", unit_amount: 25, currency: "USD", active: true, lock_version: 0) },
      "membership_package" => -> { Clinic::Care::SubscriptionPackage.new(practice: @practice, family: Clinic::Care::SubscriptionFamily.create!(practice: @practice, name: "Example family", description: "Example", display_order: 0), name: "Example membership") },
      "office_item" => -> { @practice.items.new(name: "Example paper", sku: "PROP-OFFICE", quantity: 0, reorder_level: 0) },
      "purchase_order" => -> { Clinic::Inventory::PurchaseOrder.new(practice: @practice, actor: @actor, number: "PROP-001", destination: "Example clinic", reason: "Replenishment", request_key: SecureRandom.uuid, payload_digest: "a" * 64, status: "draft") },
      "schedule" => -> { Clinic::Workforce::ScheduleDraft.new(practice: @practice, site: @practice.sites.create!(code: "PROP", name: "Property clinic"), created_by: @membership, week_start_on: Date.new(2026,9,7), timezone: "America/Chicago", status: "draft", revision: 1) },
      "care_need" => -> { Clinic::Care::PatientCareNeed.new(practice: @practice, patient: @practice.patients.create!(display_name: "Property Patient", reference: "PROPERTY-001"), recorded_by_membership: @membership, category: "communication", need_code: "spoken_language_interpreter", description: "Interpreter requested", status: "active", effective_from: Time.current, recorded_at: Time.current, lock_version: 0) },
      "staff" => -> { @practice.staff_members.new(display_name: "Example Staff", job_title: "Coordinator") },
      "employment" => -> { Clinic::Workforce::Employment.new(practice: @practice, membership: @membership, staff_member: @practice.staff_members.create!(display_name: "Example Staff", job_title: "Coordinator"), effective_from: Time.current, status: "active") },
      "drawer" => -> { Clinic::CashDrawerSession.new(practice: @practice, site: @practice.sites.create!(code: "PROP", name: "Property clinic"), opened_by: @actor, opening_float: 0, status: "open", reconciliation_status: "pending") },
      "supplier" => -> { Clinic::Inventory::Supplier.new(practice: @practice, name: "Example supplier") },
      "location" => -> { Clinic::Inventory::Location.new(practice: @practice, name: "Example bin", kind: "storage", status: "active") },
      "product" => -> { Clinic::Inventory::PharmacyProduct.new(practice: @practice, name: "Example product", sku: "PROP", stock_unit: "mL", quantity_scale: 2, package_size: 1) },
      "appointment" => -> { @practice.appointments.new(patient: @practice.patients.create!(display_name: "Property Patient", reference: "PROPERTY-001"), starts_at: 1.hour.from_now, ends_at: 2.hours.from_now, status: "scheduled") },
      "encounter" => -> { @practice.encounters.new(patient: @practice.patients.create!(display_name: "Property Patient", reference: "PROPERTY-001"), started_at: 1.hour.ago, status: "open") },
      "lab_report" => -> { Clinic::Care::LabReport.new(practice: @practice, patient: @practice.patients.create!(display_name: "Property Patient", reference: "PROPERTY-001"), source_name: "Example laboratory") },
      "observation" => -> { Clinic::Care::Observation.new(practice: @practice, patient: @practice.patients.create!(display_name: "Property Patient", reference: "PROPERTY-001"), author_membership: @membership, code: "8867-4", code_system: "http://loinc.org", code_version: "2.78", value_kind: "numeric", numeric_value: 72, unit_code: "/min", observed_at: 1.minute.ago, recorded_at: Time.current) }
    }
    record = constructors.fetch(name).call
    raise "Invalid baseline #{name}: #{record.errors.full_messages.join(', ')}" unless record.valid?
    input.fetch("attributes").each { |field, value| record.public_send("#{field}=", value) }
    valid = record.valid?
    { valid: valid, errors: record.errors.attribute_names.map(&:to_s) }
  end

  def scribe(input)
    record = Clinic::Scribe::Encounter.new(consent_status: input.fetch("consent"), deleted_at: input["deleted"] ? Time.current : nil,
      consent_withdrawn_at: input["withdrawn"] ? Time.current : nil)
    { allowed: record.processing_allowed? }
  end

  def location_delete(input)
    record = @practice.inventory_locations.create!(name: "Property bin #{input.fetch('suffix')}", kind: "storage", status: "active")
    destroyed = record.destroy
    { destroyed: !!destroyed, remaining: Clinic::Inventory::Location.exists?(record.id) }
  end

  def request(method, path, body)
    ActiveSupport::ExecutionContext.clear
    @session.get "/api/csrf", headers: @headers
    token = @session.response.parsed_body.fetch("csrf_token")
    @session.public_send(method, path, params: body, as: :json, headers: @headers.merge("X-CSRF-Token" => token))
    { status: @session.response.status, body: @session.response.parsed_body }
  end

  def patient(input)
    payload = { "display_name" => "Property Patient", "reference" => "PROPERTY-001", "sex" => "female", "date_of_birth" => "1990-01-02" }.merge(input.fetch("create", {}))
    before = @practice.patients.count
    created = request(:post, "/api/clinic/patients", { clinic_patient: payload })
    result = { status: created[:status], created: @practice.patients.count - before }
    return result unless created[:status] == 201
    record = @practice.patients.find(created[:body].fetch("id"))
    result[:sex] = record.demographics.sex
    if input["edit"]
      edited = request(:patch, "/api/clinic/patients/#{record.id}", { clinic_patient: input["edit"] })
      record.reload
      result.merge!(edit_status: edited[:status], name: record.display_name, dob: record.demographics.reload.date_of_birth&.iso8601,
        sex: record.demographics.sex, contacts: record.contacts.count)
    end
    if input["delete"]
      deleted = request(:delete, "/api/clinic/patients/#{record.id}", {})
      result.merge!(delete_status: deleted[:status], remaining: @practice.patients.exists?(record.id))
    end
    result
  end

  def stock(input)
    site = @practice.sites.create!(name: "Property clinic", code: "PROP", status: "active")
    patient = @practice.patients.create!(display_name: "Property Patient", reference: "PROPERTY-001")
    encounter = @practice.encounters.create!(patient: patient, site: site, status: "open", started_at: 1.hour.ago)
    product = @practice.pharmacy_products.create!(name: "Example medication", generic_name: "example", dosage_form: "solution",
      ndc: "00000-0001-01", sku: "PROP-MED", stock_unit: "mL", quantity_scale: 2, package_size: 1, unit_reference: "1 mL vial")
    location = @practice.inventory_locations.create!(site: site, name: "Property bin", kind: "storage")
    order = Clinic::Care::ClinicalPlanWorkflow.create(
      kind: :medication_requests, practice: @practice, actor: @actor, patient: patient, encounter: encounter,
      attributes: { intent: "order", inventory_product_id: product.id, medication_name: "Example medication",
        dose_value: "1", dose_unit_code: "mL", route_code: "intravenous", frequency_text: "once",
        scheduled_for: 30.minutes.ago, reason_text: "Synthetic property workflow" }, request_key: SecureRandom.uuid
    )
    order = Clinic::Care::ClinicalPlanWorkflow.revise(
      kind: :medication_requests, series_id: order.series_id, practice: @practice, actor: @actor,
      patient: patient, encounter: encounter, attributes: { status: "authorized" },
      expected_version: order.version_number, request_key: SecureRandom.uuid
    )
    batch = Clinic::Inventory::Receiving.call(practice: @practice, actor: @actor, supplier: "Example supplier", reason: "Property receipt",
      request_key: SecureRandom.uuid, lines: [{ product_id: product.id, lot_number: "PROP-LOT", location_id: location.id,
        location: location.name, expires_on: (Date.current + 90).iso8601, amount: input.fetch("received"), input_unit: "mL" }]).lines.sole.batch
    before_movements = Clinic::Inventory::PharmacyMovement.count
    params = { medication_request_revision_id: order.id, status: "completed", dose_value: "1", dose_unit_code: "mL",
      route_code: "intravenous", administration_site_code: "left_deltoid", precheck_status: "completed",
      verification_status: "not_required", response_text: "Property administration", education_text: "Property education",
      administered_at: 30.minutes.ago.iso8601(6), request_key: SecureRandom.uuid,
      allocations: [{ batch_id: batch.id, quantity: input.fetch("used") }] }
    path = "/api/clinic/encounters/#{encounter.id}/medication_administrations"
    first = request(:post, path, { medication_administration: params })
    replay = input["retry"] ? request(:post, path, { medication_administration: params }) : nil
    changed = input["changed"] ? request(:post, path, { medication_administration: params.merge(dose_value: "2") }) : nil
    { status: first[:status], retry_status: replay&.dig(:status), replayed: replay&.dig(:body, "replayed"), changed_status: changed&.dig(:status),
      quantity: batch.reload.quantity.to_s("F"), movements: Clinic::Inventory::PharmacyMovement.count - before_movements,
      administrations: Clinic::Care::MedicationAdministration.where(encounter: encounter).count }
  end

  def payment(input)
    patient = @practice.patients.create!(display_name: "Property Patient", reference: "PROPERTY-001")
    invoice = Clinic::Billing::DraftInvoice.call(practice: @practice, actor: @actor, patient: patient, currency: "USD",
      lines: [{ quantity: "1", unit_amount: input.fetch("charge"), description_snapshot: "Example visit" }], request_key: SecureRandom.uuid)
    Clinic::Billing::PostInvoice.call(invoice: invoice, actor: @actor, request_key: SecureRandom.uuid)
    reference = SecureRandom.uuid
    params = { practice: @practice, actor: @actor, patient: patient, invoice: invoice,
      external_event_reference: reference, currency: "USD", amount: input.fetch("paid") }
    error = nil
    begin
      Clinic::Billing::AllocatePayment.call(**params)
      Clinic::Billing::AllocatePayment.call(**params) if input["retry"]
    rescue ArgumentError => e
      error = e.class.name
    end
    { error: error, allocations: invoice.payment_allocations.count, allocated: invoice.payment_allocations.sum(:amount).to_s("F"),
      payments: Clinic::PaymentEvent.where(practice: @practice).count }
  end
end

Dir[File.join(__dir__, "extensions", "*.rb")].sort.each { |path| require path }
test_case = WorkflowPropertyCase.new
puts JSON.generate(ready: true)
property_case_count = 0
$stdin.each_line do |line|
  input = JSON.parse(line)
  result = nil
  begin
    ApplicationRecord.transaction(requires_new: true, joinable: false) do
      result = test_case.public_send(input.fetch("kind"), input.fetch("input"))
      raise ActiveRecord::Rollback
    end
    puts JSON.generate(result: result)
  rescue StandardError => e
    puts JSON.generate(error: e.class.name, message: e.message.to_s[0, 300], backtrace: e.backtrace&.first(12))
  ensure
    property_case_count += 1
    warn "Property bridge completed #{property_case_count} generated cases (#{input['kind']})" if property_case_count % 10 == 0
    ActiveSupport::ExecutionContext.clear
  end
end
