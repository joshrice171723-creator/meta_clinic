module Clinic
  module Telehealth
    module WrapUpSerializer
      module_function

      def staff(wrap_up)
        return unless wrap_up

        snapshot = if wrap_up.finalized?
          {
            encounter_id: wrap_up.scribe_encounter_id,
            encounter_status: wrap_up.scribe_encounter_status,
            draft_id: wrap_up.scribe_draft_id,
            draft_status: wrap_up.scribe_draft_status,
            export_id: wrap_up.scribe_export_id,
            export_state: wrap_up.scribe_export_state,
            encounter_note_id: wrap_up.scribe_encounter_note_id,
            encounter_note_revision_id: wrap_up.scribe_encounter_note_revision_id
          }
        else
          WrapUpWorkflow.scribe_snapshot(wrap_up.visit)
        end
        {
          id: wrap_up.id,
          status: wrap_up.status,
          outcome: wrap_up.outcome,
          clinician_notes: wrap_up.clinician_notes,
          patient_instructions: wrap_up.patient_instructions,
          instruction_note_revision_id: wrap_up.instruction_note_revision_id,
          follow_up_status: wrap_up.follow_up_status,
          follow_up_plan: wrap_up.follow_up_plan,
          follow_up_appointment: wrap_up.follow_up_appointment &&
            VisitSerializer.appointment(wrap_up.follow_up_appointment),
          scribe_review_status: wrap_up.scribe_review_status,
          scribe_snapshot: snapshot,
          publication_state: WrapUpWorkflow.publication_state(wrap_up),
          finalized_at: wrap_up.finalized_at&.iso8601(6),
          finalized_by_membership_id: wrap_up.finalized_by_membership_id,
          version: wrap_up.lock_version
        }
      end

      def patient(visit)
        return unless visit.status.in?(%w[ended cancelled no_show])

        wrap_up = visit.wrap_up
        unless wrap_up&.finalized? && WrapUpWorkflow.publication_state(wrap_up) == "released"
          return { status: "pending", outcome: nil, instructions: nil, follow_up_status: nil,
            follow_up_plan: nil, follow_up_appointment: nil, published_at: nil }
        end
        {
          status: "ready",
          outcome: wrap_up.outcome,
          instructions: wrap_up.patient_instructions,
          follow_up_status: wrap_up.follow_up_status,
          follow_up_plan: wrap_up.follow_up_plan,
          follow_up_appointment: wrap_up.follow_up_appointment &&
            VisitSerializer.appointment(wrap_up.follow_up_appointment),
          published_at: wrap_up.encounter.ended_at.iso8601(6)
        }
      end
    end
  end
end
