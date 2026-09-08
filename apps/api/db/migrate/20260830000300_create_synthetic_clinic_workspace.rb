class CreateSyntheticClinicWorkspace < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_practices do |t|
      t.string :name, null: false
      t.timestamps
    end
    create_table :clinic_memberships do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.references :user, null: false, foreign_key: true, index: { unique: true }
      t.boolean :active, null: false, default: true
      t.boolean :patients_access, null: false, default: false
      t.boolean :inventory_access, null: false, default: false
      t.boolean :staff_access, null: false, default: false
      t.timestamps
    end
    create_table :clinic_patients do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.text :display_name, null: false
      t.string :reference, null: false
      t.timestamps
    end
    add_index :clinic_patients, [ :practice_id, :id ], unique: true
    add_index :clinic_patients, [ :practice_id, :reference ], unique: true
    create_table :clinic_notes do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.bigint :patient_id, null: false
      t.references :author, null: false, foreign_key: { to_table: :users }
      t.text :body, null: false
      t.timestamps
    end
    add_index :clinic_notes, [ :practice_id, :patient_id ]
    add_foreign_key :clinic_notes, :clinic_patients, column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ]
    create_table :clinic_items do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.string :name, null: false
      t.string :sku, null: false
      t.integer :quantity, null: false, default: 0
      t.integer :reorder_level, null: false, default: 0
      t.timestamps
    end
    add_index :clinic_items, [ :practice_id, :sku ], unique: true
    add_check_constraint :clinic_items, "quantity >= 0 AND reorder_level >= 0", name: "clinic_stock_nonnegative"
    create_table :clinic_stock_movements do |t|
      t.references :item, null: false, foreign_key: { to_table: :clinic_items }
      t.references :actor, null: false, foreign_key: { to_table: :users }
      t.integer :delta, null: false
      t.string :reason, null: false
      t.string :request_key, null: false
      t.timestamps
    end
    add_index :clinic_stock_movements, [ :item_id, :request_key ], unique: true
    create_table :clinic_staff_members do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.text :display_name, null: false
      t.string :job_title, null: false
      t.boolean :active, null: false, default: true
      t.timestamps
    end
  end
end
