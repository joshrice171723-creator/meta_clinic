class PreventOverlappingIntakeOwnership < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      ALTER TABLE clinic_encounter_participants
      ADD CONSTRAINT clinic_encounter_participants_no_overlapping_intake_owner
      EXCLUDE USING gist (
        practice_id WITH =,
        encounter_id WITH =,
        tstzrange(effective_from, effective_until, '[)') WITH &&
      )
      WHERE (participation_role = 'intake_owner');
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Intake ownership history requires non-overlapping leases."
  end
end
