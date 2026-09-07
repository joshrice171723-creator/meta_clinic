class HardenMemberSessions < ActiveRecord::Migration[8.1]
  def change
    add_column :member_sessions, :last_activity_at, :datetime, null: false, default: -> { "CURRENT_TIMESTAMP" }
    add_index :member_sessions, :expires_at
    create_table :identity_login_throttles, id: false do |t|
      t.string :key_digest, null: false, primary_key: true, limit: 64
      t.integer :attempts, null: false
      t.datetime :expires_at, null: false
    end
    add_index :identity_login_throttles, :expires_at
    add_check_constraint :identity_login_throttles, "attempts > 0", name: "identity_login_throttles_positive_attempts"
  end
end
