class ProtectWorkforceSchedulePublications < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      CREATE TRIGGER workforce_schedule_publications_immutable
      BEFORE UPDATE OR DELETE ON clinic_workforce_schedule_publications
      FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
    SQL
  end

  def down
    execute "DROP TRIGGER workforce_schedule_publications_immutable ON clinic_workforce_schedule_publications"
  end
end
