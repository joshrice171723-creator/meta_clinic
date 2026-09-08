class EncryptPatientAddressAndMessageIntentValues < ActiveRecord::Migration[8.1]
  IMMUTABLE_TRIGGERS = {
    "clinic_patient_address_versions" => "clinic_patient_address_versions_immutable",
    "clinic_message_intents" => "clinic_message_intents_immutable"
  }.freeze

  class EncryptedPatientAddressVersion < ActiveRecord::Base
    self.table_name = "clinic_patient_address_versions"
    encrypts :encrypted_address
  end

  class EncryptedMessageIntent < ActiveRecord::Base
    self.table_name = "clinic_message_intents"
    encrypts :encrypted_recipient_snapshot, :encrypted_content
  end

  def up
    # These append-only tables need a one-time in-place rewrite. PostgreSQL
    # runs this migration in one transaction, so the triggers are restored by
    # rollback if any row fails to encrypt.
    drop_immutable_triggers
    encrypt_existing_values!(EncryptedPatientAddressVersion, "encrypted_address", "patient address")
    encrypt_existing_values!(EncryptedMessageIntent, "encrypted_recipient_snapshot", "message recipient snapshot")
    encrypt_existing_values!(EncryptedMessageIntent, "encrypted_content", "message content")
    recreate_immutable_triggers
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Patient address and message values were encrypted in place; use a reviewed forward migration instead of restoring plaintext."
  end

  private

  def drop_immutable_triggers
    IMMUTABLE_TRIGGERS.each do |table, trigger|
      execute "DROP TRIGGER #{trigger} ON public.#{table}"
    end
  end

  def recreate_immutable_triggers
    IMMUTABLE_TRIGGERS.each do |table, trigger|
      execute "CREATE TRIGGER #{trigger} BEFORE DELETE OR UPDATE ON public.#{table} FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record()"
    end
  end

  def encrypt_existing_values!(model, column, label)
    type = model.type_for_attribute(column)
    rows = connection.select_all("SELECT id, #{column} FROM #{model.table_name} ORDER BY id").to_a
    rows.each do |row|
      value = row.fetch(column)
      # The source models require presence and the schema requires NOT NULL;
      # a blank value is invalid legacy data and must stop the all-or-nothing backfill.
      raise "Cannot encrypt blank #{label} #{row.fetch('id')}" if value.blank?

      encrypted_bind = ActiveRecord::Relation::QueryAttribute.new(column, value, type)
      id_bind = ActiveRecord::Relation::QueryAttribute.new("id", row.fetch("id"), model.type_for_attribute("id"))
      connection.exec_update(
        "UPDATE #{model.table_name} SET #{column} = $1 WHERE id = $2",
        "Encrypt existing #{label}",
        [ encrypted_bind, id_bind ]
      )
    end
  end
end
