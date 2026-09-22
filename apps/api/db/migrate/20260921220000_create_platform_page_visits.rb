class CreatePlatformPageVisits < ActiveRecord::Migration[8.1]
  def change
    create_table :platform_page_visits do |t|
      t.uuid :event_id, null: false
      t.uuid :visitor_id, null: false
      t.string :path, null: false, limit: 20
      t.string :referrer_host, null: false, default: "", limit: 253
      t.datetime :created_at, null: false
    end
    add_index :platform_page_visits, :event_id, unique: true
    add_index :platform_page_visits, [ :created_at, :path ]
    add_check_constraint :platform_page_visits, "path IN ('/joshua', '/demo')", name: "platform_page_visits_path"
  end
end
