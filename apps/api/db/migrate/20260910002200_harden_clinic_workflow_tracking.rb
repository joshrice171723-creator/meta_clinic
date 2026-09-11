class HardenClinicWorkflowTracking < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_medication_request_revisions, :completion_exception, :text
    add_column :clinic_service_request_revisions, :completion_exception, :text
    add_column :clinic_immunization_revisions, :medication_administration_id, :bigint

    add_foreign_key :clinic_immunization_revisions, :clinic_medication_administrations,
      column: %i[practice_id patient_id encounter_id medication_administration_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_immunization_medication_administration"
    add_check_constraint :clinic_immunization_revisions,
      "status <> 'completed' OR occurrence_source <> 'administered_here' OR medication_administration_id IS NOT NULL",
      name: "clinic_immunization_admin_evidence", validate: false

    create_table :clinic_assessment_revisions do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :site_id, null: false
      t.uuid :series_id, null: false
      t.integer :version_number, null: false
      t.bigint :prior_revision_id
      t.string :status, null: false, limit: 32
      t.string :category, null: false, limit: 64
      t.text :instrument_name, null: false
      t.text :instrument_version
      t.text :score_value
      t.text :interpretation
      t.text :response_summary
      t.text :follow_up_plan
      t.column :assessed_at, "timestamp(6) with time zone"
      t.bigint :recorded_by_membership_id, null: false
      t.column :recorded_at, "timestamp(6) with time zone", null: false
      t.string :request_key, null: false, limit: 160
      t.string :content_digest, null: false, limit: 64
      t.timestamps
    end

    add_index :clinic_assessment_revisions, %i[practice_id id], unique: true,
      name: "clinic_assessments_practice_id"
    add_index :clinic_assessment_revisions, %i[practice_id patient_id encounter_id id], unique: true,
      name: "clinic_assessments_context_id"
    add_index :clinic_assessment_revisions, %i[practice_id series_id version_number], unique: true,
      name: "clinic_assessments_series_version"
    add_index :clinic_assessment_revisions, %i[practice_id recorded_by_membership_id request_key], unique: true,
      name: "clinic_assessments_request_key"
    add_foreign_key :clinic_assessment_revisions, :clinic_practices,
      column: :practice_id, name: "fk_assessments_practice"
    add_foreign_key :clinic_assessment_revisions, :clinic_patients,
      column: %i[practice_id patient_id], primary_key: %i[practice_id id], name: "fk_assessments_patient"
    add_foreign_key :clinic_assessment_revisions, :clinic_encounters,
      column: %i[practice_id patient_id encounter_id],
      primary_key: %i[practice_id patient_id id], name: "fk_assessments_encounter"
    add_foreign_key :clinic_assessment_revisions, :clinic_sites,
      column: %i[practice_id site_id], primary_key: %i[practice_id id], name: "fk_assessments_site"
    add_foreign_key :clinic_assessment_revisions, :clinic_memberships,
      column: %i[practice_id recorded_by_membership_id],
      primary_key: %i[practice_id id], name: "fk_assessments_membership"
    add_foreign_key :clinic_assessment_revisions, :clinic_assessment_revisions,
      column: %i[practice_id prior_revision_id], primary_key: %i[practice_id id],
      name: "fk_assessments_prior_revision"
    add_check_constraint :clinic_assessment_revisions,
      "status IN ('in_progress','completed','entered_in_error') AND version_number > 0 AND " \
      "category IN ('depression','anxiety','alcohol_use','tobacco_use','social_needs','fall_risk'," \
      "'functional_status','cognitive_status') AND (status <> 'completed' OR assessed_at IS NOT NULL)",
      name: "clinic_assessments_state"
  end
end
