class RepairPatientCareSummaryRecords < ActiveRecord::Migration[8.1]
  def up
    repair_conditions
    repair_allergies
    repair_medication_statements
    create_patient_care_needs unless table_exists?(:clinic_patient_care_needs)
    create_encounter_precautions unless table_exists?(:clinic_encounter_precautions)
    create_patient_history_reviews unless table_exists?(:clinic_patient_history_reviews)
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Patient care details may contain encrypted clinical history; use a reviewed forward migration."
  end

  private

  def repair_conditions
    add_common_record_columns(:clinic_conditions)
    add_column_if_missing :clinic_conditions, :condition_name, :text
    add_column_if_missing :clinic_conditions, :clinical_status, :string, null: false, default: "unknown"
    add_column_if_missing :clinic_conditions, :verification_status, :string, null: false, default: "unconfirmed"
    add_column_if_missing :clinic_conditions, :affects_current_care, :boolean, null: false, default: false
    add_column_if_missing :clinic_conditions, :care_instruction, :text
    add_time_column_if_missing :clinic_conditions, :onset_at
    add_time_column_if_missing :clinic_conditions, :resolved_at
    add_check_if_missing :clinic_conditions, "clinical_status IN ('active','inactive','resolved','unknown','entered_in_error')", "clinic_conditions_clinical_status"
    add_check_if_missing :clinic_conditions, "verification_status IN ('unconfirmed','provisional','confirmed','refuted','entered_in_error')", "clinic_conditions_verification"
    add_check_if_missing :clinic_conditions, "data_status = 'incomplete' OR (condition_name IS NOT NULL AND recorded_by_membership_id IS NOT NULL AND recorded_at IS NOT NULL)", "clinic_conditions_recorded_shape"
    add_check_if_missing :clinic_conditions, "resolved_at IS NULL OR onset_at IS NULL OR resolved_at >= onset_at", "clinic_conditions_valid_window"
  end

  def repair_allergies
    add_common_record_columns(:clinic_allergies)
    add_column_if_missing :clinic_allergies, :allergen_name, :text
    add_column_if_missing :clinic_allergies, :reaction, :text
    add_column_if_missing :clinic_allergies, :category, :string, null: false, default: "unknown"
    add_column_if_missing :clinic_allergies, :clinical_status, :string, null: false, default: "unknown"
    add_column_if_missing :clinic_allergies, :verification_status, :string, null: false, default: "unconfirmed"
    add_column_if_missing :clinic_allergies, :criticality, :string, null: false, default: "unable_to_assess"
    add_column_if_missing :clinic_allergies, :severity, :string, null: false, default: "unknown"
    add_time_column_if_missing :clinic_allergies, :onset_at
    add_check_if_missing :clinic_allergies, "category IN ('food','medication','environment','biologic','other','unknown')", "clinic_allergies_category"
    add_check_if_missing :clinic_allergies, "clinical_status IN ('active','inactive','resolved','unknown','entered_in_error')", "clinic_allergies_clinical_status"
    add_check_if_missing :clinic_allergies, "verification_status IN ('unconfirmed','presumed','confirmed','refuted','entered_in_error')", "clinic_allergies_verification"
    add_check_if_missing :clinic_allergies, "criticality IN ('low','high','unable_to_assess')", "clinic_allergies_criticality"
    add_check_if_missing :clinic_allergies, "severity IN ('mild','moderate','severe','unknown')", "clinic_allergies_severity"
    add_check_if_missing :clinic_allergies, "data_status = 'incomplete' OR (allergen_name IS NOT NULL AND recorded_by_membership_id IS NOT NULL AND recorded_at IS NOT NULL)", "clinic_allergies_recorded_shape"
  end

  def repair_medication_statements
    add_common_record_columns(:clinic_medication_statements)
    add_column_if_missing :clinic_medication_statements, :medication_name, :text
    add_column_if_missing :clinic_medication_statements, :dose_text, :text
    add_column_if_missing :clinic_medication_statements, :route_text, :text
    add_column_if_missing :clinic_medication_statements, :frequency_text, :text
    add_column_if_missing :clinic_medication_statements, :purpose, :text
    add_column_if_missing :clinic_medication_statements, :status, :string, null: false, default: "unknown"
    add_column_if_missing :clinic_medication_statements, :information_source, :string, null: false, default: "unknown"
    add_time_column_if_missing :clinic_medication_statements, :effective_from
    add_time_column_if_missing :clinic_medication_statements, :effective_until
    add_time_column_if_missing :clinic_medication_statements, :asserted_at
    add_check_if_missing :clinic_medication_statements, "status IN ('active','completed','on_hold','stopped','not_taken','unknown','entered_in_error')", "clinic_medication_statements_status"
    add_check_if_missing :clinic_medication_statements, "information_source IN ('patient','caregiver','clinician','external_record','other','unknown')", "clinic_medication_statements_source"
    add_check_if_missing :clinic_medication_statements, "data_status = 'incomplete' OR (medication_name IS NOT NULL AND recorded_by_membership_id IS NOT NULL AND recorded_at IS NOT NULL)", "clinic_medication_recorded_shape"
    add_check_if_missing :clinic_medication_statements, "effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from", "clinic_medication_valid_window"
  end

  def add_common_record_columns(table)
    add_column_if_missing table, :data_status, :string, null: false, default: "incomplete"
    add_column_if_missing table, :recorded_by_membership_id, :bigint
    add_column_if_missing table, :reviewed_by_membership_id, :bigint
    add_time_column_if_missing table, :recorded_at
    add_time_column_if_missing table, :last_reviewed_at
    add_column_if_missing table, :lock_version, :integer, null: false, default: 0
    add_foreign_key_if_missing table, :clinic_memberships, [ :practice_id, :recorded_by_membership_id ], [ :practice_id, :id ], "fk_#{table}_recorder"
    add_foreign_key_if_missing table, :clinic_memberships, [ :practice_id, :reviewed_by_membership_id ], [ :practice_id, :id ], "fk_#{table}_reviewer"
    add_index_if_missing table, [ :practice_id, :patient_id, :data_status ], "#{table}_patient_data_status"
    add_check_if_missing table, "data_status IN ('incomplete','recorded')", "#{table}_data_status"
    add_check_if_missing table, "(last_reviewed_at IS NULL AND reviewed_by_membership_id IS NULL) OR (last_reviewed_at IS NOT NULL AND reviewed_by_membership_id IS NOT NULL)", "#{table}_review_pair"
    add_check_if_missing table, "lock_version >= 0", "#{table}_lock_version"
  end

  def create_patient_care_needs
    create_tenant_table :clinic_patient_care_needs do |t|
      t.bigint :patient_id, null: false
      t.string :category, null: false
      t.string :need_code, null: false
      t.text :description, null: false
      t.text :instructions
      t.string :status, null: false, default: "active"
      t.column :effective_from, "timestamp(6) with time zone", null: false
      t.column :effective_until, "timestamp(6) with time zone"
      t.bigint :recorded_by_membership_id, null: false
      t.column :recorded_at, "timestamp(6) with time zone", null: false
      t.bigint :reviewed_by_membership_id
      t.column :last_reviewed_at, "timestamp(6) with time zone"
      t.integer :lock_version, null: false, default: 0
    end
    patient_fk :clinic_patient_care_needs
    membership_fk :clinic_patient_care_needs, :recorded_by_membership_id, "fk_care_needs_recorder"
    membership_fk :clinic_patient_care_needs, :reviewed_by_membership_id, "fk_care_needs_reviewer"
    add_index_if_missing :clinic_patient_care_needs, [ :practice_id, :patient_id, :status, :category ], "clinic_care_needs_active_lookup"
    add_check_if_missing :clinic_patient_care_needs, "category IN ('communication','accessibility','mobility','equipment','decision_support','other')", "clinic_care_needs_category"
    add_check_if_missing :clinic_patient_care_needs, "need_code IN ('spoken_language_interpreter','sign_language_interpreter','hearing_assistance','vision_assistance','communication_device','wheelchair_access','transfer_assistance','mobility_assistance','service_animal','support_person','cognitive_support','supplemental_oxygen','other')", "clinic_care_needs_code"
    add_check_if_missing :clinic_patient_care_needs, "status IN ('active','inactive','entered_in_error')", "clinic_care_needs_status"
    add_check_if_missing :clinic_patient_care_needs, "effective_until IS NULL OR effective_until > effective_from", "clinic_care_needs_valid_window"
    add_check_if_missing :clinic_patient_care_needs, "(last_reviewed_at IS NULL AND reviewed_by_membership_id IS NULL) OR (last_reviewed_at IS NOT NULL AND reviewed_by_membership_id IS NOT NULL)", "clinic_care_needs_review_pair"
    add_check_if_missing :clinic_patient_care_needs, "lock_version >= 0", "clinic_care_needs_lock_version"
    preserve_identity_if_missing :clinic_patient_care_needs, %w[practice_id patient_id recorded_by_membership_id recorded_at effective_from]
  end

  def create_encounter_precautions
    create_tenant_table :clinic_encounter_precautions do |t|
      t.bigint :patient_id, null: false
      t.bigint :encounter_id, null: false
      t.string :precaution_type, null: false
      t.string :evidence_status, null: false
      t.string :status, null: false, default: "active"
      t.text :instructions
      t.bigint :recorded_by_membership_id, null: false
      t.column :recorded_at, "timestamp(6) with time zone", null: false
      t.bigint :reassessed_by_membership_id
      t.column :last_reassessed_at, "timestamp(6) with time zone"
      t.column :ended_at, "timestamp(6) with time zone"
      t.integer :lock_version, null: false, default: 0
    end
    patient_fk :clinic_encounter_precautions
    add_foreign_key_if_missing :clinic_encounter_precautions, :clinic_encounters, [ :practice_id, :patient_id, :encounter_id ], [ :practice_id, :patient_id, :id ], "fk_encounter_precautions_encounter"
    membership_fk :clinic_encounter_precautions, :recorded_by_membership_id, "fk_precautions_recorder"
    membership_fk :clinic_encounter_precautions, :reassessed_by_membership_id, "fk_precautions_reassessor"
    add_index_if_missing :clinic_encounter_precautions, [ :practice_id, :encounter_id, :status, :recorded_at ], "clinic_precautions_encounter_status"
    add_check_if_missing :clinic_encounter_precautions, "precaution_type IN ('contact','droplet','airborne','protective','other')", "clinic_precautions_type"
    add_check_if_missing :clinic_encounter_precautions, "evidence_status IN ('suspected','confirmed')", "clinic_precautions_evidence"
    add_check_if_missing :clinic_encounter_precautions, "status IN ('active','discontinued','entered_in_error')", "clinic_precautions_status"
    add_check_if_missing :clinic_encounter_precautions, "(last_reassessed_at IS NULL AND reassessed_by_membership_id IS NULL) OR (last_reassessed_at IS NOT NULL AND reassessed_by_membership_id IS NOT NULL)", "clinic_precautions_reassessment_pair"
    add_check_if_missing :clinic_encounter_precautions, "ended_at IS NULL OR ended_at >= recorded_at", "clinic_precautions_valid_window"
    add_check_if_missing :clinic_encounter_precautions, "status <> 'discontinued' OR ended_at IS NOT NULL", "clinic_precautions_discontinued_at"
    add_check_if_missing :clinic_encounter_precautions, "lock_version >= 0", "clinic_precautions_lock_version"
    preserve_identity_if_missing :clinic_encounter_precautions, %w[practice_id patient_id encounter_id recorded_by_membership_id recorded_at]
  end

  def create_patient_history_reviews
    create_tenant_table :clinic_patient_history_reviews do |t|
      t.bigint :patient_id, null: false
      t.bigint :encounter_id, null: false
      t.string :topic, null: false
      t.string :outcome, null: false
      t.string :information_source, null: false
      t.text :notes
      t.bigint :reviewer_membership_id, null: false
      t.column :reviewed_at, "timestamp(6) with time zone", null: false
      t.string :request_key, null: false
    end
    patient_fk :clinic_patient_history_reviews
    add_foreign_key_if_missing :clinic_patient_history_reviews, :clinic_encounters, [ :practice_id, :patient_id, :encounter_id ], [ :practice_id, :patient_id, :id ], "fk_history_reviews_encounter"
    membership_fk :clinic_patient_history_reviews, :reviewer_membership_id, "fk_history_reviews_reviewer"
    add_index_if_missing :clinic_patient_history_reviews, [ :practice_id, :request_key ], "clinic_history_reviews_request_key", unique: true
    add_index_if_missing :clinic_patient_history_reviews, [ :practice_id, :patient_id, :encounter_id, :topic, :reviewed_at ], "clinic_history_reviews_latest"
    add_check_if_missing :clinic_patient_history_reviews, "topic IN ('allergies','medications','care_needs')", "clinic_history_reviews_topic"
    add_check_if_missing :clinic_patient_history_reviews, "outcome IN ('current_list_confirmed','none_reported','follow_up_needed','unable_to_obtain')", "clinic_history_reviews_outcome"
    add_check_if_missing :clinic_patient_history_reviews, "information_source IN ('patient','caregiver','clinician','external_record','other')", "clinic_history_reviews_source"
    add_check_if_missing :clinic_patient_history_reviews, "length(trim(request_key)) > 0", "clinic_history_reviews_request_present"
    execute <<~SQL unless trigger_exists?("clinic_patient_history_reviews_immutable")
      CREATE TRIGGER clinic_patient_history_reviews_immutable
      BEFORE UPDATE OR DELETE ON clinic_patient_history_reviews
      FOR EACH ROW EXECUTE FUNCTION erd_immutable_record()
    SQL
  end

  def create_tenant_table(name)
    create_table name do |t|
      t.bigint :practice_id, null: false
      yield t
      t.timestamps
    end
    add_index name, [ :practice_id, :id ], unique: true, name: "#{name}_practice_id"
    add_foreign_key name, :clinic_practices, column: :practice_id, name: "fk_#{name}_practice"
  end

  def patient_fk(table)
    add_foreign_key_if_missing table, :clinic_patients, [ :practice_id, :patient_id ], [ :practice_id, :id ], "fk_#{table}_patient"
  end

  def membership_fk(table, column, name)
    add_foreign_key_if_missing table, :clinic_memberships, [ :practice_id, column ], [ :practice_id, :id ], name
  end

  def add_column_if_missing(table, column, type, **options)
    add_column table, column, type, **options unless column_exists?(table, column)
  end

  def add_time_column_if_missing(table, column)
    add_column_if_missing table, column, "timestamp(6) with time zone"
  end

  def add_index_if_missing(table, columns, name, unique: false)
    add_index table, columns, name: name, unique: unique unless index_exists?(table, columns, name: name)
  end

  def add_check_if_missing(table, expression, name)
    add_check_constraint table, expression, name: name unless check_constraint_exists?(table, name: name)
  end

  def add_foreign_key_if_missing(table, target, columns, primary_key, name)
    add_foreign_key table, target, column: columns, primary_key: primary_key, name: name unless foreign_key_exists?(table, target, name: name)
  end

  def preserve_identity_if_missing(table, fields)
    return if trigger_exists?("#{table}_preserve_identity")

    arguments = fields.map { |field| connection.quote(field) }.join(", ")
    execute <<~SQL
      CREATE TRIGGER #{table}_preserve_identity
      BEFORE UPDATE ON #{table}
      FOR EACH ROW EXECUTE FUNCTION erd_preserve_identity(#{arguments})
    SQL
  end

  def trigger_exists?(name)
    connection.select_value(<<~SQL.squish).present?
      SELECT 1 FROM pg_trigger
      WHERE tgname = #{connection.quote(name)} AND NOT tgisinternal
    SQL
  end
end
