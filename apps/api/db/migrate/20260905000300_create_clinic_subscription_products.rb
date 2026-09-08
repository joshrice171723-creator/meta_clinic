class CreateClinicSubscriptionProducts < ActiveRecord::Migration[8.1]
  def change
    remove_check_constraint :clinic_billing_receipts, "kind IN ('cash_payment', 'cash_refund')", name: "billing_receipt_kind"
    add_check_constraint :clinic_billing_receipts, "kind IN ('cash_payment', 'cash_refund', 'subscription_payment', 'subscription_refund')", name: "billing_receipt_kind"
    tenant_table :clinic_subscription_families do |t|
      t.string :name, null: false
      t.text :description, null: false, default: ""
      t.boolean :retired, null: false, default: false
    end
    tenant_table :clinic_service_options do |t|
      t.string :name, null: false
      t.text :description, null: false, default: ""
      t.boolean :retired, null: false, default: false
    end
    tenant_table :clinic_subscription_packages do |t|
      t.bigint :family_id, null: false
      t.string :name, null: false
      t.jsonb :draft, null: false, default: {}
      t.integer :lock_version, null: false, default: 0
      t.boolean :retired, null: false, default: false
      t.bigint :published_version_id
    end
    tenant_fk :clinic_subscription_packages, :family_id, :clinic_subscription_families
    tenant_table :clinic_subscription_versions do |t|
      t.bigint :package_id, null: false
      t.integer :number, null: false
      t.jsonb :snapshot, null: false
      t.string :request_key, null: false
      t.string :request_digest, null: false
    end
    tenant_fk :clinic_subscription_versions, :package_id, :clinic_subscription_packages
    add_index :clinic_subscription_versions, [:practice_id, :package_id, :id], unique: true, name: "subscription_version_package_identity"
    add_index :clinic_subscription_versions, [:practice_id, :package_id, :number], unique: true, name: "subscription_version_number"
    add_index :clinic_subscription_versions, [:practice_id, :request_key], unique: true, name: "subscription_version_request"
    add_foreign_key :clinic_subscription_packages, :clinic_subscription_versions,
      column: [:practice_id, :id, :published_version_id], primary_key: [:practice_id, :package_id, :id], name: "subscription_current_version"
    add_check_constraint :clinic_subscription_versions, "number > 0 AND jsonb_typeof(snapshot) = 'object'", name: "subscription_version_values"

    tenant_table :clinic_subscription_agreements do |t|
      t.bigint :patient_id, null: false
      t.bigint :version_id, null: false
      t.bigint :invoice_id, null: false
      t.jsonb :snapshot, null: false
      t.decimal :amount, precision: 20, scale: 6, null: false
      t.string :currency, null: false
      t.string :request_key, null: false
      t.string :request_digest, null: false
    end
    tenant_fk :clinic_subscription_agreements, :patient_id, :clinic_patients
    tenant_fk :clinic_subscription_agreements, :version_id, :clinic_subscription_versions
    add_foreign_key :clinic_subscription_agreements, :clinic_invoices,
      column: [:practice_id, :patient_id, :invoice_id], primary_key: [:practice_id, :patient_id, :id], name: "subscription_agreement_invoice"
    add_index :clinic_subscription_agreements, [:practice_id, :patient_id, :request_key], unique: true, name: "subscription_purchase_request"
    add_index :clinic_subscription_agreements, [:practice_id, :invoice_id], unique: true, name: "subscription_purchase_invoice"
    add_check_constraint :clinic_subscription_agreements, "amount > 0 AND amount = round(amount, 2) AND currency ~ '^[A-Z]{3}$' AND jsonb_typeof(snapshot) = 'object'", name: "subscription_purchase_values"

    tenant_table :clinic_subscription_events do |t|
      t.bigint :agreement_id, null: false
      t.string :kind, null: false
      t.string :request_key, null: false
      t.jsonb :details, null: false, default: {}
    end
    tenant_fk :clinic_subscription_events, :agreement_id, :clinic_subscription_agreements
    add_index :clinic_subscription_events, [:practice_id, :agreement_id, :request_key], unique: true, name: "subscription_event_request"
    add_check_constraint :clinic_subscription_events,
      "kind IN ('pending_review','review_approved','review_declined','pending_payment','processing','payment_failed','outcome_unknown','active','canceled','refunded','expired') AND jsonb_typeof(details) = 'object'", name: "subscription_event_values"

    [:clinic_subscription_versions, :clinic_subscription_agreements, :clinic_subscription_events].each do |table|
      reversible do |direction|
        direction.up do
          execute "CREATE TRIGGER #{table}_immutable BEFORE UPDATE OR DELETE ON #{table} FOR EACH ROW EXECUTE FUNCTION erd_immutable_record()"
        end
        direction.down { execute "DROP TRIGGER #{table}_immutable ON #{table}" }
      end
    end
  end

  private

  def tenant_table(name)
    create_table name do |t|
      t.bigint :practice_id, null: false
      yield t
      t.timestamps
    end
    add_index name, [:practice_id, :id], unique: true
    add_foreign_key name, :clinic_practices, column: :practice_id
  end

  def tenant_fk(table, column, target)
    add_foreign_key table, target, column: [:practice_id, column], primary_key: [:practice_id, :id]
  end
end
