require "digest"

module Development
  class DemoSandboxLongitudinalChart
    CONDITION_NAME = "Intermittent shoulder discomfort"

    def self.prepare!(run)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? &&
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?

      run.practice.organization.practices.order(:id).each do |practice|
        practice.sites.order(:id).each do |site|
          prepare_site!(practice:, site:, actor: run.operator_user)
        end
      end
    end

    def self.prepare_site!(practice:, site:, actor:)
      patients_with_notes = practice.encounter_notes.where(note_kind: "soap").select(:patient_id)
      patient = practice.patients.where(primary_site: site).where("reference LIKE 'SBX-%'")
        .where.not(id: patients_with_notes).order(:id).find do |candidate|
        practice.encounters.where(patient: candidate, site:, status: "completed").count >= 2
      end
      return unless patient

      visits = practice.encounters.where(patient:, site:, status: "completed").order(:started_at, :id).to_a
      first_visit, latest_visit = visits.first, visits.last
      membership = practice.memberships.active.find_by!(user: actor)
      recorded_at = first_visit.started_at + 2.minutes
      resolved_at = latest_visit.started_at + 2.minutes

      condition = patient.conditions.create!(practice:, data_status: "recorded", condition_name: CONDITION_NAME,
        clinical_status: "active", verification_status: "unconfirmed", affects_current_care: true,
        onset_at: first_visit.started_at, recorded_by_membership: membership, recorded_at:)
      note!(practice:, actor:, encounter: first_visit, request_key: "sandbox-chart-prior-#{first_visit.id}",
        subjective: "The patient reported intermittent shoulder discomfort at this visit.",
        assessment: "Patient-reported symptom history; no diagnostic conclusion was recorded.",
        plan: "Review the patient's report at a later visit.")

      condition.update!(clinical_status: "resolved", affects_current_care: false, resolved_at:,
        last_reviewed_at: resolved_at, reviewed_by_membership: membership)
      note!(practice:, actor:, encounter: latest_visit, request_key: "sandbox-chart-current-#{latest_visit.id}",
        subjective: "The patient reported no current shoulder discomfort at this visit.",
        assessment: "The prior unconfirmed problem-list entry was reviewed and marked resolved.",
        plan: "No further follow-up for this item was recorded.")
    end
    private_class_method :prepare_site!

    def self.note!(practice:, actor:, encounter:, request_key:, subjective:, assessment:, plan:)
      behavioral_health = practice.name == "Sandbox Primary Care" && encounter.site.code == "SANDBOX-NORTH"
      body = Clinic::Care::SoapNotePayload.dump(
        template_id: behavioral_health ? "behavioral-health-progress" : "adult-physical-exam-detailed",
        template_version: 1,
        sections: { subjective:, objective: "No examination findings are included in this historical summary.", assessment:, plan: }
      )
      note = Clinic::Care::CreateEncounterNote.call(practice:, actor:, encounter:, note_kind: "soap",
        payload_version: Clinic::Care::SoapNotePayload::VERSION, encrypted_body: body, request_key:)
      revision = note.revisions.order(:revision_no).last!
      Clinic::Care::SignEncounterNote.call(note:, actor:, revision_no: revision.revision_no,
        content_digest: Digest::SHA256.hexdigest(revision.encrypted_body), attestation_version: "sandbox-chart-v1",
        signed_at: encounter.started_at + 5.minutes)
    end
    private_class_method :note!
  end
end
