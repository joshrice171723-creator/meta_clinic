class AddQueueProviderAssignmentGuards < ActiveRecord::Migration[8.1]
  def change
    unless column_exists?(:clinic_clinician_profiles, :display_name)
      add_column :clinic_clinician_profiles, :display_name, :text
    end
    unless index_exists?(:clinic_encounter_participants, name: "clinic_participants_encounter_lookup")
      add_index :clinic_encounter_participants, [ :practice_id, :encounter_id ],
        name: "clinic_participants_encounter_lookup"
    end
    unless index_exists?(:clinic_encounter_participants, name: "clinic_participants_one_current_queue_provider")
      add_index :clinic_encounter_participants, [ :practice_id, :encounter_id ], unique: true,
        where: "participation_role = 'queue_provider' AND effective_until IS NULL",
        name: "clinic_participants_one_current_queue_provider"
    end
  end
end
