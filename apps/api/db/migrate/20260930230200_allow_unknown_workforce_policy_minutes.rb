class AllowUnknownWorkforcePolicyMinutes < ActiveRecord::Migration[8.0]
  def up
    change_column_null :clinic_workforce_time_segments, :rounded_minutes, true
    change_column_null :clinic_workforce_time_segments, :paid_minutes, true
    change_column_null :clinic_workforce_timecard_versions, :rounded_total_minutes, true
    # Existing nonnegative CHECK constraints reject negatives and allow SQL NULL.
    # Raw durations and immutable historical rows are preserved unchanged.
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Unknown policy minutes cannot be replaced with guessed values."
  end
end
