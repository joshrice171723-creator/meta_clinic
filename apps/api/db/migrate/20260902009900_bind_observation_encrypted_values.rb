class BindObservationEncryptedValues < ActiveRecord::Migration[8.1]
  class EncryptedObservation < ActiveRecord::Base
    self.table_name = "clinic_observations"
    encrypts :encrypted_value
  end

  def up
    add_column :clinic_observations, :value_binding_id, :string
    backfill_binding_ids!
    change_column_null :clinic_observations, :value_binding_id, false
    add_index :clinic_observations, [ :practice_id, :value_binding_id ], unique: true,
      name: "clinic_observations_value_binding"
    rebind_existing_values!

    execute "DROP TRIGGER clinic_observations_preserve_identity ON clinic_observations"
    execute <<~SQL
      CREATE TRIGGER clinic_observations_preserve_identity
        BEFORE UPDATE ON clinic_observations
        FOR EACH ROW EXECUTE FUNCTION erd_preserve_identity('practice_id', 'patient_id', 'encounter_id', 'author_membership_id', 'parent_observation_id', 'value_binding_id')
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Observation ciphertext is bound to value_binding_id; use a reviewed forward migration instead of removing the binding."
  end

  private

  def backfill_binding_ids!
    # PostgreSQL runs each migration in one transaction, so a failed row rolls back
    # the whole transition and a retry starts from the pre-migration state.
    rows = connection.select_values("SELECT id FROM clinic_observations WHERE value_binding_id IS NULL ORDER BY id")
    rows.each do |id|
      id_bind = ActiveRecord::Relation::QueryAttribute.new("id", id, ActiveRecord::Type::Integer.new)
      binding_bind = ActiveRecord::Relation::QueryAttribute.new("value_binding_id", SecureRandom.uuid, ActiveRecord::Type::String.new)
      connection.exec_update(
        "UPDATE clinic_observations SET value_binding_id = $1 WHERE id = $2",
        "Bind clinic observation value",
        [ binding_bind, id_bind ]
      )
    end
  end

  def rebind_existing_values!
    type = EncryptedObservation.type_for_attribute("encrypted_value")
    EncryptedObservation.where.not(encrypted_value: nil).find_each do |observation|
      payload = JSON.parse(observation.encrypted_value)
      payload.merge!(
        "version" => 1,
        "practice_id" => observation.practice_id,
        "patient_id" => observation.patient_id,
        "encounter_id" => observation.encounter_id,
        "value_binding_id" => observation.value_binding_id
      )
      encrypted_bind = ActiveRecord::Relation::QueryAttribute.new(
        "encrypted_value", JSON.generate(payload), type
      )
      id_bind = ActiveRecord::Relation::QueryAttribute.new("id", observation.id, ActiveRecord::Type::Integer.new)
      connection.exec_update(
        "UPDATE clinic_observations SET encrypted_value = $1 WHERE id = $2",
        "Bind existing clinic observation value",
        [ encrypted_bind, id_bind ]
      )
    end
  end
end
