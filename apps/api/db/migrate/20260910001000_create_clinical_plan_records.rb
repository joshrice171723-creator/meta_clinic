class CreateClinicalPlanRecords < ActiveRecord::Migration[8.1]
  def change
    add_index :clinic_encounters, %i[practice_id patient_id site_id id], unique: true,
      name: "clinic_encounters_context_site_id"
    add_index :clinic_medication_statements, %i[practice_id patient_id id], unique: true,
      name: "clinic_medication_statements_context_id"
    add_column :clinic_clinical_tasks, :source_kind, :string, limit: 40
    add_check_constraint :clinic_clinical_tasks,
      "source_kind IS NULL OR source_kind IN ('medication_request','service_request')",
      name: "clinic_tasks_source_kind"
    add_index :clinic_clinical_tasks, %i[practice_id source_type source_kind source_id], unique: true,
      where: "source_type = 'order' AND source_kind IS NOT NULL AND state IN ('open','claimed','in_progress')",
      name: "clinic_tasks_active_order_source"

    create_revision_table(:clinic_medication_request_revisions, "med_request") do |t|
      t.string :intent, null: false, limit: 32
      t.string :transmission_state, null: false, limit: 32
      t.text :medication_name, null: false
      t.text :dose_text
      t.text :route_text
      t.text :frequency_text
      t.text :quantity_text
      t.text :instructions
      t.bigint :source_medication_statement_id
    end
    add_check_constraint :clinic_medication_request_revisions,
      "status IN ('draft','authorized','on_hold','completed','cancelled','entered_in_error') AND " \
      "intent IN ('proposal','plan','order') AND " \
      "transmission_state IN ('not_requested','pending','accepted','rejected','failed','unknown')",
      name: "clinic_med_request_states"
    add_foreign_key :clinic_medication_request_revisions, :clinic_medication_statements,
      column: %i[practice_id patient_id source_medication_statement_id],
      primary_key: %i[practice_id patient_id id], name: "fk_med_request_source_statement"

    create_revision_table(:clinic_service_request_revisions, "service_request") do |t|
      t.string :request_kind, null: false, limit: 32
      t.string :intent, null: false, limit: 32
      t.string :priority, null: false, limit: 32
      t.text :requested_code_system
      t.text :requested_code
      t.text :requested_display, null: false
      t.text :destination
      t.text :reason_text
      t.column :due_at, "timestamp(6) with time zone"
    end
    add_check_constraint :clinic_service_request_revisions,
      "status IN ('draft','active','on_hold','completed','cancelled','entered_in_error') AND " \
      "request_kind IN ('lab','imaging','procedure','referral','therapy','other') AND " \
      "intent IN ('proposal','plan','order') AND priority IN ('routine','urgent','asap','stat')",
      name: "clinic_service_request_states"

    create_revision_table(:clinic_encounter_diagnosis_revisions, "diagnosis") do |t|
      t.string :classification, null: false, limit: 32
      t.text :code_system
      t.text :diagnosis_code
      t.text :diagnosis_display, null: false
      t.text :clinical_note
    end
    add_check_constraint :clinic_encounter_diagnosis_revisions,
      "status IN ('draft','provisional','confirmed','refuted','resolved','entered_in_error') AND " \
      "classification IN ('primary','secondary','differential','historical')",
      name: "clinic_diagnosis_states"

    create_revision_table(:clinic_procedure_revisions, "procedure") do |t|
      t.text :code_system
      t.text :procedure_code
      t.text :procedure_display, null: false
      t.column :performed_at, "timestamp(6) with time zone"
      t.text :outcome_text
      t.string :complication_state, null: false, limit: 32
      t.text :complication_text
      t.bigint :service_request_revision_id
    end
    add_check_constraint :clinic_procedure_revisions,
      "status IN ('planned','in_progress','completed','not_done','entered_in_error') AND " \
      "complication_state IN ('not_assessed','none_reported','known','unknown','unable_to_obtain')",
      name: "clinic_procedure_states"
    add_foreign_key :clinic_procedure_revisions, :clinic_service_request_revisions,
      column: %i[practice_id patient_id encounter_id service_request_revision_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_procedure_service_request"

    create_revision_table(:clinic_care_plan_revisions, "care_plan") do |t|
      t.text :title, null: false
      t.text :description
      t.date :starts_on
      t.date :ends_on
    end
    add_check_constraint :clinic_care_plan_revisions,
      "status IN ('draft','active','on_hold','completed','cancelled','entered_in_error') AND " \
      "(starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on)",
      name: "clinic_care_plan_states"

    create_revision_table(:clinic_care_goal_revisions, "care_goal") do |t|
      t.bigint :care_plan_revision_id, null: false
      t.text :description, null: false
      t.text :outcome_text
      t.date :target_on
    end
    add_check_constraint :clinic_care_goal_revisions,
      "status IN ('proposed','active','achieved','not_achieved','cancelled','entered_in_error')",
      name: "clinic_care_goal_states"
    add_foreign_key :clinic_care_goal_revisions, :clinic_care_plan_revisions,
      column: %i[practice_id patient_id encounter_id care_plan_revision_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_care_goal_plan_revision"

    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE FUNCTION clinic_clinical_revision_protect() RETURNS trigger
          LANGUAGE plpgsql AS $$
          BEGIN
            RAISE EXCEPTION 'Clinical plan revision history is immutable';
          END;
          $$;
        SQL
        revision_tables.each do |table|
          execute <<~SQL
            CREATE TRIGGER #{table}_protect
            BEFORE UPDATE OR DELETE ON #{table}
            FOR EACH ROW EXECUTE FUNCTION clinic_clinical_revision_protect();
          SQL
        end
      end
      direction.down do
        execute "DROP FUNCTION IF EXISTS clinic_clinical_revision_protect() CASCADE"
      end
    end
  end

  private

  def create_revision_table(table, prefix)
    create_table table do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :site_id, null: false
      t.uuid :series_id, null: false, default: -> { "gen_random_uuid()" }
      t.integer :version_number, null: false
      t.bigint :prior_revision_id
      t.string :status, null: false, limit: 32
      t.bigint :recorded_by_membership_id, null: false
      t.column :recorded_at, "timestamp(6) with time zone", null: false
      t.string :request_key, null: false, limit: 160
      t.string :content_digest, null: false, limit: 64
      yield t
      t.timestamps
    end

    add_index table, %i[practice_id id], unique: true, name: "#{prefix}_practice_id"
    add_index table, %i[practice_id patient_id encounter_id id], unique: true,
      name: "#{prefix}_context_id"
    add_index table, %i[practice_id encounter_id series_id version_number], unique: true,
      name: "#{prefix}_series_version"
    add_index table, %i[practice_id recorded_by_membership_id request_key], unique: true,
      name: "#{prefix}_request_key"
    add_foreign_key table, :clinic_practices, column: :practice_id, name: "fk_#{prefix}_practice"
    add_foreign_key table, :clinic_patients, column: %i[practice_id patient_id],
      primary_key: %i[practice_id id], name: "fk_#{prefix}_patient"
    add_foreign_key table, :clinic_encounters,
      column: %i[practice_id patient_id site_id encounter_id],
      primary_key: %i[practice_id patient_id site_id id], name: "fk_#{prefix}_encounter_site"
    add_foreign_key table, :clinic_memberships,
      column: %i[practice_id recorded_by_membership_id], primary_key: %i[practice_id id],
      name: "fk_#{prefix}_recorder"
    add_foreign_key table, table,
      column: %i[practice_id patient_id encounter_id prior_revision_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_#{prefix}_prior_revision"
    add_check_constraint table,
      "version_number > 0 AND length(content_digest) = 64 AND length(request_key) BETWEEN 1 AND 160",
      name: "#{prefix}_revision_values"
  end

  def revision_tables
    %w[
      clinic_medication_request_revisions clinic_service_request_revisions
      clinic_encounter_diagnosis_revisions clinic_procedure_revisions
      clinic_care_plan_revisions clinic_care_goal_revisions
    ]
  end
end
