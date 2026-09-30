class AddPrescriptionSubstitutionInstruction < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_medication_request_revisions, :substitution_instruction, :string
    add_check_constraint :clinic_medication_request_revisions,
      "substitution_instruction IS NULL OR substitution_instruction IN ('allowed', 'not_allowed')",
      name: "medication_request_substitution_instruction"
  end
end
