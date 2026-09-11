class HardenImmunizationAdministrationEvidence < ActiveRecord::Migration[8.1]
  def up
    add_column :clinic_immunization_revisions, :manufacturer_mvx_code, :text
    add_column :clinic_immunization_revisions, :lot_expiration_date, :date
    add_column :clinic_immunization_revisions, :vis_edition_date, :date
    add_column :clinic_immunization_revisions, :vis_given_date, :date

    if check_constraint_exists?(:clinic_immunization_revisions, name: "clinic_immunization_admin_evidence")
      remove_check_constraint :clinic_immunization_revisions, name: "clinic_immunization_admin_evidence"
    end
    add_check_constraint :clinic_immunization_revisions, <<~SQL.squish,
      status = 'entered_in_error' OR (
        (source_document_id IS NULL OR occurrence_source IN ('external_record','registry')) AND
        (
          (vis_edition_date IS NULL AND vis_given_date IS NULL) OR
          (status = 'completed' AND occurrence_source = 'administered_here' AND
            vis_edition_date IS NOT NULL AND vis_given_date IS NOT NULL)
        ) AND
        (lot_expiration_date IS NULL OR
          (administered_at IS NOT NULL AND lot_expiration_date >= administered_at::date)) AND
        (vis_edition_date IS NULL OR
          (vis_edition_date <= vis_given_date AND vis_given_date <= administered_at::date)) AND
        (
          (status = 'planned' AND administered_at IS NULL AND medication_administration_id IS NULL AND
            refusal_reason IS NULL AND lot_number IS NULL AND lot_expiration_date IS NULL AND
            vis_edition_date IS NULL AND vis_given_date IS NULL) OR
          (status = 'not_done' AND administered_at IS NULL AND medication_administration_id IS NULL AND
            refusal_reason IS NOT NULL AND lot_number IS NULL AND lot_expiration_date IS NULL AND
            vis_edition_date IS NULL AND vis_given_date IS NULL) OR
          (status = 'completed' AND administered_at IS NOT NULL AND cvx_code IS NOT NULL AND (
            (occurrence_source = 'administered_here' AND medication_administration_id IS NOT NULL AND
              manufacturer IS NOT NULL AND lot_number IS NOT NULL AND lot_expiration_date IS NOT NULL AND
              source_document_id IS NULL) OR
            (occurrence_source <> 'administered_here' AND medication_administration_id IS NULL)
          ))
        )
      )
    SQL
      name: "clinic_immunization_evidence_v2", validate: false
  end

  def down
    remove_check_constraint :clinic_immunization_revisions, name: "clinic_immunization_evidence_v2"
    add_check_constraint :clinic_immunization_revisions,
      "status <> 'completed' OR occurrence_source <> 'administered_here' OR medication_administration_id IS NOT NULL",
      name: "clinic_immunization_admin_evidence", validate: false

    remove_column :clinic_immunization_revisions, :vis_given_date
    remove_column :clinic_immunization_revisions, :vis_edition_date
    remove_column :clinic_immunization_revisions, :lot_expiration_date
    remove_column :clinic_immunization_revisions, :manufacturer_mvx_code
  end
end
