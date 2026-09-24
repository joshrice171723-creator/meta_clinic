class AddRoomKindsAndDefaultRooms < ActiveRecord::Migration[8.1]
  def up
    add_column :clinic_rooms, :kind, :string, default: "physical", null: false
    add_check_constraint :clinic_rooms, "kind IN ('physical', 'telehealth')", name: "clinic_rooms_kind"

    execute <<~SQL
      INSERT INTO clinic_rooms (practice_id, site_id, code, kind, created_at, updated_at)
      SELECT sites.practice_id, sites.id, names.code, 'physical', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM clinic_sites AS sites
      CROSS JOIN (VALUES ('Room 1'), ('Room 2')) AS names(code)
      WHERE NOT EXISTS (SELECT 1 FROM clinic_rooms WHERE site_id = sites.id)
    SQL
  end

  def down
    remove_check_constraint :clinic_rooms, name: "clinic_rooms_kind"
    remove_column :clinic_rooms, :kind
  end
end
