class AddAssessmentResponseSource < ActiveRecord::Migration[8.1]
  SOURCES = %w[patient_reported clinician_observed proxy_reported imported unknown].freeze

  def up
    add_column :clinic_assessment_revisions, :response_source, :string, limit: 32
    add_check_constraint :clinic_assessment_revisions,
      "response_source IS NULL OR response_source IN (#{SOURCES.map { |value| connection.quote(value) }.join(', ')})",
      name: "clinic_assessments_response_source"
  end

  def down
    remove_check_constraint :clinic_assessment_revisions, name: "clinic_assessments_response_source"
    remove_column :clinic_assessment_revisions, :response_source
  end
end
