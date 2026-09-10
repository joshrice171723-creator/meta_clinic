class CreateChartCoverageRecords < ActiveRecord::Migration[8.1]
  def up
    create_requests
    create_fulfillments
    create_plan_and_diagnosis_records
    create_document_reviews
    link_existing_fulfillments
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Chart coverage records contain protected clinical values and require a reviewed forward recovery plan."
  end

  private

  def create_requests
    create_context_table :clinic_medication_requests do |t|
      t.string :status, null: false, default: "draft"
      t.string :priority, null: false, default: "routine"
      t.text :medication_name, null: false
      t.text :dose_text
      t.text :route_text
      t.text :frequency_text
      t.text :reason_text
      t.column :requested_at, "timestamp(6) with time zone", null: false
      t.column :acknowledged_at, "timestamp(6) with time zone"
    end
    add_check_constraint :clinic_medication_requests,
      "status IN ('draft','active','completed','cancelled','not_done')", name: "cc_med_req_status"
    add_check_constraint :clinic_medication_requests,
      "priority IN ('routine','urgent','as_needed')", name: "cc_med_req_priority"
    add_index :clinic_medication_requests, [ :practice_id, :patient_id, :encounter_id, :id ], unique: true,
      name: "cc_med_req_context_id"

    create_context_table :clinic_service_requests do |t|
      t.string :service_kind, null: false
      t.string :status, null: false, default: "draft"
      t.string :priority, null: false, default: "routine"
      t.text :request_text, null: false
      t.text :reason_text
      t.column :requested_at, "timestamp(6) with time zone", null: false
      t.column :acknowledged_at, "timestamp(6) with time zone"
    end
    add_check_constraint :clinic_service_requests,
      "service_kind IN ('lab','imaging','procedure','immunization','referral','other')", name: "cc_service_req_kind"
    add_check_constraint :clinic_service_requests,
      "status IN ('draft','active','in_progress','completed','cancelled','not_done')", name: "cc_service_req_status"
    add_check_constraint :clinic_service_requests,
      "priority IN ('routine','urgent','as_needed')", name: "cc_service_req_priority"
    add_index :clinic_service_requests, [ :practice_id, :patient_id, :id ], unique: true,
      name: "cc_service_req_patient_id"
    add_index :clinic_service_requests, [ :practice_id, :patient_id, :encounter_id, :id ], unique: true,
      name: "cc_service_req_context_id"
  end

  def create_fulfillments
    create_context_table :clinic_procedures do |t|
      t.bigint :service_request_id
      t.string :status, null: false
      t.text :procedure_name, null: false
      t.text :outcome_text
      t.column :performed_at, "timestamp(6) with time zone", null: false
    end
    service_request_fk :clinic_procedures, "fk_cc_procedure_request"
    add_check_constraint :clinic_procedures, "status IN ('completed','not_done')", name: "cc_procedure_status"

    create_context_table :clinic_immunizations do |t|
      t.bigint :service_request_id
      t.string :status, null: false
      t.text :vaccine_name, null: false
      t.text :lot_text
      t.text :site_text
      t.text :outcome_text
      t.column :administered_at, "timestamp(6) with time zone", null: false
    end
    service_request_fk :clinic_immunizations, "fk_cc_immunization_request"
    add_check_constraint :clinic_immunizations, "status IN ('completed','not_done')", name: "cc_immunization_status"
  end

  def create_plan_and_diagnosis_records
    create_context_table :clinic_encounter_diagnoses do |t|
      t.string :status, null: false, default: "draft"
      t.string :code_system
      t.string :code
      t.text :display_text
      t.text :narrative
      t.column :asserted_at, "timestamp(6) with time zone"
      t.bigint :supersedes_id
    end
    add_foreign_key :clinic_encounter_diagnoses, :clinic_encounter_diagnoses, column: :supersedes_id,
      name: "fk_cc_diagnosis_predecessor"
    add_check_constraint :clinic_encounter_diagnoses,
      "status IN ('draft','asserted','entered_in_error')", name: "cc_diagnosis_status"

    create_context_table :clinic_care_plans do |t|
      t.string :status, null: false, default: "draft"
      t.text :title, null: false
      t.text :description
      t.column :reviewed_at, "timestamp(6) with time zone"
    end
    add_check_constraint :clinic_care_plans,
      "status IN ('draft','active','completed','cancelled')", name: "cc_plan_status"

    create_context_table :clinic_goals do |t|
      t.bigint :care_plan_id, null: false
      t.string :status, null: false, default: "not_started"
      t.text :description, null: false
      t.text :outcome_text
      t.column :target_at, "timestamp(6) with time zone"
      t.column :completed_at, "timestamp(6) with time zone"
    end
    add_foreign_key :clinic_goals, :clinic_care_plans, column: [ :practice_id, :care_plan_id ],
      primary_key: [ :practice_id, :id ], name: "fk_cc_goal_plan"
    add_check_constraint :clinic_goals,
      "status IN ('not_started','in_progress','achieved','not_achieved','cancelled')", name: "cc_goal_status"
    add_check_constraint :clinic_goals,
      "(status IN ('achieved','not_achieved') AND completed_at IS NOT NULL) OR (status NOT IN ('achieved','not_achieved') AND completed_at IS NULL)",
      name: "cc_goal_completion_shape"
  end

  def create_document_reviews
    create_context_table :clinic_document_reviews do |t|
      t.bigint :document_id, null: false
      t.string :status, null: false, default: "pending"
      t.text :review_note
      t.column :reviewed_at, "timestamp(6) with time zone"
    end
    add_foreign_key :clinic_document_reviews, :clinic_documents,
      column: [ :practice_id, :document_id ], primary_key: [ :practice_id, :id ],
      name: "fk_cc_document_review_document"
    add_index :clinic_document_reviews, [ :practice_id, :document_id ], unique: true, name: "cc_document_review_once"
    add_check_constraint :clinic_document_reviews,
      "status IN ('pending','reviewed','follow_up_needed','not_applicable')", name: "cc_document_review_status"
    add_check_constraint :clinic_document_reviews,
      "(status IN ('reviewed','follow_up_needed') AND reviewed_at IS NOT NULL) OR (status IN ('pending','not_applicable') AND reviewed_at IS NULL)",
      name: "cc_document_review_shape"
  end

  def link_existing_fulfillments
    add_column :clinic_medication_administrations, :medication_request_id, :bigint
    add_foreign_key :clinic_medication_administrations, :clinic_medication_requests,
      column: [ :practice_id, :patient_id, :encounter_id, :medication_request_id ],
      primary_key: [ :practice_id, :patient_id, :encounter_id, :id ], name: "fk_med_admin_request"
    add_index :clinic_medication_administrations, [ :practice_id, :medication_request_id ], name: "med_admin_request_lookup"

    add_column :clinic_lab_reports, :service_request_id, :bigint
    add_foreign_key :clinic_lab_reports, :clinic_service_requests,
      column: [ :practice_id, :patient_id, :service_request_id ], primary_key: [ :practice_id, :patient_id, :id ],
      name: "fk_lab_report_service_request"
    add_index :clinic_lab_reports, [ :practice_id, :service_request_id ], name: "lab_report_service_request_lookup"
  end

  def create_context_table(name)
    create_table name do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :encounter_id
      t.bigint :site_id
      t.bigint :recorded_by_membership_id, null: false
      t.bigint :updated_by_membership_id, null: false
      t.integer :lock_version, null: false, default: 0
      yield t
      t.timestamps
    end
    add_index name, [ :practice_id, :id ], unique: true, name: "#{name}_practice_id"
    add_index name, [ :practice_id, :patient_id, :encounter_id, :status ], name: "#{name}_context_status"
    add_foreign_key name, :clinic_practices, column: :practice_id, name: "fk_#{name}_practice"
    add_foreign_key name, :clinic_patients, column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ], name: "fk_#{name}_patient"
    add_foreign_key name, :clinic_encounters, column: [ :practice_id, :patient_id, :encounter_id ], primary_key: [ :practice_id, :patient_id, :id ], name: "fk_#{name}_encounter"
    add_foreign_key name, :clinic_sites, column: [ :practice_id, :site_id ], primary_key: [ :practice_id, :id ], name: "fk_#{name}_site"
    membership_fk name, :recorded_by_membership_id, "fk_#{name}_recorded"
    membership_fk name, :updated_by_membership_id, "fk_#{name}_updated"
    add_check_constraint name, "lock_version >= 0", name: "#{name}_lock_version"
  end

  def membership_fk(table, column, name)
    add_foreign_key table, :clinic_memberships, column: [ :practice_id, column ], primary_key: [ :practice_id, :id ], name: name
  end

  def service_request_fk(table, name)
    add_foreign_key table, :clinic_service_requests, column: [ :practice_id, :patient_id, :encounter_id, :service_request_id ],
      primary_key: [ :practice_id, :patient_id, :encounter_id, :id ], name: name
  end
end
