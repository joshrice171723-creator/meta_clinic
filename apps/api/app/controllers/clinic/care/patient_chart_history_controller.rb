module Clinic
  module Care
    class PatientChartHistoryController < Clinic::BaseController
      before_action -> { require_capability("patients.read") }

      def show
        require_capability("notes.read", any_site: true)
        patient = current_practice.patients.accessible_by(current_ability, :read)
          .find(integer_id!(params[:id], field: :id))
        excluded_encounter_id = excluded_encounter_id_for(patient)
        signed_note = signed_soap_notes(patient, excluded_encounter_id).first

        render json: {
          schema_version: "previous-signed-soap-v1",
          patient_id: patient.id,
          excluded_encounter_id: excluded_encounter_id,
          chart: signed_note && {
            encounter_id: signed_note.encounter_id,
            note_id: signed_note.id,
            signed_at: signed_note.most_recent_signed_at&.iso8601(6),
            encounter_started_at: signed_note.encounter_started_at&.iso8601(6)
          }
        }
      end

      private

      def signed_soap_notes(patient, excluded_encounter_id)
        notes = Clinic::EncounterNote.accessible_by(current_ability, :read).where(
          practice: current_practice,
          patient: patient,
          note_kind: "soap"
        ).joins(:signatures, :encounter)
        notes = notes.where.not(encounter_id: excluded_encounter_id) if excluded_encounter_id
        notes.select(
          "clinic_encounter_notes.id",
          "clinic_encounter_notes.encounter_id",
          "MAX(clinic_encounter_note_signatures.signed_at) AS most_recent_signed_at",
          "clinic_encounters.started_at AS encounter_started_at"
        ).group(
          "clinic_encounter_notes.id",
          "clinic_encounter_notes.encounter_id",
          "clinic_encounters.started_at"
        ).order(
          Arel.sql("MAX(clinic_encounter_note_signatures.signed_at) DESC"),
          Arel.sql("clinic_encounters.started_at DESC"),
          Arel.sql("clinic_encounter_notes.id DESC")
        )
      end

      def optional_integer_id(value, field:)
        return unless value.present?

        integer_id!(value, field: field)
      end

      def excluded_encounter_id_for(patient)
        value = optional_integer_id(params[:exclude_encounter_id], field: :exclude_encounter_id)
        return unless value

        encounter = current_practice.encounters.where(patient: patient).find(value)
        return unless current_ability.allowed_permission?("notes.read", site: encounter.site)

        encounter.id
      end
    end
  end
end
