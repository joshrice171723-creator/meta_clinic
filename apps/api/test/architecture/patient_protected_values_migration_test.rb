require "test_helper"

class PatientProtectedValuesMigrationTest < ActiveSupport::TestCase
  MIGRATION = Rails.root.join("db/migrate/20260908000100_encrypt_patient_address_and_message_intent_values.rb")
  require MIGRATION.to_s

  test "backfills legacy protected values and restores immutable triggers" do
    practice = Clinic::Practice.create!(name: "Synthetic Protected Values Migration")
    patient = practice.patients.create!(display_name: "Synthetic Migration Patient", reference: "MIGRATION-PROTECTED")
    address_marker = "Synthetic legacy address marker"
    recipient_marker = "Synthetic legacy recipient marker"
    content_marker = "Synthetic legacy content marker"

    address_id = insert_legacy_address(practice, patient, address_marker)
    intent_id = insert_legacy_message(practice, patient, recipient_marker, content_marker)

    EncryptPatientAddressAndMessageIntentValues.new.up

    raw_address = connection.select_value(
      "SELECT encrypted_address FROM clinic_patient_address_versions WHERE id = #{Integer(address_id)}"
    )
    raw_message = connection.select_one(
      "SELECT encrypted_recipient_snapshot, encrypted_content FROM clinic_message_intents WHERE id = #{Integer(intent_id)}"
    )

    assert_not_includes raw_address, address_marker
    assert_not_includes raw_message.fetch("encrypted_recipient_snapshot"), recipient_marker
    assert_not_includes raw_message.fetch("encrypted_content"), content_marker
    assert_equal address_marker, Clinic::Care::PatientAddressVersion.find(address_id).encrypted_address
    intent = Clinic::MessageIntent.find(intent_id)
    assert_equal recipient_marker, intent.encrypted_recipient_snapshot
    assert_equal content_marker, intent.encrypted_content

    %w[clinic_patient_address_versions_immutable clinic_message_intents_immutable].each do |trigger|
      assert_equal 27, connection.select_value(
        "SELECT tgtype FROM pg_trigger WHERE tgname = #{connection.quote(trigger)} AND NOT tgisinternal"
      ).to_i
    end
  end

  private

  def connection
    ApplicationRecord.connection
  end

  def insert_legacy_address(practice, patient, marker)
    connection.select_value(<<~SQL)
      INSERT INTO clinic_patient_address_versions
        (practice_id, patient_id, version, encrypted_address, created_at, updated_at)
      VALUES
        (#{practice.id}, #{patient.id}, 1, #{connection.quote(marker)}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id
    SQL
  end

  def insert_legacy_message(practice, patient, recipient, content)
    connection.select_value(<<~SQL)
      INSERT INTO clinic_message_intents
        (practice_id, patient_id, request_key, purpose_code, encrypted_recipient_snapshot,
         encrypted_content, created_at, updated_at)
      VALUES
        (#{practice.id}, #{patient.id}, 'migration-protected-message', 'synthetic',
         #{connection.quote(recipient)}, #{connection.quote(content)}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id
    SQL
  end
end
