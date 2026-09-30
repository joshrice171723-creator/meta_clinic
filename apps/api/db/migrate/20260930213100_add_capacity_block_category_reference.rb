class AddCapacityBlockCategoryReference < ActiveRecord::Migration[8.1]
  def up
    add_column :clinic_capacity_rules, :operational_policy_version_id, :bigint
    add_column :clinic_capacity_rules, :reason_category_key, :string, limit: 80
    add_foreign_key :clinic_capacity_rules, :clinic_operational_policy_versions,
      column: %i[practice_id site_id operational_policy_version_id], primary_key: %i[practice_id site_id id],
      name: "clinic_capacity_rule_category_policy_context"
    add_check_constraint :clinic_capacity_rules,
      "(operational_policy_version_id IS NULL AND reason_category_key IS NULL) OR " \
      "(kind = 'block' AND operational_policy_version_id IS NOT NULL AND reason_category_key IS NOT NULL AND length(trim(reason_category_key)) > 0)",
      name: "clinic_capacity_rule_category_pair"
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Preserve recorded block category provenance; use a reviewed forward migration."
  end
end
