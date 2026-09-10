require "test_helper"

class ClinicVitalSignsTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Vital Signs Test Organization")
    @practice = Clinic::Practice.create!(name: "Vital Signs Test Practice", organization: organization, timezone: "UTC")
    @user = User.create!(email_address: "vital-signs@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @user)
    @site = @practice.sites.create!(code: "VITALS")
    @other_site = @practice.sites.create!(code: "OTHER")
    grant_permissions!(@membership, "patients.read")
    grant_permissions!(@membership, "observations.write", scope_kind: "site", site: @site)
    @patient = @practice.patients.create!(display_name: "Rowan, Avery", reference: "VITALS-001")
    @other_patient = @practice.patients.create!(display_name: "Rowan, Blair", reference: "VITALS-002")
    @encounter = @practice.encounters.create!(
      patient: @patient, site: @site, started_at: Time.utc(2026, 9, 7, 14), status: "open"
    )
    @other_site_encounter = @practice.encounters.create!(
      patient: @patient, site: @other_site, started_at: Time.utc(2026, 9, 7, 15), status: "open"
    )
    @other_patient_encounter = @practice.encounters.create!(
      patient: @other_patient, site: @site, started_at: Time.utc(2026, 9, 7, 16), status: "open"
    )
    login
  end

  test "dictionary and atomic batch create grouped observations with exact units and one audit" do
    get vital_signs_path, headers: @headers

    assert_response :success
    dictionary = response.parsed_body
    assert_equal [ @encounter.id, "2", "urn:apply:vital-signs", true ],
      dictionary.values_at("encounter_id", "dictionary_version", "code_system", "can_write")
    assert_equal 9, dictionary.fetch("fields").length
    assert_equal %w[vital-systolic-bp vital-diastolic-bp],
      dictionary.fetch("fields").select { |field| field["group"] == "blood_pressure" }.map { |field| field.fetch("code") }
    assert @practice.audit_events.where(action_code: "patients.read", outcome: "released").exists?

    post vital_signs_path, params: batch_params(request_key: "vitals-atomic"), headers: csrf_headers, as: :json

    assert_response :created
    observations = response.parsed_body.fetch("observations")
    assert_equal %w[vital-signs vital-blood-pressure vital-systolic-bp vital-diastolic-bp vital-heart-rate vital-temperature vital-weight],
      observations.map { |observation| observation.fetch("code") }
    assert_equal %w[group group numeric numeric numeric numeric numeric], observations.map { |observation| observation.fetch("value_kind") }
    root, pressure, systolic, diastolic, heart_rate, temperature, weight = observations
    assert_nil root.fetch("parent_observation_id")
    assert_equal root.fetch("id"), pressure.fetch("parent_observation_id")
    assert_equal [ pressure.fetch("id") ] * 2,
      [ systolic.fetch("parent_observation_id"), diastolic.fetch("parent_observation_id") ]
    assert_equal [ root.fetch("id") ] * 3,
      [ heart_rate.fetch("parent_observation_id"), temperature.fetch("parent_observation_id"), weight.fetch("parent_observation_id") ]
    assert_equal [ "mm[Hg]", "mm[Hg]", "/min", "[degF]", "[lb_av]" ],
      [ systolic, diastolic, heart_rate, temperature, weight ].map { |observation| observation.fetch("unit_code") }
    assert_equal [ "Systolic blood pressure", "Diastolic blood pressure", "Heart rate", "Temperature", "Weight" ],
      [ systolic, diastolic, heart_rate, temperature, weight ].map { |observation| observation.fetch("display_label") }
    assert_equal [ "mmHg", "mmHg", "beats/min", "°F", "lb" ],
      [ systolic, diastolic, heart_rate, temperature, weight ].map { |observation| observation.fetch("unit_label") }
    assert_not root.key?("display_label")
    assert_not pressure.key?("display_label")
    assert_equal 1, observations.map { |observation| observation.fetch("recorded_at") }.uniq.length
    assert observations.all? { |observation| observation.fetch("code_system") == "urn:apply:vital-signs" }
    assert observations.all? { |observation| observation.fetch("code_version") == "2" }
    assert_equal 7, @patient.observations.where(encounter: @encounter).count
    receipt = Clinic::OperationReceipt.find_by!(practice: @practice, request_key: "vitals-atomic")
    assert_equal [ "Clinic::Care::Observation", root.fetch("id") ], [ receipt.resource_type, receipt.resource_id ]
    assert_equal 1, @practice.audit_events.where(action_code: "vital_signs.create", outcome: "committed").count
  end

  test "invalid dictionary units duplicates and partial blood pressure leave no collection" do
    invalid = [
      batch_params(request_key: "vitals-partial", readings: [ reading("vital-systolic-bp", "120", "mm[Hg]") ]),
      batch_params(request_key: "vitals-duplicate", readings: [
        reading("vital-heart-rate", "70", "/min"), reading("vital-heart-rate", "71", "/min")
      ]),
      batch_params(request_key: "vitals-unit", readings: [ reading("vital-weight", "180", "lb") ])
    ]
    invalid.each do |parameters|
      post vital_signs_path, params: parameters, headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
    end

    post vital_signs_path,
      params: batch_params(request_key: "vitals-version", dictionary_version: "1"),
      headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "stale_dictionary", response.parsed_body.fetch("code")
    assert_empty @patient.observations.where(encounter: @encounter)
    assert_empty Clinic::OperationReceipt.where(practice: @practice, request_key: %w[vitals-partial vitals-duplicate vitals-unit vitals-version])
  end

  test "site patient encounter and tenant boundaries are enforced" do
    get vital_signs_path(encounter: @other_site_encounter), headers: @headers
    assert_response :success
    assert_equal false, response.parsed_body.fetch("can_write")

    post vital_signs_path(encounter: @other_site_encounter),
      params: batch_params(request_key: "vitals-wrong-site"), headers: csrf_headers, as: :json
    assert_response :forbidden

    post vital_signs_path(encounter: @other_patient_encounter),
      params: batch_params(request_key: "vitals-wrong-patient"), headers: csrf_headers, as: :json
    assert_response :not_found

    foreign_practice = Clinic::Practice.create!(name: "Foreign Vital Signs Practice")
    foreign_patient = foreign_practice.patients.create!(display_name: "Morgan, Casey", reference: "VITALS-FOREIGN")
    foreign_encounter = foreign_practice.encounters.create!(patient: foreign_patient, started_at: Time.current, status: "open")
    post vital_signs_path(patient: foreign_patient, encounter: foreign_encounter),
      params: batch_params(request_key: "vitals-wrong-tenant"), headers: csrf_headers, as: :json
    assert_response :not_found

    assert_empty @patient.observations.where(encounter: @other_site_encounter)
    assert_empty @other_patient.observations
    assert_empty foreign_patient.observations
  end

  test "an audit failure rolls back the whole batch and receipt" do
    original_record = Clinic::AuditRecorder.method(:record!)
    Clinic::AuditRecorder.define_singleton_method(:record!) do |practice:, actor:, action_code:, **arguments|
      raise Clinic::AuditRecorder::Unavailable if action_code == Clinic::Care::VitalSigns::OPERATION_CODE

      original_record.call(practice:, actor:, action_code:, **arguments)
    end

    post vital_signs_path,
      params: batch_params(request_key: "vitals-audit-failure"), headers: csrf_headers, as: :json

    assert_response :service_unavailable
    assert_equal "audit_unavailable", response.parsed_body.fetch("code")
    assert_empty @patient.observations.where(encounter: @encounter)
    assert_not Clinic::OperationReceipt.exists?(practice: @practice, request_key: "vitals-audit-failure")
  ensure
    Clinic::AuditRecorder.define_singleton_method(:record!, original_record) if original_record
  end

  test "an identical replay after close returns the original collection while changes conflict" do
    parameters = batch_params(request_key: "vitals-close-replay")
    post vital_signs_path, params: parameters, headers: csrf_headers, as: :json
    assert_response :created
    original = response.parsed_body.fetch("observations")
    @encounter.update!(status: "completed", ended_at: @encounter.started_at + 1.hour)

    post vital_signs_path, params: parameters, headers: csrf_headers, as: :json
    assert_response :created
    assert_equal original, response.parsed_body.fetch("observations")

    changed = batch_params(
      request_key: "vitals-close-replay",
      readings: default_readings.map { |item| item[:code] == "vital-heart-rate" ? item.merge(value: "73") : item }
    )
    post vital_signs_path, params: changed, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "idempotency_conflict", response.parsed_body.fetch("code")

    post vital_signs_path,
      params: batch_params(request_key: "vitals-after-close"), headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal original.length, @patient.observations.where(encounter: @encounter).count
  end

  test "height and weight derive BMI while invalid height and pain leave no partial collection" do
    readings = [
      reading("vital-weight", "70", "kg"),
      reading("vital-height", "175", "cm"),
      reading("vital-pain-score", "4", "{score}")
    ]
    post vital_signs_path, params: batch_params(request_key: "vitals-bmi", readings:),
      headers: csrf_headers, as: :json
    assert_response :created
    values = response.parsed_body.fetch("observations").index_by { |observation| observation.fetch("code") }
    assert_equal [ "70.0", "175.0", "4.0", "22.9" ],
      %w[vital-weight vital-height vital-pain-score vital-bmi].map { |code| values.fetch(code).fetch("numeric_value") }
    assert_equal "kg/m2", values.fetch("vital-bmi").fetch("unit_code")
    assert_equal values.fetch("vital-signs").fetch("id"), values.fetch("vital-bmi").fetch("parent_observation_id")

    other_encounter = @practice.encounters.create!(
      patient: @patient, site: @site, started_at: Time.utc(2026, 9, 7, 17), status: "open"
    )
    invalid = [
      batch_params(request_key: "vitals-zero-height", readings: [ reading("vital-height", "0", "cm") ]),
      batch_params(request_key: "vitals-pain-out-of-range", readings: [ reading("vital-pain-score", "11", "{score}") ])
    ]
    invalid.each do |parameters|
      post vital_signs_path(encounter: other_encounter), params: parameters, headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
    end
    assert_empty @patient.observations.where(encounter: other_encounter)
  end

  private

  def vital_signs_path(patient: @patient, encounter: @encounter)
    "/api/clinic/patients/#{patient.id}/encounters/#{encounter.id}/vital_signs"
  end

  def batch_params(request_key:, readings: default_readings, dictionary_version: "2")
    {
      vital_signs: {
        request_key:, dictionary_version:, observed_at: "2026-09-07T14:10:00Z",
        confirmed_patient: true, readings:
      }
    }
  end

  def default_readings
    [
      reading("vital-systolic-bp", "120.00", "mm[Hg]"),
      reading("vital-diastolic-bp", "78", "mm[Hg]"),
      reading("vital-heart-rate", "72", "/min"),
      reading("vital-temperature", "98.6", "[degF]"),
      reading("vital-weight", "180.5", "[lb_av]")
    ]
  end

  def reading(code, value, unit_code)
    { code:, value:, unit_code: }
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def login
    post "/api/session", params: { email_address: @user.email_address, password: @password },
      headers: csrf_headers, as: :json
    assert_response :success
  end
end
