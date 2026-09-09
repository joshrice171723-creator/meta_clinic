class EncryptObservationValues < ActiveRecord::Migration[8.1]
  class EncryptedObservation < ActiveRecord::Base
    self.table_name = "clinic_observations"
    encrypts :encrypted_value
  end

  VALUE_COLUMNS = %w[numeric_value text_value coded_value unit_code missing_reason].freeze

  def up
    add_column :clinic_observations, :encrypted_value, :text
    remove_check_constraint :clinic_observations, name: "clinic_observations_value_shape"

    encrypt_existing_values!

    add_check_constraint :clinic_observations,
      "numeric_value IS NULL AND text_value IS NULL AND coded_value IS NULL AND unit_code IS NULL AND missing_reason IS NULL",
      name: "clinic_observations_legacy_values_empty"
    add_check_constraint :clinic_observations,
      "(value_kind = 'group' AND encrypted_value IS NULL) OR (value_kind <> 'group' AND encrypted_value IS NOT NULL AND length(trim(encrypted_value)) > 0)",
      name: "clinic_observations_encrypted_value_shape"
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Observation values were encrypted in place; use a reviewed forward migration instead of restoring plaintext."
  end

  private

  def encrypt_existing_values!
    type = EncryptedObservation.type_for_attribute("encrypted_value")
    rows = connection.select_all(<<~SQL).to_a
      SELECT id, value_kind, numeric_value, text_value, coded_value, unit_code, missing_reason
      FROM clinic_observations
      ORDER BY id
    SQL
    return if rows.empty?

    rows.each do |row|
      if row["value_kind"] == "group"
        id_bind = ActiveRecord::Relation::QueryAttribute.new("id", row["id"], ActiveRecord::Type::Integer.new)
        connection.exec_update(
          "UPDATE clinic_observations SET encrypted_value = NULL, numeric_value = NULL, text_value = NULL, coded_value = NULL, unit_code = NULL, missing_reason = NULL WHERE id = $1",
          "Clear clinic observation group value",
          [ id_bind ]
        )
        next
      end

      value = VALUE_COLUMNS.index_with { |column| row[column] }
      value["numeric_value"] = row["numeric_value"]&.to_s if row["numeric_value"]
      payload = JSON.generate("version" => 1, "value" => value)
      encrypted_bind = ActiveRecord::Relation::QueryAttribute.new("encrypted_value", payload, type)
      id_bind = ActiveRecord::Relation::QueryAttribute.new("id", row["id"], ActiveRecord::Type::Integer.new)

      connection.exec_update(<<~SQL.squish, "Encrypt existing clinic observation value", [ encrypted_bind, id_bind ])
        UPDATE clinic_observations
        SET encrypted_value = $1,
            numeric_value = NULL,
            text_value = NULL,
            coded_value = NULL,
            unit_code = NULL,
            missing_reason = NULL
        WHERE id = $2
      SQL
    end
  end
end
