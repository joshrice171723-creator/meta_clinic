class AddPatientRegistrationHistory < ActiveRecord::Migration[8.1]
  def change
    create_patient_child_table :clinic_patient_demographics do |t|
      t.date :date_of_birth
      t.string :sex, null: false
      t.string :primary_language, null: false
      t.boolean :interpreter_required, null: false, default: false
    end
    add_index :clinic_patient_demographics, [ :practice_id, :patient_id ], unique: true, name: "clinic_patient_demographics_identity"
    add_check_constraint :clinic_patient_demographics, "length(trim(primary_language)) > 0", name: "clinic_patient_demographics_language_present"

    create_patient_child_table :clinic_patient_contacts do |t|
      t.string :contact_type, null: false
      t.text :contact_value, null: false
      t.boolean :preferred, null: false, default: false
      t.boolean :appointment_reminders_consent, null: false, default: false
      t.boolean :general_communications_consent, null: false, default: false
      t.column :effective_from, "timestamp(6) with time zone", null: false
      t.column :effective_until, "timestamp(6) with time zone"
    end
    add_check_constraint :clinic_patient_contacts, "contact_type IN ('phone', 'email')", name: "clinic_patient_contacts_type"
    add_check_constraint :clinic_patient_contacts, "effective_until IS NULL OR effective_until > effective_from", name: "clinic_patient_contacts_window"

    create_patient_child_table :clinic_patient_emergency_contacts do |t|
      t.text :name, null: false
      t.string :relationship, null: false
      t.text :phone, null: false
      t.boolean :permission_to_contact, null: false, default: false
      t.column :effective_from, "timestamp(6) with time zone", null: false
      t.column :effective_until, "timestamp(6) with time zone"
    end
    add_check_constraint :clinic_patient_emergency_contacts, "effective_until IS NULL OR effective_until > effective_from", name: "clinic_patient_emergency_contacts_window"

    create_patient_child_table :clinic_patient_communication_preferences do |t|
      t.string :preferred_contact_method, null: false
      t.boolean :appointment_reminders_consent, null: false, default: false
      t.boolean :general_communications_consent, null: false, default: false
    end
    add_index :clinic_patient_communication_preferences, [ :practice_id, :patient_id ], unique: true, name: "clinic_patient_communication_preferences_identity"
    add_check_constraint :clinic_patient_communication_preferences, "preferred_contact_method IN ('text', 'phone', 'email', 'portal')", name: "clinic_patient_communication_preferences_method"

    create_patient_child_table :clinic_patient_social_histories do |t|
      t.text :tobacco_use
      t.text :alcohol_use
      t.text :exercise_habits
      t.text :diet
      t.text :occupation
      t.text :living_situation
      t.text :relevant_social_factors
      t.column :effective_from, "timestamp(6) with time zone", null: false
      t.column :effective_until, "timestamp(6) with time zone"
    end
    add_check_constraint :clinic_patient_social_histories, "effective_until IS NULL OR effective_until > effective_from", name: "clinic_patient_social_histories_window"

    %w[clinic_patient_contacts clinic_patient_emergency_contacts clinic_patient_social_histories].each do |table_name|
      execute <<~SQL
        CREATE TRIGGER #{table_name}_immutable
        BEFORE UPDATE OR DELETE ON #{table_name}
        FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
      SQL
    end
  end

  private

  def create_patient_child_table(name)
    create_table name do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      yield t
      t.timestamps
    end
    add_index name, [ :practice_id, :id ], unique: true, name: "#{name}_practice_id"
    add_foreign_key name, :clinic_practices, column: :practice_id, name: "fk_#{name}_practice"
    add_foreign_key name, :clinic_patients, column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ], name: "fk_#{name}_patient"
    add_index name, [ :practice_id, :patient_id, :created_at ], name: "#{name}_patient_time"
  end
end
