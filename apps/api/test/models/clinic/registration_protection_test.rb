require "test_helper"

class ClinicRegistrationProtectionTest < ActiveSupport::TestCase
  setup do
    @practice = Clinic::Practice.create!(name: "Synthetic Registration Protection")
    @patient = @practice.patients.create!(display_name: "Synthetic Registration Patient", reference: "REG-PROTECTED")
  end

  test "patient address and message intent values round-trip without raw markers" do
    address_marker = "Synthetic protected address marker"
    recipient_marker = "Synthetic protected recipient marker"
    content_marker = "Synthetic protected content marker"

    address = @patient.address_versions.create!(practice: @practice, version: 1, encrypted_address: address_marker)
    intent = @patient.message_intents.create!(practice: @practice, request_key: "registration-protection-message",
      purpose_code: "synthetic", encrypted_recipient_snapshot: recipient_marker, encrypted_content: content_marker)

    raw = ApplicationRecord.connection.select_one(<<~SQL.squish)
      SELECT encrypted_address FROM clinic_patient_address_versions WHERE id = #{Integer(address.id)}
    SQL
    raw_message = ApplicationRecord.connection.select_one(<<~SQL.squish)
      SELECT encrypted_recipient_snapshot, encrypted_content FROM clinic_message_intents WHERE id = #{Integer(intent.id)}
    SQL

    assert_equal address_marker, address.reload.encrypted_address
    assert_equal recipient_marker, intent.reload.encrypted_recipient_snapshot
    assert_equal content_marker, intent.reload.encrypted_content
    assert_not_includes raw.fetch("encrypted_address"), address_marker
    assert_not_includes raw_message.fetch("encrypted_recipient_snapshot"), recipient_marker
    assert_not_includes raw_message.fetch("encrypted_content"), content_marker
  end

  test "registration aliases are filtered by the effective parameter filter" do
    filter = ActiveSupport::ParameterFilter.new(Rails.application.config.filter_parameters)
    values = %w[date_of_birth emergency_phone contact_value tobacco_use].to_h do |field|
      [ field, "synthetic-filter-marker" ]
    end

    filtered = filter.filter(values)
    assert filtered.values.all? { |value| value == "[FILTERED]" }, filtered
  end
end
