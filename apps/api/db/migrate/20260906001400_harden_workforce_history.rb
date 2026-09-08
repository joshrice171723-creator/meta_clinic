class HardenWorkforceHistory < ActiveRecord::Migration[8.1]
  def up
    change_column_null :clinic_workforce_availability_versions, :effective_from, false
    %i[starts_at ends_at submitted_at].each do |column|
      change_column_null :clinic_workforce_time_off_requests, column, false
    end
    change_column_null :clinic_workforce_shift_swap_requests, :submitted_at, false
    remove_index :clinic_workforce_employment_sites, name: "workforce_employment_sites_identity"
    # Rails datetime columns are timestamp without time zone, storing UTC.
    execute <<~SQL
      ALTER TABLE clinic_workforce_employment_sites ADD CONSTRAINT workforce_assignment_no_overlap
      EXCLUDE USING gist (practice_id WITH =, employment_id WITH =, site_id WITH =,
        tsrange(effective_from, effective_until, '[)') WITH &&);
    SQL
    add_index :clinic_workforce_employment_sites, %i[practice_id employment_id site_id],
      unique: true, where: "effective_until IS NULL", name: "workforce_assignment_open_interval"
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Historical employment intervals must be retained"
  end
end
