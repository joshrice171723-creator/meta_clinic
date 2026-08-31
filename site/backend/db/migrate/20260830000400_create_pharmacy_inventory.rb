class CreatePharmacyInventory < ActiveRecord::Migration[8.1]
  def change
    add_index :clinic_memberships, [ :practice_id, :user_id ], unique: true
    create_table :clinic_pharmacy_products do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.string :name, null: false
      t.string :generic_name, :ndc, :product_ndc, :dosage_form, :route, :labeler
      t.text :ingredients, :package_description
      t.string :sku, null: false
      t.integer :reorder_point, null: false, default: 0
      t.boolean :active, null: false, default: true
      t.string :source, null: false, default: "manual"
      t.datetime :imported_at
      t.timestamps
    end
    add_index :clinic_pharmacy_products, [ :practice_id, :id ], unique: true
    add_index :clinic_pharmacy_products, [ :practice_id, :sku ], unique: true
    add_index :clinic_pharmacy_products, [ :practice_id, :ndc ], unique: true
    add_check_constraint :clinic_pharmacy_products, "reorder_point BETWEEN 0 AND 1000000", name: "pharmacy_reorder_range"
    add_check_constraint :clinic_pharmacy_products, "source IN ('manual', 'openfda', 'synthetic')", name: "pharmacy_product_source"

    create_table :clinic_pharmacy_batches do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.bigint :product_id, null: false
      t.string :lot_number, :location, null: false
      t.string :supplier
      t.date :expires_on, null: false
      t.string :status, null: false, default: "active"
      t.timestamps
    end
    add_index :clinic_pharmacy_batches, [ :practice_id, :id ], unique: true
    add_index :clinic_pharmacy_batches, [ :product_id, :lot_number, :location ], unique: true, name: "pharmacy_batch_identity"
    add_foreign_key :clinic_pharmacy_batches, :clinic_pharmacy_products, column: [ :practice_id, :product_id ], primary_key: [ :practice_id, :id ]
    add_check_constraint :clinic_pharmacy_batches, "status IN ('active', 'quarantined', 'recalled')", name: "pharmacy_batch_status"

    create_table :clinic_pharmacy_movements do |t|
      t.bigint :practice_id, :batch_id, :actor_id, null: false
      t.integer :quantity, null: false
      t.string :kind, :reason, :request_key, null: false
      t.timestamps
    end
    add_check_constraint :clinic_pharmacy_movements, "quantity <> 0 AND quantity BETWEEN -1000000 AND 1000000", name: "pharmacy_movement_range"
    add_check_constraint :clinic_pharmacy_movements, "(kind IN ('receipt', 'adjustment_in') AND quantity > 0) OR (kind IN ('adjustment_out', 'damaged', 'expired', 'return_to_supplier') AND quantity < 0)", name: "pharmacy_movement_direction"

    create_table :clinic_pharmacy_batch_events do |t|
      t.bigint :practice_id, :batch_id, :actor_id, null: false
      t.string :from_status, :to_status, :reason, :request_key, null: false
      t.timestamps
    end
    %i[clinic_pharmacy_movements clinic_pharmacy_batch_events].each do |table|
      add_index table, [ :practice_id, :request_key ], unique: true
      add_index table, [ :practice_id, :batch_id ]
      add_foreign_key table, :clinic_pharmacy_batches, column: [ :practice_id, :batch_id ], primary_key: [ :practice_id, :id ]
      add_foreign_key table, :clinic_memberships, column: [ :practice_id, :actor_id ], primary_key: [ :practice_id, :user_id ]
    end

    # SQLite serializes writes; this check also protects concurrent/raw inserts.
    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE TRIGGER pharmacy_nonnegative_stock BEFORE INSERT ON clinic_pharmacy_movements
          WHEN (SELECT COALESCE(SUM(quantity), 0) FROM clinic_pharmacy_movements WHERE batch_id = NEW.batch_id) + NEW.quantity NOT BETWEEN 0 AND 1000000
          BEGIN SELECT RAISE(ABORT, 'Pharmacy stock must remain between zero and one million packages'); END;
        SQL
        %w[clinic_pharmacy_movements clinic_pharmacy_batch_events].each do |table|
          %w[UPDATE DELETE].each do |operation|
            execute "CREATE TRIGGER #{table}_no_#{operation.downcase} BEFORE #{operation} ON #{table} BEGIN SELECT RAISE(ABORT, 'Pharmacy history is append-only'); END;"
          end
        end
      end
      direction.down do
        execute "DROP TRIGGER IF EXISTS pharmacy_nonnegative_stock"
        %w[clinic_pharmacy_movements clinic_pharmacy_batch_events].each do |table|
          %w[update delete].each { |operation| execute "DROP TRIGGER IF EXISTS #{table}_no_#{operation}" }
        end
      end
    end
  end
end
