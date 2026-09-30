class CreateOfferingTextBatches < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_offering_text_batches do |t|
      t.bigint :practice_id, null: false
      t.bigint :actor_membership_id, null: false
      t.bigint :actor_id, null: false
      t.bigint :site_id
      t.bigint :authorization_generation, null: false
      t.string :request_key, null: false, limit: 160
      t.string :plan_digest, null: false, limit: 64
      t.text :document, null: false
      t.timestamps
    end
    add_index :clinic_offering_text_batches, [:practice_id, :actor_membership_id, :request_key], unique: true, name: "offering_text_batch_identity"
    add_foreign_key :clinic_offering_text_batches, :clinic_practices, column: :practice_id, name: "offering_text_batch_practice"
    add_foreign_key :clinic_offering_text_batches, :users, column: :actor_id, name: "offering_text_batch_actor"
    add_foreign_key :clinic_offering_text_batches, :clinic_memberships, column: [:practice_id, :actor_membership_id], primary_key: [:practice_id, :id], name: "offering_text_batch_membership"
    add_foreign_key :clinic_offering_text_batches, :clinic_sites, column: [:practice_id, :site_id], primary_key: [:practice_id, :id], name: "offering_text_batch_site"
    add_check_constraint :clinic_offering_text_batches, "authorization_generation > 0 AND char_length(request_key) BETWEEN 1 AND 160 AND plan_digest ~ '^[a-f0-9]{64}$'", name: "offering_text_batch_values"
  end
end
