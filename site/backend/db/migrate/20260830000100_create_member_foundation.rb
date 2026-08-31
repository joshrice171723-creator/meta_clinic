class CreateMemberFoundation < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      t.string :email_address, null: false
      t.string :password_digest, null: false
      t.boolean :admin, null: false, default: false
      t.boolean :active, null: false, default: true
      t.timestamps
    end
    add_index :users, :email_address, unique: true
    create_table :member_sessions do |t|
      t.references :user, null: false, foreign_key: true
      t.datetime :expires_at, null: false
      t.timestamps
    end
    add_index :member_sessions, :expires_at
    create_table :materials do |t|
      t.string :title, null: false
      t.text :summary
      t.text :body, null: false
      t.datetime :published_at
      t.timestamps
    end
    add_index :materials, :published_at
    create_table :contact_messages do |t|
      t.text :name, null: false
      t.text :email, null: false
      t.text :message, null: false
      t.timestamps
    end
  end
end
