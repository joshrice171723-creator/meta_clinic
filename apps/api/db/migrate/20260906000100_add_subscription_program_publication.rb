class AddSubscriptionProgramPublication < ActiveRecord::Migration[8.1]
  def up
    add_column :clinic_subscription_families, :display_order, :integer, null: false, default: 0
    add_column :clinic_subscription_families, :lock_version, :integer, null: false, default: 0
    add_column :clinic_subscription_families, :published_snapshot, :jsonb
    add_check_constraint :clinic_subscription_families, "display_order >= 0", name: "subscription_program_display_order"
    # Preserve existing storefront availability; new programs start as drafts.
    execute <<~SQL
      UPDATE clinic_subscription_families
      SET published_snapshot = jsonb_build_object('name', name, 'description', description, 'display_order', display_order)
    SQL
  end

  def down
    remove_check_constraint :clinic_subscription_families, name: "subscription_program_display_order"
    remove_column :clinic_subscription_families, :published_snapshot
    remove_column :clinic_subscription_families, :lock_version
    remove_column :clinic_subscription_families, :display_order
  end
end
