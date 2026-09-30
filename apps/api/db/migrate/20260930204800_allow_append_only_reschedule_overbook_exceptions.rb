class AllowAppendOnlyRescheduleOverbookExceptions < ActiveRecord::Migration[8.1]
  def up
    remove_index :clinic_appointment_overbook_exceptions, name: "clinic_appointment_overbook_exception_appointment"
    add_index :clinic_appointment_overbook_exceptions, [ :practice_id, :appointment_id ],
      name: "clinic_appointment_overbook_exception_appointment"
  end

  def down
    if select_value("SELECT 1 FROM clinic_appointment_overbook_exceptions GROUP BY practice_id, appointment_id HAVING count(*) > 1 LIMIT 1")
      raise ActiveRecord::IrreversibleMigration, "Retain append-only overbook history; multiple exceptions cannot be collapsed."
    end

    remove_index :clinic_appointment_overbook_exceptions, name: "clinic_appointment_overbook_exception_appointment"
    add_index :clinic_appointment_overbook_exceptions, [ :practice_id, :appointment_id ], unique: true,
      name: "clinic_appointment_overbook_exception_appointment"
  end
end
