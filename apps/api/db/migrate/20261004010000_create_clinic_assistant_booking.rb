class CreateClinicAssistantBooking < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_assistant_contexts do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.references :actor_user, null: false, foreign_key: { to_table: :users }
      t.references :membership, null: false, foreign_key: { to_table: :clinic_memberships }
      t.references :member_session, null: false, foreign_key: true
      t.references :site, null: false, foreign_key: { to_table: :clinic_sites }
      t.references :patient, null: false, foreign_key: { to_table: :clinic_patients }
      t.references :encounter, foreign_key: { to_table: :clinic_encounters }
      t.uuid :public_id, null: false, default: -> { "gen_random_uuid()" }
      t.integer :authorization_generation, null: false
      t.jsonb :session_context, null: false, default: {}
      t.jsonb :selection_options, null: false, default: {}
      t.jsonb :opening_options, null: false, default: []
      t.datetime :expires_at, null: false
      t.datetime :invalidated_at
      t.timestamps
    end
    add_index :clinic_assistant_contexts, :public_id, unique: true
    add_index :clinic_assistant_contexts, [ :practice_id, :actor_user_id, :created_at ], name: "idx_assistant_context_actor"
    add_check_constraint :clinic_assistant_contexts,
      "authorization_generation >= 0 AND jsonb_typeof(session_context) = 'object' AND jsonb_typeof(selection_options) = 'object' AND jsonb_typeof(opening_options) = 'array' AND (invalidated_at IS NULL OR invalidated_at >= created_at)",
      name: "clinic_assistant_context_values"

    create_table :clinic_assistant_booking_proposals do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.references :assistant_context, null: false, foreign_key: { to_table: :clinic_assistant_contexts }
      t.references :actor_user, null: false, foreign_key: { to_table: :users }
      t.references :membership, null: false, foreign_key: { to_table: :clinic_memberships }
      t.references :site, null: false, foreign_key: { to_table: :clinic_sites }
      t.references :patient, null: false, foreign_key: { to_table: :clinic_patients }
      t.references :visit_type, null: false, foreign_key: { to_table: :clinic_visit_types }
      t.references :booked_clinician, null: false, foreign_key: { to_table: :clinic_clinician_profiles }
      t.references :room, foreign_key: { to_table: :clinic_rooms }
      t.references :appointment, foreign_key: { to_table: :clinic_appointments }
      t.uuid :public_id, null: false, default: -> { "gen_random_uuid()" }
      t.string :status, null: false, default: "pending"
      t.string :visit_modality, null: false, default: "in_person"
      t.datetime :starts_at, null: false
      t.datetime :ends_at, null: false
      t.jsonb :arguments, null: false, default: {}
      t.jsonb :record_versions, null: false, default: {}
      t.datetime :expires_at, null: false
      t.datetime :confirmed_at
      t.timestamps
    end
    add_index :clinic_assistant_booking_proposals, :public_id, unique: true
    add_index :clinic_assistant_booking_proposals, [ :practice_id, :actor_user_id, :created_at ], name: "idx_assistant_proposal_actor"
    add_index :clinic_assistant_booking_proposals, [ :assistant_context_id, :status ]
    add_index :clinic_assistant_booking_proposals, :appointment_id, unique: true, where: "appointment_id IS NOT NULL",
      name: "idx_assistant_proposal_appointment"
    add_check_constraint :clinic_assistant_booking_proposals,
      "status IN ('pending','confirmed','expired','invalidated','conflicted') AND visit_modality IN ('in_person','video') AND ends_at > starts_at AND jsonb_typeof(arguments) = 'object' AND jsonb_typeof(record_versions) = 'object' AND ((status = 'confirmed') = (confirmed_at IS NOT NULL AND appointment_id IS NOT NULL))",
      name: "clinic_assistant_proposal_values"
  end
end
