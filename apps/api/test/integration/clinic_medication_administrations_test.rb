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
    login(@user)
  end

  test "explicit same-site lots create one immutable clinical record and exact stock deductions" do
    key = SecureRandom.uuid
    params = administration_params(key: key, allocations: [
      { batch_id: @first_batch.id, quantity: "1.25" },
      { batch_id: @second_batch.id, quantity: "2.00" }
    ])

    assert_difference "Clinic::Care::MedicationAdministration.count", 1 do
      assert_difference "Clinic::Care::MedicationAdministrationMovement.count", 2 do
        assert_difference "Clinic::Inventory::PharmacyMovement.count", 2 do
          post_administration(params)
          assert_response :created
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
    assert_equal "Medication administration ##{administration.id}", ledger_row.dig("source", "label")
    assert_equal "/clinic/patients/#{@patient.id}/encounters/#{@encounter.id}", ledger_row.dig("source", "href")
    assert_equal "Medication Administration", ledger_row.fetch("actor_name")
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
    grant_permissions!(membership, "notes.read", scope_kind: "site", site: @site)
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
    assert_equal true, response.parsed_body.fetch("inventory_posting_available")
    choices = response.parsed_body.fetch("eligible_batches")
    assert_equal [ @first_batch.id, @second_batch.id ].sort, choices.map { |row| row.fetch("batch_id") }.sort
    assert choices.all? { |row| row.fetch("quantity_scale") == 2 }
    assert choices.all? { |row| row.fetch("stock_unit") == "mL" }
    assert_not_includes choices.map { |row| row.fetch("batch_id") }, @other_site_batch.id
    assert_not_includes choices.map { |row| row.fetch("batch_id") }, held.id
  end

  private

  def administration_params(key:, allocations:)
    {
      medication_administration: {
        product_id: @product.id,
        dose_text: "2.5 mg",
        route_text: "Intramuscular",
        administration_site_text: "Left deltoid",
        administered_at: 30.minutes.ago.iso8601(6),
        request_key: key,
        allocations: allocations
      }
    }
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
