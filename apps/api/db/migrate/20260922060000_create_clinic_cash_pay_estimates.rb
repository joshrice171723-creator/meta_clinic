class CreateClinicCashPayEstimates < ActiveRecord::Migration[8.0]
  def change
    create_table :clinic_cash_pay_estimates do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id
      t.string :classification, null: false, limit: 24
      t.string :status, null: false, default: "draft", limit: 24
      t.string :currency, null: false, limit: 3
      t.string :policy_version, limit: 80
      t.string :delivery_method, limit: 40
      t.datetime :issued_at
      t.datetime :delivered_at
      t.bigint :supersedes_id
      t.integer :revision, null: false, default: 1
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    create_table :clinic_cash_pay_estimate_lines do |t|
      t.bigint :practice_id, null: false
      t.bigint :cash_pay_estimate_id, null: false
      t.bigint :service_offering_id
      t.bigint :billing_service_id
      t.decimal :quantity, precision: 14, scale: 3, null: false
      t.decimal :unit_amount, precision: 14, scale: 2, null: false
      t.decimal :expected_amount, precision: 14, scale: 2, null: false
      t.string :description_snapshot, null: false, limit: 500
      t.string :inclusions, limit: 500
      t.string :exclusions, limit: 500
      t.timestamps
    end
    add_index :clinic_cash_pay_estimates, [ :practice_id, :id ], unique: true, name: "clinic_cash_pay_estimates_practice_id"
    add_index :clinic_cash_pay_estimates, [ :practice_id, :patient_id, :status ], name: "clinic_cash_pay_estimates_patient"
    add_index :clinic_cash_pay_estimate_lines, [ :practice_id, :cash_pay_estimate_id, :id ], unique: true, name: "clinic_cash_pay_estimate_lines_context"
    add_foreign_key :clinic_cash_pay_estimates, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_cash_pay_estimates, :clinic_patients, column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ], name: "fk_cash_pay_estimates_patient"
    add_foreign_key :clinic_cash_pay_estimates, :clinic_cash_pay_estimates, column: [ :practice_id, :supersedes_id ], primary_key: [ :practice_id, :id ], name: "fk_cash_pay_estimates_supersedes"
    add_foreign_key :clinic_cash_pay_estimate_lines, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_cash_pay_estimate_lines, :clinic_cash_pay_estimates, column: [ :practice_id, :cash_pay_estimate_id ], primary_key: [ :practice_id, :id ], name: "fk_cash_pay_estimate_lines_estimate"
    add_foreign_key :clinic_cash_pay_estimate_lines, :clinic_service_offerings, column: [ :practice_id, :service_offering_id ], primary_key: [ :practice_id, :id ], name: "fk_cash_pay_estimate_lines_offering"
    add_foreign_key :clinic_cash_pay_estimate_lines, :clinic_billing_services, column: [ :practice_id, :billing_service_id ], primary_key: [ :practice_id, :id ], name: "fk_cash_pay_estimate_lines_billing_service"
    add_check_constraint :clinic_cash_pay_estimates, "classification IN ('general_estimate','gfe_candidate','issued_gfe') AND status IN ('draft','issued','superseded','void') AND currency ~ '^[A-Z]{3}$' AND revision >= 1 AND lock_version >= 0", name: "clinic_cash_pay_estimates_values"
    add_check_constraint :clinic_cash_pay_estimate_lines, "quantity > 0 AND unit_amount >= 0 AND expected_amount >= 0 AND length(trim(description_snapshot)) > 0", name: "clinic_cash_pay_estimate_lines_values"
  end
end
