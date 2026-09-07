class LinkScribeToClinicalRecords < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_scribe_encounters, :clinical_encounter_id, :bigint
    add_index :clinic_scribe_encounters, %i[practice_id patient_id id], unique: true,
      name: "clinic_scribe_encounters_practice_patient_id"
    add_index :clinic_scribe_encounters, %i[practice_id clinical_encounter_id],
      name: "clinic_scribe_encounters_clinical_encounter"
    add_foreign_key :clinic_scribe_encounters, :clinic_encounters,
      column: %i[practice_id patient_id clinical_encounter_id], primary_key: %i[practice_id patient_id id],
      name: "fk_scribe_encounters_clinical_encounter"

    create_table :clinic_scribe_lab_selections do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :lab_report_version_id, null: false
      t.bigint :selected_by_id, null: false
      t.datetime :selected_at, null: false
      t.timestamps
    end
    add_index :clinic_scribe_lab_selections, %i[practice_id id], unique: true,
      name: "clinic_scribe_lab_selections_practice_id"
    add_index :clinic_scribe_lab_selections, %i[practice_id encounter_id lab_report_version_id], unique: true,
      name: "clinic_scribe_lab_selections_identity"
    add_foreign_key :clinic_scribe_lab_selections, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_scribe_lab_selections, :clinic_patients,
      column: %i[practice_id patient_id], primary_key: %i[practice_id id],
      name: "fk_scribe_lab_selections_patient"
    add_foreign_key :clinic_scribe_lab_selections, :clinic_scribe_encounters,
      column: %i[practice_id patient_id encounter_id], primary_key: %i[practice_id patient_id id],
      name: "fk_scribe_lab_selections_encounter"
    add_foreign_key :clinic_scribe_lab_selections, :clinic_lab_report_versions,
      column: %i[practice_id patient_id lab_report_version_id], primary_key: %i[practice_id patient_id id],
      name: "fk_scribe_lab_selections_version"
    add_foreign_key :clinic_scribe_lab_selections, :users, column: :selected_by_id

    add_column :clinic_scribe_exports, :encounter_note_id, :bigint
    add_column :clinic_scribe_exports, :encounter_note_revision_id, :bigint
    add_index :clinic_scribe_exports, %i[practice_id encounter_note_id],
      name: "clinic_scribe_exports_encounter_note"
    add_foreign_key :clinic_scribe_exports, :clinic_encounter_notes,
      column: %i[practice_id encounter_note_id], primary_key: %i[practice_id id],
      name: "fk_scribe_exports_encounter_note"
    add_foreign_key :clinic_scribe_exports, :clinic_encounter_note_revisions,
      column: %i[practice_id encounter_note_id encounter_note_revision_id], primary_key: %i[practice_id note_id id],
      name: "fk_scribe_exports_encounter_note_revision"
    add_check_constraint :clinic_scribe_exports,
      "(encounter_note_id IS NULL) = (encounter_note_revision_id IS NULL)",
      name: "scribe_exports_chart_links_together"
  end
end
