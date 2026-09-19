require "securerandom"

module Development
  class DemoNavigationPreparation
    class << self
      def prepare!(run)
        case run.lesson_key
        when "refill_review" then refill!(run)
        when "recall_review" then recall!(run)
        when "waitlist_review" then waitlist!(run)
        when "scribe_review" then scribe!(run)
        end
      end

      private

      def refill!(run)
        return if run.practice.patient_portal_requests.refill.where(patient_id: run.patient.id).exists?

        content = Clinic::PatientPortal::RefillRequestData.content(
          medication_name: "Sample medication", pharmacy_destination: "Local sample pharmacy",
          request_note: "Please review the sample refill request.", source: "staff"
        )
        Clinic::PatientPortal::CreateRequest.call(
          practice: run.practice, patient: run.patient, identity: nil,
          request_key: "demo-refill-#{run.id}", request_type: "refill", content:
        )
      end

      def recall!(run)
        encounter = encounter_for(run)
        return if Clinic::EncounterFollowUp.exists?(practice: run.practice, encounter: encounter)

        Clinic::Operations::EncounterFollowUps.record(
          practice: run.practice, actor: run.operator_user, encounter:,
          request_key: "demo-care-gap-#{run.id}", expected_version: 0,
          attributes: { status: "needed", plan: "Follow up on the sample visit plan.", due_at: 1.day.ago.iso8601 }
        )
      end

      def waitlist!(run)
        return if Clinic::Scheduling::WaitlistEntry.exists?(practice: run.practice, patient: run.patient)

        Clinic::Scheduling::WaitlistEntry.create!(
          practice: run.practice, patient: run.patient, site: run.practice.sites.first!,
          clinician: run.practice.clinician_profiles.first!, visit_type: run.practice.visit_types.first!,
          earliest_at: 1.hour.from_now, latest_at: 1.day.from_now,
          duration_minutes: 30, state: "waiting", reason: "Patient prefers an earlier follow-up appointment."
        )
      end

      def scribe!(run)
        return if run.practice.scribe_encounters.where(patient: run.patient).exists?

        ensure_scribe_template!
        clinical_encounter = encounter_for(run)
        Clinic::Scribe::Workflow.create_encounter(
          practice: run.practice, actor: run.operator_user, patient: run.patient,
          clinical_encounter:, context: {
            content: "Alex returns for follow-up. Review the available chart information and document only the supplied visit facts.", source_type: "reviewer_authored"
          }
        )
      end

      def encounter_for(run)
        run.practice.encounters.where(patient: run.patient).order(:id).last ||
          Clinic::Scheduling::CreateEncounter.call(
            practice: run.practice, actor: run.operator_user, patient: run.patient,
            appointment: run.practice.appointments.where(patient: run.patient).order(:id).last,
            started_at: Current.business_time
          )
      end

      def ensure_scribe_template!
        Clinic::Scribe::NoteTemplate.find_or_create_by!(template_id: "soap", version: 1) do |template|
          template.label = "SOAP note"
          template.note_kind = "soap"
          template.status = "active"
          template.sections = { subjective: "", objective: "", assessment: "", plan: "" }
        end
      end
    end
  end
end
