require "test_helper"

class ClinicObservationEncryptionTest < ActiveSupport::TestCase
  test "typed values and units are encrypted while the legacy columns remain empty" do
    practice = Clinic::Practice.create!(name: "Synthetic Observation Practice", timezone: "UTC")
    patient = practice.patients.create!(display_name: "Synthetic Observation Patient", reference: "OBS-ENCRYPTED")
    user = User.create!(email_address: "observation-encryption@example.invalid", password: SecureRandom.hex(18))
    membership = practice.memberships.create!(user: user)

    observation = patient.observations.create!(
      practice: practice,
      author_membership: membership,
      code: "synthetic-height",
      code_system: "synthetic",
      code_version: "1",
      value_kind: "numeric",
      numeric_value: "001.2300",
      unit_code: "cm",
      observed_at: Time.current,
      recorded_at: Time.current
    )

    raw = Clinic::Care::Observation.connection.select_one(
      "SELECT encrypted_value, numeric_value, text_value, coded_value, unit_code, missing_reason FROM clinic_observations WHERE id = #{observation.id}"
    )

    reloaded = Clinic::Care::Observation.find(observation.id)
    assert_equal "001.2300", reloaded.numeric_value
    assert_equal "cm", reloaded.unit_code
    assert raw.fetch("encrypted_value").present?
    assert_not_equal "001.2300", raw.fetch("encrypted_value")
    assert_not_equal "cm", raw.fetch("encrypted_value")
    assert raw.values_at("numeric_value", "text_value", "coded_value", "unit_code", "missing_reason").all?(&:nil?)

    version = observation.versions.last
    assert_includes version.changed_fields, "encrypted_value"
    assert_not_includes version.changed_fields, "numeric_value"
    assert_not_includes version.attributes.to_json, "001.2300"
    assert_not_includes version.attributes.to_json, "cm"
  end

  test "all non-group value kinds round-trip without legacy scalar storage" do
    practice = Clinic::Practice.create!(name: "Synthetic Value Kind Practice", timezone: "UTC")
    patient = practice.patients.create!(display_name: "Synthetic Value Kind Patient", reference: "OBS-KINDS")
    user = User.create!(email_address: "observation-kinds@example.invalid", password: SecureRandom.hex(18))
    membership = practice.memberships.create!(user: user)
    values = {
      "numeric" => { numeric_value: "12.3400", unit_code: "cm" },
      "text" => { text_value: "synthetic text" },
      "coded" => { coded_value: "synthetic-code" },
      "missing" => { missing_reason: "synthetic unavailable" },
      "group" => {}
    }

    values.each_with_index do |(kind, value), index|
      observation = patient.observations.create!(
        practice: practice, author_membership: membership, code: "synthetic-kind-#{index}", code_system: "synthetic", code_version: "1",
        value_kind: kind, observed_at: Time.current, recorded_at: Time.current, **value
      )
      persisted = Clinic::Care::Observation.find(observation.id)
      raw = Clinic::Care::Observation.connection.select_one(
        "SELECT encrypted_value, numeric_value, text_value, coded_value, unit_code, missing_reason FROM clinic_observations WHERE id = #{observation.id}"
      )

      { numeric_value: persisted.numeric_value, text_value: persisted.text_value, coded_value: persisted.coded_value,
        unit_code: persisted.unit_code, missing_reason: persisted.missing_reason }.each do |attribute, actual|
        if value.key?(attribute)
          assert_equal value.fetch(attribute), actual
        else
          assert_nil actual
        end
      end
      assert_equal kind != "group", raw.fetch("encrypted_value").present?
      assert raw.values_at("numeric_value", "text_value", "coded_value", "unit_code", "missing_reason").all?(&:nil?)
    end
  end

  test "ciphertext transplanted to another observation is unavailable" do
    practice = Clinic::Practice.create!(name: "Synthetic Binding Practice", timezone: "UTC")
    patient_one = practice.patients.create!(display_name: "Synthetic Binding Patient One", reference: "OBS-BIND-1")
    patient_two = practice.patients.create!(display_name: "Synthetic Binding Patient Two", reference: "OBS-BIND-2")
    user = User.create!(email_address: "observation-binding@example.invalid", password: SecureRandom.hex(18))
    membership = practice.memberships.create!(user: user)
    attributes = { practice: practice, author_membership: membership, code_system: "synthetic", code_version: "1", value_kind: "text", text_value: "synthetic protected text", observed_at: Time.current, recorded_at: Time.current }
    source = patient_one.observations.create!(**attributes, code: "source")
    target = patient_two.observations.create!(**attributes, code: "target")
    ciphertext = Clinic::Care::Observation.connection.select_value("SELECT encrypted_value FROM clinic_observations WHERE id = #{source.id}")
    id_bind = ActiveRecord::Relation::QueryAttribute.new("id", target.id, ActiveRecord::Type::Integer.new)
    value_bind = ActiveRecord::Relation::QueryAttribute.new("encrypted_value", ciphertext, ActiveRecord::Type::String.new)
    Clinic::Care::Observation.connection.exec_update(
      "UPDATE clinic_observations SET encrypted_value = $1 WHERE id = $2", "Synthetic ciphertext transplant", [ value_bind, id_bind ]
    )

    assert_raises(ArgumentError) { Clinic::Care::Observation.find(target.id).text_value }
  end

  test "an unsupported encrypted value version is unavailable" do
    practice = Clinic::Practice.create!(name: "Synthetic Version Practice", timezone: "UTC")
    patient = practice.patients.create!(display_name: "Synthetic Version Patient", reference: "OBS-VERSION")
    user = User.create!(email_address: "observation-version@example.invalid", password: SecureRandom.hex(18))
    membership = practice.memberships.create!(user: user)
    observation = patient.observations.create!(
      practice: practice, author_membership: membership, code: "synthetic-version", code_system: "synthetic",
      code_version: "1", value_kind: "text", text_value: "synthetic protected text", observed_at: Time.current,
      recorded_at: Time.current
    )
    payload = {
      "version" => 2,
      "practice_id" => practice.id,
      "patient_id" => patient.id,
      "encounter_id" => nil,
      "value_binding_id" => observation.value_binding_id,
      "value" => { "numeric_value" => nil, "text_value" => "synthetic protected text", "coded_value" => nil,
        "unit_code" => nil, "missing_reason" => nil }
    }
    observation.encrypted_value = JSON.generate(payload)
    observation.save!(validate: false)

    assert_raises(ArgumentError) { Clinic::Care::Observation.find(observation.id).text_value }
  end

  test "a partial typed-value update preserves the other value fields" do
    practice = Clinic::Practice.create!(name: "Synthetic Partial Observation Practice", timezone: "UTC")
    patient = practice.patients.create!(display_name: "Synthetic Partial Observation Patient", reference: "OBS-PARTIAL")
    user = User.create!(email_address: "observation-partial@example.invalid", password: SecureRandom.hex(18))
    membership = practice.memberships.create!(user: user)
    observation = patient.observations.create!(
      practice: practice, author_membership: membership, code: "synthetic-height", code_system: "synthetic", code_version: "1",
      value_kind: "numeric", numeric_value: "001.2300", unit_code: "cm", observed_at: Time.current, recorded_at: Time.current
    )

    observation.numeric_value = "002.3400"
    observation.save!

    persisted = Clinic::Care::Observation.find(observation.id)
    assert_equal "002.3400", persisted.numeric_value
    assert_equal "cm", persisted.unit_code
    assert Clinic::Care::Observation.connection.select_value("SELECT numeric_value FROM clinic_observations WHERE id = #{observation.id}").nil?
  end

  test "mixed value kinds are rejected instead of silently dropping protected input" do
    practice = Clinic::Practice.create!(name: "Synthetic Mixed Observation Practice", timezone: "UTC")
    patient = practice.patients.create!(display_name: "Synthetic Mixed Observation Patient", reference: "OBS-MIXED")
    user = User.create!(email_address: "observation-mixed@example.invalid", password: SecureRandom.hex(18))
    membership = practice.memberships.create!(user: user)

    observation = patient.observations.new(
      practice: practice, author_membership: membership, code: "synthetic-mixed", code_system: "synthetic", code_version: "1",
      value_kind: "numeric", numeric_value: "12.34", unit_code: "cm", text_value: "must not be discarded",
      observed_at: Time.current, recorded_at: Time.current
    )

    assert_not observation.save
    assert_includes observation.errors[:text_value], "must be blank"
    assert_not Clinic::Care::Observation.exists?(code: "synthetic-mixed")
  end

  test "a numeric observation rejects an empty numeric value" do
    practice = Clinic::Practice.create!(name: "Synthetic Empty Numeric Practice", timezone: "UTC")
    patient = practice.patients.create!(display_name: "Synthetic Empty Numeric Patient", reference: "OBS-EMPTY")
    user = User.create!(email_address: "observation-empty@example.invalid", password: SecureRandom.hex(18))
    membership = practice.memberships.create!(user: user)
    observation = patient.observations.new(
      practice: practice, author_membership: membership, code: "synthetic-empty", code_system: "synthetic", code_version: "1",
      value_kind: "numeric", numeric_value: "", unit_code: "cm", observed_at: Time.current, recorded_at: Time.current
    )

    assert_not observation.valid?
    assert_includes observation.errors[:numeric_value], "is required"
  end
end
