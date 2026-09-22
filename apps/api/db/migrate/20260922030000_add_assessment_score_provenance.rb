class AddAssessmentScoreProvenance < ActiveRecord::Migration[8.1]
  SOURCES = %w[calculated clinician_entered imported unknown].freeze

  def up
    add_column :clinic_assessment_revisions, :score_source, :string, limit: 32
    add_column :clinic_assessment_revisions, :score_recorded_at, :timestamptz
    add_check_constraint :clinic_assessment_revisions,
      <<~SQL.squish,
        (score_source IS NULL AND score_recorded_at IS NULL) OR
        (score_source IN (#{SOURCES.map { |value| connection.quote(value) }.join(', ')}) AND score_recorded_at IS NOT NULL)
      SQL
      name: "clinic_assessments_score_provenance"
  end

  def down
    remove_check_constraint :clinic_assessment_revisions, name: "clinic_assessments_score_provenance"
    remove_column :clinic_assessment_revisions, :score_recorded_at
    remove_column :clinic_assessment_revisions, :score_source
  end
end
