module Clinic
  module Care
    class PrevisitNotesController < Clinic::BaseController
      before_action -> { require_capability("patients.read") }

      def show
        patient = current_practice.patients.accessible_by(current_ability, :read)
          .find(integer_id!(params[:patient_id], field: :patient_id))
        encounter = current_practice.encounters.where(patient: patient)
          .find(integer_id!(params[:encounter_id], field: :encounter_id))
        Clinic::Authorization.authorize!(
          actor: current_user, practice: current_practice, action: "notes.read", site: encounter.site
        )
        appointment = encounter.appointment
        note = appointment && Clinic::PatientPortal::PrevisitNotes.latest(appointment)
        Clinic::AuditRecorder.record!(
          practice: current_practice,
          actor: current_user,
          action_code: "previsit_note.read",
          outcome: :released,
          resource_version_ref: "Clinic::Encounter/#{encounter.id}"
        )
        render json: {
          patient_id: patient.id,
          encounter_id: encounter.id,
          appointment_id: appointment&.id,
          note: Clinic::Care::PrevisitNoteSerializer.call(note)
        }
      end
    end
  end
end
