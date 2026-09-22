class AddPsychiatryAssessmentAndControlledSimulation < ActiveRecord::Migration[8.1]
  ASSESSMENT_STATES = %w[not_assessed unknown assessed].freeze
  ATTEMPT_OUTCOMES = %w[failure_before_send rejected acknowledged unknown accepted unavailable revoked duplicate outcome_unknown].freeze
  EVENT_KINDS = %w[review failure_before_send rejected acknowledged unknown accepted unavailable revoked duplicate outcome_unknown cancelled confirmed_not_sent].freeze

  def up
    add_column :clinic_assessment_revisions, :assessment_state, :string, limit: 32, null: false, default: "not_assessed"
    add_column :clinic_assessment_revisions, :item_responses, :jsonb, null: false, default: []
    add_column :clinic_assessment_revisions, :reviewer_membership_id, :bigint
    add_column :clinic_assessment_revisions, :reviewed_at, :timestamptz
    add_foreign_key :clinic_assessment_revisions, :clinic_memberships, column: :reviewer_membership_id
    add_foreign_key :clinic_assessment_revisions, :clinic_memberships,
      column: %i[practice_id reviewer_membership_id], primary_key: %i[practice_id id], name: "assessment_reviewer_tenant"
    add_check_constraint :clinic_assessment_revisions,
      "assessment_state IN (#{ASSESSMENT_STATES.map { |value| connection.quote(value) }.join(', ')}) AND jsonb_typeof(item_responses) = 'array'",
      name: "clinic_assessments_item_contract"
    remove_check_constraint :clinic_assessment_revisions, name: "clinic_assessments_state"
    add_check_constraint :clinic_assessment_revisions,
      "status IN ('in_progress','completed','entered_in_error') AND version_number > 0 AND category IN ('depression','anxiety','alcohol_use','tobacco_use','social_needs','fall_risk','functional_status','cognitive_status','psychiatry_assessment') AND (status <> 'completed' OR assessed_at IS NOT NULL)",
      name: "clinic_assessments_state"

    add_column :clinic_prescription_transmission_attempts, :mode, :string, limit: 32, null: false, default: "standard"
    add_column :clinic_prescription_transmission_attempts, :signer_snapshot, :jsonb, null: false, default: {}
    add_column :clinic_prescription_transmission_attempts, :reviewer_snapshot, :jsonb, null: false, default: {}
    remove_check_constraint :clinic_prescription_transmission_attempts, name: "prescription_transmission_attempt_values"
    add_check_constraint :clinic_prescription_transmission_attempts,
      "adapter = 'simulated_pharmacy_network' AND mode IN ('standard','controlled_test') AND outcome IN (#{ATTEMPT_OUTCOMES.map { |value| connection.quote(value) }.join(', ')}) AND jsonb_typeof(destination_snapshot) = 'object' AND jsonb_typeof(signer_snapshot) = 'object' AND jsonb_typeof(reviewer_snapshot) = 'object'",
      name: "prescription_transmission_attempt_values"
    remove_check_constraint :clinic_prescription_events, name: "prescription_event_kind"
    add_check_constraint :clinic_prescription_events,
      "kind IN (#{EVENT_KINDS.map { |value| connection.quote(value) }.join(', ')})",
      name: "prescription_event_kind"
    remove_check_constraint :clinic_clinical_tasks, name: "clinic_tasks_state_evidence"
    add_check_constraint :clinic_clinical_tasks, <<~SQL.squish, name: "clinic_tasks_state_evidence"
      task_kind IN ('intake','handoff','result_follow_up','patient_call','order_execution','record_request','staff_request','safety_follow_up')
      AND state IN ('open','claimed','in_progress','on_hold','completed','cancelled')
      AND pool_code IN ('clinical','front_desk','records')
      AND source_type IN ('manual','encounter','handoff','lab_follow_up','message','reminder','order')
      AND ((state = 'completed' AND resolution_code IS NOT NULL AND completed_by_membership_id IS NOT NULL AND completed_at IS NOT NULL) OR
        (state <> 'completed' AND resolution_code IS NULL AND completed_by_membership_id IS NULL AND completed_at IS NULL))
    SQL
  end

  def down
    remove_check_constraint :clinic_clinical_tasks, name: "clinic_tasks_state_evidence"
    add_check_constraint :clinic_clinical_tasks, <<~SQL.squish, name: "clinic_tasks_state_evidence"
      task_kind IN ('intake','handoff','result_follow_up','patient_call','order_execution','record_request','staff_request')
      AND state IN ('open','claimed','in_progress','on_hold','completed','cancelled')
      AND pool_code IN ('clinical','front_desk','records')
      AND source_type IN ('manual','encounter','handoff','lab_follow_up','message','reminder','order')
      AND ((state = 'completed' AND resolution_code IS NOT NULL AND completed_by_membership_id IS NOT NULL AND completed_at IS NOT NULL) OR
        (state <> 'completed' AND resolution_code IS NULL AND completed_by_membership_id IS NULL AND completed_at IS NULL))
    SQL
    remove_check_constraint :clinic_prescription_events, name: "prescription_event_kind"
    add_check_constraint :clinic_prescription_events,
      "kind IN ('review','failure_before_send','rejected','acknowledged','unknown','cancelled','confirmed_not_sent')",
      name: "prescription_event_kind"
    remove_check_constraint :clinic_prescription_transmission_attempts, name: "prescription_transmission_attempt_values"
    add_check_constraint :clinic_prescription_transmission_attempts,
      "adapter = 'simulated_pharmacy_network' AND outcome IN ('failure_before_send','rejected','acknowledged','unknown') AND jsonb_typeof(destination_snapshot) = 'object'",
      name: "prescription_transmission_attempt_values"
    remove_column :clinic_prescription_transmission_attempts, :reviewer_snapshot
    remove_column :clinic_prescription_transmission_attempts, :signer_snapshot
    remove_column :clinic_prescription_transmission_attempts, :mode
    remove_check_constraint :clinic_assessment_revisions, name: "clinic_assessments_state"
    add_check_constraint :clinic_assessment_revisions,
      "status IN ('in_progress','completed','entered_in_error') AND version_number > 0 AND category IN ('depression','anxiety','alcohol_use','tobacco_use','social_needs','fall_risk','functional_status','cognitive_status') AND (status <> 'completed' OR assessed_at IS NOT NULL)",
      name: "clinic_assessments_state"
    remove_check_constraint :clinic_assessment_revisions, name: "clinic_assessments_item_contract"
    remove_foreign_key :clinic_assessment_revisions, name: "assessment_reviewer_tenant"
    remove_foreign_key :clinic_assessment_revisions, column: :reviewer_membership_id
    remove_column :clinic_assessment_revisions, :reviewed_at
    remove_column :clinic_assessment_revisions, :reviewer_membership_id
    remove_column :clinic_assessment_revisions, :item_responses
    remove_column :clinic_assessment_revisions, :assessment_state
  end
end
