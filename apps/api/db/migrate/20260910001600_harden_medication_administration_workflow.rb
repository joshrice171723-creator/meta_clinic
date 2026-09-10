class HardenMedicationAdministrationWorkflow < ActiveRecord::Migration[8.1]
  def up
    add_column :clinic_medication_request_revisions, :inventory_product_id, :bigint
    add_column :clinic_medication_request_revisions, :requester_membership_id, :bigint
    add_column :clinic_medication_request_revisions, :dose_value, :decimal, precision: 12, scale: 6
    add_column :clinic_medication_request_revisions, :dose_unit_code, :string, limit: 32
    add_column :clinic_medication_request_revisions, :route_code, :string, limit: 64
    add_column :clinic_medication_request_revisions, :scheduled_for, "timestamp(6) with time zone"
    add_column :clinic_medication_request_revisions, :reason_text, :text
    add_index :clinic_medication_request_revisions, %i[practice_id inventory_product_id],
      name: "med_request_inventory_product"
    add_foreign_key :clinic_medication_request_revisions, :clinic_pharmacy_products,
      column: %i[practice_id inventory_product_id], primary_key: %i[practice_id id],
      name: "fk_med_request_inventory_product"
    add_foreign_key :clinic_medication_request_revisions, :clinic_memberships,
      column: %i[practice_id requester_membership_id], primary_key: %i[practice_id id],
      name: "fk_med_request_requester"
    add_check_constraint :clinic_medication_request_revisions,
      "dose_value IS NULL OR (dose_value > 0 AND dose_value <= 1000000 AND dose_value = round(dose_value, 6))",
      name: "clinic_med_request_dose_value"

    add_column :clinic_medication_administrations, :medication_request_revision_id, :bigint
    add_column :clinic_medication_administrations, :status, :string, limit: 24, null: false, default: "completed"
    add_column :clinic_medication_administrations, :status_reason, :text
    add_column :clinic_medication_administrations, :dose_value, :decimal, precision: 12, scale: 6
    add_column :clinic_medication_administrations, :dose_unit_code, :string, limit: 32
    add_column :clinic_medication_administrations, :route_code, :string, limit: 64
    add_column :clinic_medication_administrations, :administration_site_code, :string, limit: 64
    add_column :clinic_medication_administrations, :variance_reason, :text
    add_column :clinic_medication_administrations, :precheck_status, :string, limit: 32,
      null: false, default: "not_recorded"
    add_column :clinic_medication_administrations, :precheck_notes, :text
    add_column :clinic_medication_administrations, :verification_status, :string, limit: 32,
      null: false, default: "not_recorded"
    add_column :clinic_medication_administrations, :verified_by_membership_id, :bigint
    add_column :clinic_medication_administrations, :response_text, :text
    add_column :clinic_medication_administrations, :education_text, :text

    change_column_null :clinic_medication_administrations, :dose_text, true
    change_column_null :clinic_medication_administrations, :route_text, true
    change_column_null :clinic_medication_administrations, :quantity, true
    remove_check_constraint :clinic_medication_administrations, name: "clinic_medication_administrations_quantity"
    remove_check_constraint :clinic_medication_administrations, name: "clinic_medication_administrations_values"

    add_index :clinic_medication_administrations,
      %i[practice_id patient_id encounter_id medication_request_revision_id],
      name: "clinic_med_admin_request"
    add_foreign_key :clinic_medication_administrations, :clinic_medication_request_revisions,
      column: %i[practice_id patient_id encounter_id medication_request_revision_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_med_admin_request"
    add_foreign_key :clinic_medication_administrations, :clinic_memberships,
      column: %i[practice_id verified_by_membership_id], primary_key: %i[practice_id id],
      name: "fk_med_admin_verifier"
    add_check_constraint :clinic_medication_administrations,
      "status IN ('completed','not_done') AND " \
      "precheck_status IN ('not_recorded','completed','not_required','unable_to_complete') AND " \
      "verification_status IN ('not_recorded','completed','not_required','unable_to_complete')",
      name: "clinic_medication_administrations_workflow_states"
    add_check_constraint :clinic_medication_administrations,
      "medication_request_revision_id IS NULL OR " \
      "(status = 'completed' AND quantity > 0 AND quantity <= 1000000 AND quantity = round(quantity, 6) " \
      "AND dose_value > 0 AND dose_unit_code IS NOT NULL AND route_code IS NOT NULL " \
      "AND precheck_status <> 'not_recorded' AND verification_status <> 'not_recorded' " \
      "AND (verification_status <> 'completed' OR verified_by_membership_id IS NOT NULL) " \
      "AND ((precheck_status <> 'unable_to_complete' AND verification_status <> 'unable_to_complete') " \
      "OR variance_reason IS NOT NULL)) OR " \
      "(status = 'not_done' AND quantity IS NULL AND dose_value IS NULL AND dose_unit_code IS NULL " \
      "AND route_code IS NULL AND status_reason IS NOT NULL)",
      name: "clinic_medication_administrations_outcome"
    add_check_constraint :clinic_medication_administrations,
      "length(request_key) BETWEEN 1 AND 160",
      name: "clinic_medication_administrations_values"
  end

  def down
    remove_check_constraint :clinic_medication_administrations, name: "clinic_medication_administrations_values"
    remove_check_constraint :clinic_medication_administrations, name: "clinic_medication_administrations_outcome"
    remove_check_constraint :clinic_medication_administrations, name: "clinic_medication_administrations_workflow_states"
    remove_foreign_key :clinic_medication_administrations, name: "fk_med_admin_verifier"
    remove_foreign_key :clinic_medication_administrations, name: "fk_med_admin_request"
    remove_index :clinic_medication_administrations, name: "clinic_med_admin_request"

    execute <<~SQL
      UPDATE clinic_medication_administrations
      SET dose_text = COALESCE(dose_text, 'Not recorded'),
          route_text = COALESCE(route_text, 'Not recorded'),
          quantity = COALESCE(quantity, 0.000001)
    SQL
    change_column_null :clinic_medication_administrations, :dose_text, false
    change_column_null :clinic_medication_administrations, :route_text, false
    change_column_null :clinic_medication_administrations, :quantity, false
    add_check_constraint :clinic_medication_administrations,
      "quantity > 0 AND quantity <= 1000000 AND quantity = round(quantity, 6)",
      name: "clinic_medication_administrations_quantity"
    add_check_constraint :clinic_medication_administrations,
      "length(trim(dose_text)) > 0 AND length(trim(route_text)) > 0 AND length(request_key) BETWEEN 1 AND 160",
      name: "clinic_medication_administrations_values"

    %i[response_text education_text verified_by_membership_id verification_status precheck_notes precheck_status
      variance_reason administration_site_code route_code dose_unit_code dose_value status_reason status
      medication_request_revision_id].each do |column|
      remove_column :clinic_medication_administrations, column
    end

    remove_check_constraint :clinic_medication_request_revisions, name: "clinic_med_request_dose_value"
    remove_foreign_key :clinic_medication_request_revisions, name: "fk_med_request_inventory_product"
    remove_foreign_key :clinic_medication_request_revisions, name: "fk_med_request_requester"
    remove_index :clinic_medication_request_revisions, name: "med_request_inventory_product"
    %i[reason_text scheduled_for route_code dose_unit_code dose_value requester_membership_id inventory_product_id].each do |column|
      remove_column :clinic_medication_request_revisions, column
    end
  end
end
