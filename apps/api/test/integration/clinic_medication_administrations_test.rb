require "test_helper"

class ClinicMedicationAdministrationsTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @user = User.create!(email_address: "medication-administration@example.invalid", password: @password)
    @membership = Development::TestClinic.create!(@user)
    @practice = @membership.practice
    @site = @practice.sites.create!(code: "MEDS", name: "Medication clinic", status: "active")
    @other_site = @practice.sites.create!(code: "OTHER-MEDS", name: "Other clinic", status: "active")
    configure_site!(@site, membership: @membership, services: %w[prescription_preparation in_office_medications])
    @patient = @practice.patients.create!(display_name: "SYN_Medication, Avery", reference: "SYN-MEDS-001")
    @encounter = @practice.encounters.create!(patient: @patient, site: @site,
      started_at: 2.hours.ago, status: "open")
    @product = @practice.pharmacy_products.create!(
      name: "Example injectable 10 mg/mL", generic_name: "example medication", dosage_form: "solution",
      ndc: "00000-0001-01", sku: "MED-ADMIN-1", stock_unit: "mL", quantity_scale: 2,
      package_size: 1, unit_reference: "1 mL vial"
    )
    @site_bin = @practice.inventory_locations.create!(site: @site, name: "Medication room", kind: "storage")
    @site_bin_two = @practice.inventory_locations.create!(site: @site, name: "Medication cabinet", kind: "storage")
    @other_bin = @practice.inventory_locations.create!(site: @other_site, name: "Other medication room", kind: "storage")
    @first_batch = receive_batch("LOT-A", @site_bin, "4.00")
    @second_batch = receive_batch("LOT-B", @site_bin_two, "5.00")
    @other_site_batch = receive_batch("LOT-OTHER", @other_bin, "3.00")
    grant_permissions!(@membership, "clinical_records.read", "medication_requests.write",
      "medication_administrations.write", scope_kind: "site", site: @site)
    @order = authorized_order
    login(@user)
  end

  test "explicit same-site lots create one immutable clinical record and exact stock deductions" do
    key = SecureRandom.uuid
    params = administration_params(key: key, allocations: [
      { batch_id: @first_batch.id, quantity: "1.25" },
      { batch_id: @second_batch.id, quantity: "2.00" }
    ])

    assert_difference "Clinic::Care::ClinicalPlanLink.count", 1 do
      assert_difference "Clinic::Care::MedicationAdministration.count", 1 do
      assert_difference "Clinic::Care::MedicationAdministrationMovement.count", 2 do
        assert_difference "Clinic::Inventory::PharmacyMovement.count", 2 do
          post_administration(params)
          assert_response :created
        end
      end
    end
    end

    body = response.parsed_body
    administration = Clinic::Care::MedicationAdministration.find(body.dig("medication_administration", "id"))
    assert_equal false, body.fetch("replayed")
    assert_equal @patient.id, administration.patient_id
    assert_equal @encounter.id, administration.encounter_id
    assert_equal @site.id, administration.site_id
    assert_equal @membership.id, administration.administered_by_membership_id
    assert_equal @order.id, administration.medication_request_revision_id
    assert_equal "completed", administration.status
    assert_equal BigDecimal("2.5"), administration.dose_value
    assert_equal "mg", administration.dose_unit_code
    assert_equal "intramuscular", administration.route_code
    assert_equal "left_deltoid", administration.administration_site_code
    assert_equal BigDecimal("3.25"), administration.quantity
    assert_equal BigDecimal("2.75"), @first_batch.reload.quantity
    assert_equal BigDecimal("3.00"), @second_batch.reload.quantity
    assert_equal [ "1.25", "2.0" ], body.dig("medication_administration", "movements").map { |row| row.fetch("quantity") }.sort
    assert_equal [ "LOT-A", "LOT-B" ], body.dig("medication_administration", "movements").map { |row| row.fetch("lot_number") }.sort

    raw = ApplicationRecord.connection.select_one(<<~SQL)
      SELECT dose_text, route_text, medication_snapshot
      FROM clinic_medication_administrations
      WHERE id = #{administration.id}
    SQL
    assert_not_includes raw.values.join, "2.5 mg"
    assert_not_includes raw.values.join, "Intramuscular"
    assert_not_includes raw.values.join, @product.name
    stock_ciphertext = ApplicationRecord.connection.select_values(<<~SQL)
      SELECT stock_snapshot
      FROM clinic_medication_administration_movements
      WHERE medication_administration_id = #{administration.id}
    SQL
    assert stock_ciphertext.all? { |value| !value.include?("Medication room") && !value.include?("LOT-A") }
    assert_raises(ActiveRecord::StatementInvalid) do
      ApplicationRecord.transaction(requires_new: true) do
        Clinic::Care::MedicationAdministration.unscoped.where(id: administration.id).update_all(route_text: "Changed")
      end
    end

    original_name = @product.name
    @product.update_catalog!({ name: "Renamed catalog item" }, actor: @user)
    get_administrations
    assert_response :success
    assert_equal original_name, response.parsed_body.dig("administrations", 0, "product", "name")
    assert_equal "Medication room", response.parsed_body.dig("administrations", 0, "movements", 0, "location_name")

    get "/api/clinic/inventory/activity", params: { view: "ledger" }, headers: @headers
    assert_response :success
    ledger_row = response.parsed_body.dig("data", "movements").find do |row|
      row.dig("source", "kind") == "medication_administration"
    end
    assert_equal "Medication administration", ledger_row.dig("source", "label")
    assert_equal "/clinic/patients/#{@patient.id}/encounters/#{@encounter.id}", ledger_row.dig("source", "href")
    assert_equal "Medication Administration", ledger_row.fetch("actor_name")
  end

  test "not-given outcome requires a reason and never decrements stock" do
    before_quantity = @first_batch.quantity
    params = administration_params(key: SecureRandom.uuid, allocations: []).deep_dup
    params[:medication_administration] = {
      medication_request_revision_id: @order.id,
      status: "not_done",
      status_reason: "Patient declined after education",
      precheck_status: "completed",
      response_text: "No medication administered",
      education_text: "Reviewed purpose and alternatives",
      administered_at: 20.minutes.ago.iso8601(6),
      request_key: SecureRandom.uuid,
      allocations: []
    }

    assert_difference [ "Clinic::Care::MedicationAdministration.count", "Clinic::Care::ClinicalPlanLink.count" ], 1 do
      assert_no_difference [ "Clinic::Care::MedicationAdministrationMovement.count", "Clinic::Inventory::PharmacyMovement.count" ] do
        post_administration(params)
        assert_response :created
      end
    end
    outcome = Clinic::Care::MedicationAdministration.order(:id).last
    assert_equal "not_done", outcome.status
    assert_equal "Patient declined after education", outcome.status_reason
    assert_nil outcome.quantity
    assert_equal before_quantity, @first_batch.reload.quantity

    invalid = params.deep_dup
    invalid[:medication_administration][:request_key] = SecureRandom.uuid
    invalid[:medication_administration][:status_reason] = ""
    invalid[:medication_administration][:allocations] = [ { batch_id: @first_batch.id, quantity: "1.00" } ]
    assert_no_difference [ "Clinic::Care::MedicationAdministration.count", "Clinic::Inventory::PharmacyMovement.count" ] do
      post_administration(invalid)
      assert_response :unprocessable_entity
    end
  end

  test "stale authorized revisions and undocumented dose variance reject before inventory changes" do
    Clinic::Care::ClinicalPlanWorkflow.revise(
      kind: :medication_requests, series_id: @order.series_id, practice: @practice, actor: @user,
      patient: @patient, encounter: @encounter, attributes: { status: "on_hold" },
      expected_version: @order.version_number, request_key: SecureRandom.uuid
    )
    assert_no_difference [ "Clinic::Care::MedicationAdministration.count", "Clinic::Inventory::PharmacyMovement.count" ] do
      post_administration(administration_params(key: SecureRandom.uuid,
        allocations: [ { batch_id: @first_batch.id, quantity: "1.00" } ]))
      assert_response :unprocessable_entity
    end

    @order = authorized_order(name_suffix: "-variance")
    varied = administration_params(key: SecureRandom.uuid,
      allocations: [ { batch_id: @first_batch.id, quantity: "1.00" } ])
    varied[:medication_administration][:dose_value] = "3.0"
    assert_no_difference [ "Clinic::Care::MedicationAdministration.count", "Clinic::Inventory::PharmacyMovement.count" ] do
      post_administration(varied)
      assert_response :unprocessable_entity
    end
    varied[:medication_administration][:request_key] = SecureRandom.uuid
    varied[:medication_administration][:variance_reason] = "Clinician amended the one-time dose at chairside"
    post_administration(varied)
    assert_response :created
  end

  test "independent verification requires a different active clinical staff member" do
    verifier_user = User.create!(email_address: "medication-verifier@example.invalid", password: @password)
    verifier = @practice.memberships.create!(user: verifier_user)
    grant_permissions!(verifier, "medication_administrations.write", scope_kind: "site", site: @site)
    params = administration_params(key: SecureRandom.uuid,
      allocations: [ { batch_id: @first_batch.id, quantity: "1.00" } ])
    params[:medication_administration][:verification_status] = "completed"
    params[:medication_administration][:verified_by_membership_id] = @membership.id
    post_administration(params)
    assert_response :unprocessable_entity

    params[:medication_administration][:request_key] = SecureRandom.uuid
    params[:medication_administration][:verified_by_membership_id] = verifier.id
    post_administration(params)
    assert_response :created
    assert_equal verifier.id, response.parsed_body.dig("medication_administration", "verified_by_membership_id")
  end

  test "exact retry returns the same administration and changed payload conflicts without another deduction" do
    key = SecureRandom.uuid
    params = administration_params(key: key, allocations: [ { batch_id: @first_batch.id, quantity: "1.00" } ])
    post_administration(params)
    assert_response :created
    first = response.parsed_body

    assert_no_difference [ "Clinic::Care::MedicationAdministration.count", "Clinic::Inventory::PharmacyMovement.count" ] do
      post_administration(params)
      assert_response :created
    end
    assert_equal true, response.parsed_body.fetch("replayed")
    assert_equal first.dig("medication_administration", "id"), response.parsed_body.dig("medication_administration", "id")
    assert_equal BigDecimal("3.00"), @first_batch.reload.quantity

    assert_no_difference [ "Clinic::Care::MedicationAdministration.count", "Clinic::Inventory::PharmacyMovement.count" ] do
      post_administration(administration_params(key: key,
        allocations: [ { batch_id: @first_batch.id, quantity: "1.25" } ]))
      assert_response :conflict
    end
    assert_equal "idempotency_conflict", response.parsed_body.fetch("code")
    assert_equal BigDecimal("3.00"), @first_batch.reload.quantity
  end

  test "wrong-site held expired and insufficient allocations reject atomically" do
    held = receive_batch("LOT-HELD", @site_bin, "2.00")
    held.change_status!(status: "quarantined", reason: "Packaging review", actor: @user, request_key: SecureRandom.uuid)
    expired = receive_batch("LOT-EXPIRED", @site_bin, "2.00", expires_on: Date.current - 1)
    cases = [
      [ @other_site_batch, "1.00" ],
      [ held, "1.00" ],
      [ expired, "1.00" ],
      [ @first_batch, "4.01" ]
    ]

    cases.each do |batch, quantity|
      before_quantity = batch.reload.quantity
      assert_no_difference [ "Clinic::Care::MedicationAdministration.count", "Clinic::Care::MedicationAdministrationMovement.count", "Clinic::Inventory::PharmacyMovement.count" ] do
        post_administration(administration_params(key: SecureRandom.uuid,
          allocations: [ { batch_id: batch.id, quantity: quantity } ]))
        assert_response :unprocessable_entity
      end
      assert_equal before_quantity, batch.reload.quantity
    end
  end

  test "read and write permissions are enforced independently" do
    unauthorized = User.create!(email_address: "medication-read-only@example.invalid", password: @password)
    membership = @practice.memberships.create!(user: unauthorized)
    grant_permissions!(membership, "clinical_records.read", scope_kind: "site", site: @site)
    grant_permissions!(membership, "inventory.read")
    login(unauthorized)

    get_administrations
    assert_response :success
    assert_equal false, response.parsed_body.fetch("can_administer")
    assert_no_difference [ "Clinic::Care::MedicationAdministration.count", "Clinic::Inventory::PharmacyMovement.count" ] do
      post_administration(administration_params(key: SecureRandom.uuid,
        allocations: [ { batch_id: @first_batch.id, quantity: "1.00" } ]))
      assert_response :forbidden
    end
  end

  test "eligible choices expose exact precision and only usable encounter-site medication batches" do
    held = receive_batch("LOT-NOT-ELIGIBLE", @site_bin, "1.00")
    held.change_status!(status: "quarantined", reason: "Inventory review", actor: @user, request_key: SecureRandom.uuid)

    get_administrations
    assert_response :success
    assert_equal true, response.parsed_body.fetch("can_administer")
    assert_equal true, response.parsed_body.fetch("can_record_outcome")
    assert_equal true, response.parsed_body.fetch("inventory_posting_available")
    choices = response.parsed_body.fetch("eligible_batches")
    assert_equal [ @first_batch.id, @second_batch.id ].sort, choices.map { |row| row.fetch("batch_id") }.sort
    assert choices.all? { |row| row.fetch("quantity_scale") == 2 }
    assert choices.all? { |row| row.fetch("stock_unit") == "mL" }
    assert_not_includes choices.map { |row| row.fetch("batch_id") }, @other_site_batch.id
    assert_not_includes choices.map { |row| row.fetch("batch_id") }, held.id
    assert_equal [ @order.id ], response.parsed_body.fetch("eligible_orders").map { |row| row.fetch("id") }
    assert_equal @membership.id, response.parsed_body.dig("eligible_orders", 0, "ordered_by_membership_id")
  end

  test "site-scoped medication permission lets clinical staff record without broad note or inventory authority" do
    nurse = User.create!(email_address: "medication-nurse@example.invalid", password: @password)
    membership = @practice.memberships.create!(user: nurse)
    grant_permissions!(membership, "clinical_records.read", "medication_administrations.write",
      scope_kind: "site", site: @site)
    ability = Ability.new(nurse, practice: @practice)
    assert_not ability.allowed_permission?("notes.write", site: @site)
    assert_not ability.allowed_permission?("inventory.adjust")
    assert_raises(ArgumentError) do
      Clinic::Inventory::Access.with(@practice.id, nurse, "adjust") { flunk "must not authorize direct adjustment" }
    end
    login(nurse)

    get_administrations
    assert_response :success
    assert_equal true, response.parsed_body.fetch("can_record_outcome")
    assert_equal true, response.parsed_body.fetch("can_administer")
    assert_equal [ @first_batch.id, @second_batch.id ].sort,
      response.parsed_body.fetch("eligible_batches").map { |row| row.fetch("batch_id") }.sort

    assert_difference [ "Clinic::Care::MedicationAdministration.count", "Clinic::Inventory::PharmacyMovement.count" ], 1 do
      post_administration(administration_params(key: SecureRandom.uuid,
        allocations: [ { batch_id: @first_batch.id, quantity: "1.00" } ]))
      assert_response :created
    end
  end

  private

  def administration_params(key:, allocations:)
    {
      medication_administration: {
        medication_request_revision_id: @order.id,
        status: "completed",
        dose_value: "2.5",
        dose_unit_code: "mg",
        route_code: "intramuscular",
        administration_site_code: "left_deltoid",
        precheck_status: "completed",
        verification_status: "not_required",
        response_text: "Tolerated without immediate reaction",
        education_text: "Reviewed expected response",
        administered_at: 30.minutes.ago.iso8601(6),
        request_key: key,
        allocations: allocations
      }
    }
  end

  def authorized_order(name_suffix: "")
    draft = Clinic::Care::ClinicalPlanWorkflow.create(
      kind: :medication_requests, practice: @practice, actor: @user, patient: @patient, encounter: @encounter,
      attributes: {
        intent: "order", inventory_product_id: @product.id,
        medication_name: "Example injectable#{name_suffix}", dose_value: "2.5", dose_unit_code: "mg",
        route_code: "intramuscular", frequency_text: "once", scheduled_for: 30.minutes.ago,
        reason_text: "Synthetic in-office treatment"
      },
      request_key: SecureRandom.uuid
    )
    Clinic::Care::ClinicalPlanWorkflow.revise(
      kind: :medication_requests, series_id: draft.series_id, practice: @practice, actor: @user,
      patient: @patient, encounter: @encounter, attributes: { status: "authorized" },
      expected_version: draft.version_number, request_key: SecureRandom.uuid
    )
  end

  def receive_batch(lot_number, location, quantity, expires_on: Date.current + 90)
    Clinic::Inventory::Receiving.call(
      practice: @practice,
      actor: @user,
      supplier: "Example supplier",
      reason: "Medication delivery",
      request_key: SecureRandom.uuid,
      lines: [ {
        product_id: @product.id,
        lot_number: lot_number,
        location_id: location.id,
        location: location.name,
        expires_on: expires_on.iso8601,
        amount: quantity,
        input_unit: @product.stock_unit
      } ]
    ).lines.sole.batch
  end

  def post_administration(params)
    post "/api/clinic/encounters/#{@encounter.id}/medication_administrations",
      params: params, headers: csrf_headers, as: :json
  end

  def get_administrations
    get "/api/clinic/encounters/#{@encounter.id}/medication_administrations", headers: @headers
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def login(user)
    post "/api/session", params: { email_address: user.email_address, password: @password },
      headers: csrf_headers, as: :json
    assert_response :success
  end
end
