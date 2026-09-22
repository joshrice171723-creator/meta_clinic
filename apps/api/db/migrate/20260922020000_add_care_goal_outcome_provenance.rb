class AddCareGoalOutcomeProvenance < ActiveRecord::Migration[8.0]
  SOURCES = %w[patient_reported clinician_observed proxy_reported imported unknown].freeze

  def up
    add_column :clinic_care_goal_revisions, :outcome_source, :string, limit: 32
    add_column :clinic_care_goal_revisions, :outcome_recorded_at, :timestamptz
    add_check_constraint :clinic_care_goal_revisions,
      <<~SQL.squish,
        (outcome_source IS NULL AND outcome_recorded_at IS NULL) OR
        (outcome_source IN (#{SOURCES.map { |source| connection.quote(source) }.join(', ')}) AND outcome_recorded_at IS NOT NULL)
      SQL
      name: "clinic_care_goal_outcome_provenance"
  end

  def down
    remove_check_constraint :clinic_care_goal_revisions, name: "clinic_care_goal_outcome_provenance"
    remove_column :clinic_care_goal_revisions, :outcome_recorded_at
    remove_column :clinic_care_goal_revisions, :outcome_source
  end
end
