class PrepareSoapNoteDrafts < ActiveRecord::Migration[8.1]
  class EncryptedRevision < ActiveRecord::Base
    self.table_name = "clinic_encounter_note_revisions"
    encrypts :encrypted_body
  end

  def up
    add_column :clinic_encounter_notes, :note_kind, :string, null: false, default: "legacy"
    add_check_constraint :clinic_encounter_notes,
      "length(trim(note_kind)) > 0 AND note_kind ~ '^[a-z][a-z0-9_]*$'",
      name: "clinic_encounter_notes_kind"
    add_index :clinic_encounter_notes, [ :practice_id, :encounter_id, :note_kind ], unique: true,
      where: "note_kind = 'soap'", name: "clinic_encounter_notes_one_soap"

    execute "DROP TRIGGER clinic_encounter_notes_preserve_identity ON clinic_encounter_notes"
    execute <<~SQL
      CREATE TRIGGER clinic_encounter_notes_preserve_identity
        BEFORE UPDATE ON clinic_encounter_notes
        FOR EACH ROW EXECUTE FUNCTION erd_preserve_identity('practice_id', 'patient_id', 'encounter_id', 'note_kind')
    SQL

    encrypt_existing_revision_bodies!
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "SOAP note history was encrypted in place; use a reviewed forward migration instead of restoring plaintext."
  end

  private

  def encrypt_existing_revision_bodies!
    type = EncryptedRevision.type_for_attribute("encrypted_body")
    rows = connection.select_rows("SELECT id, encrypted_body FROM clinic_encounter_note_revisions ORDER BY id")
    return if rows.empty?

    execute "DROP TRIGGER clinic_encounter_note_revisions_immutable ON clinic_encounter_note_revisions"
    rows.each do |id, plaintext|
      body_bind = ActiveRecord::Relation::QueryAttribute.new("encrypted_body", plaintext, type)
      id_bind = ActiveRecord::Relation::QueryAttribute.new("id", id, ActiveRecord::Type::Integer.new)
      connection.exec_update(
        "UPDATE clinic_encounter_note_revisions SET encrypted_body = $1 WHERE id = $2",
        "Encrypt existing encounter note revision",
        [ body_bind, id_bind ]
      )
    end
  ensure
    if rows&.any?
      execute <<~SQL
        CREATE TRIGGER clinic_encounter_note_revisions_immutable
          BEFORE DELETE OR UPDATE ON clinic_encounter_note_revisions
          FOR EACH ROW EXECUTE FUNCTION erd_immutable_record()
      SQL
    end
  end
end
