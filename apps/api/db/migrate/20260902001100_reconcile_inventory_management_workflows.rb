require_relative "20260902000400_add_inventory_management_workflows"

class ReconcileInventoryManagementWorkflows < ActiveRecord::Migration[8.1]
  TABLES = %i[
    clinic_inventory_purchase_orders
    clinic_inventory_purchase_order_lines
    clinic_inventory_purchase_order_events
    clinic_inventory_shipments
    clinic_inventory_transfers
    clinic_inventory_recalls
    clinic_inventory_recall_lots
    clinic_inventory_recall_dispositions
    clinic_inventory_control_reviews
  ].freeze
  COLUMNS = {
    clinic_inventory_receipts: %i[purchase_order_id shipment_id status],
    clinic_inventory_receipt_lines: %i[purchase_order_line_id area_id temperature_c exception disposition]
  }.freeze

  def up
    checks = TABLES.map { |table| table_exists?(table) } +
      COLUMNS.flat_map { |table, columns| columns.map { |column| column_exists?(table, column) } }
    return if checks.all?
    if checks.any?
      raise ActiveRecord::IrreversibleMigration,
        "Partial inventory-management schema detected; preserve the database and reconcile it manually."
    end

    AddInventoryManagementWorkflows.new.migrate(:up)
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "The reconciliation preserves inventory workflow evidence; restore a reviewed backup instead."
  end
end
