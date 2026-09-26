require "digest"

module Development
  class DemoSandboxChartHistory
    ALLERGIES = [
      { allergen_name: "Penicillin", reaction: "Rash", category: "medication" },
      { allergen_name: "Latex", reaction: "Contact rash", category: "other" },
      { allergen_name: "Shellfish", reaction: "Hives", category: "food" }
    ].freeze
    MEDICATIONS = [
      "Loratadine", "Vitamin D supplement", "Lisinopril", "Metformin"
    ].freeze
    HISTORY_CONTEXT = [
      "An active medication and a reported allergy were reviewed.",
      "An active patient-reported medication was reviewed; no allergy was reported.",
      "A medication list was confirmed during the visit.",
      "A reported allergy was reviewed with the patient.",
      "A previously stopped medication remains in the historical list.",
      "The patient reported no current medications or allergies.",
      "The patient confirmed the current medication list.",
      "The patient confirmed a reported allergy and no current medication.",
      "No current medications or allergies were reported.",
      "Medication and allergy history could not be obtained at this visit."
    ].freeze

    def self.prepare!(run)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? &&
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?

      run.practice.organization.practices.order(:id).each do |practice|
        membership = practice.memberships.active.find_by!(user: run.operator_user)
        practice.sites.order(:id).each do |site|
          prepare_site!(practice:, site:, actor: run.operator_user, membership:)
        end
      end
    end

    def self.prepare_site!(practice:, site:, actor:, membership:)
      patients = practice.patients.where(primary_site: site).where("reference LIKE 'SBX-%'").order(:id).to_a
      encounters = practice.encounters.where(site:, status: "completed", patient_id: patients.map(&:id))
        .order(:started_at, :id).to_a
      visits = encounters.group_by(&:patient_id)
      appointments = Clinic::Appointment.includes(:visit_type)
        .where(practice:, id: encounters.filter_map(&:appointment_id)).index_by(&:id)
      behavioral_health = Clinic::Configuration::PracticeFeatures
        .snapshot(practice:, site:).fetch(:clinic_type) == "behavioral_health"
      reviews = []

      patients.each_with_index do |patient, index|
        patient_visits = visits.fetch(patient.id, [])
        next if patient_visits.empty?

        first_visit = patient_visits.first
        latest_visit = patient_visits.last
        profile = index % 10
        recorded_at = first_visit.started_at + 2.minutes
        allergy_present = [ 0, 3, 7 ].include?(profile)
        medication_present = [ 0, 1, 2, 6 ].include?(profile)
        unknown = profile == 9

        if allergy_present
          patient.allergies.create!(practice:, data_status: "recorded",
            **ALLERGIES.fetch(index % ALLERGIES.length), clinical_status: "active",
            verification_status: "confirmed", criticality: "low", severity: "mild",
            recorded_by_membership: membership, recorded_at:,
            last_reviewed_at: latest_visit.started_at + 5.minutes, reviewed_by_membership: membership)
        end
        if medication_present || profile == 4
          patient.medication_statements.create!(practice:, data_status: "recorded",
            medication_name: MEDICATIONS.fetch(index % MEDICATIONS.length),
            status: profile == 4 ? "stopped" : "active", information_source: "patient",
            effective_from: recorded_at - 60.days,
            effective_until: profile == 4 ? recorded_at - 1.day : nil,
            asserted_at: recorded_at, recorded_by_membership: membership, recorded_at:,
            last_reviewed_at: latest_visit.started_at + 5.minutes, reviewed_by_membership: membership)
        end

        patient_visits.each do |encounter|
          review_rows!(reviews, practice:, patient:, encounter:, membership:,
            allergy_present:, medication_present:, unknown:)
        end

        next unless index % 7 == 0

        if patient_visits.length > 1 && index % 28 == 0
          note!(practice:, actor:, encounter: first_visit,
            visit_type: appointments.fetch(first_visit.appointment_id).visit_type.code, profile:,
            behavioral_health:)
        end
        note!(practice:, actor:, encounter: latest_visit,
          visit_type: appointments.fetch(latest_visit.appointment_id).visit_type.code, profile:,
          behavioral_health:)
      end
      Clinic::Care::PatientHistoryReview.insert_all!(reviews) if reviews.any?
    end
    private_class_method :prepare_site!

    def self.review_rows!(rows, practice:, patient:, encounter:, membership:, allergy_present:, medication_present:, unknown:)
      reviewed_at = encounter.started_at + 5.minutes
      { "allergies" => allergy_present, "medications" => medication_present,
        "care_needs" => false }.each do |topic, present|
        rows << { practice_id: practice.id, patient_id: patient.id, encounter_id: encounter.id,
          topic:, outcome: unknown && topic != "care_needs" ? "unable_to_obtain" :
            (present ? "current_list_confirmed" : "none_reported"),
          information_source: "patient", reviewer_membership_id: membership.id,
          reviewed_at:, request_key: "sandbox-history-#{encounter.id}-#{topic}",
          created_at: reviewed_at, updated_at: reviewed_at }
      end
    end
    private_class_method :review_rows!

    def self.note!(practice:, actor:, encounter:, visit_type:, profile:, behavioral_health:)
      sections = if behavioral_health
        {
          subjective: "Retrospective summary of #{visit_type.downcase}. #{HISTORY_CONTEXT.fetch(profile)}",
          objective: "Chart history reviewed for this encounter at #{encounter.site.name}. No behavioral-health assessment instrument or mental-status examination is represented in this historical entry.",
          assessment: "Historical chart review only; this entry does not represent a behavioral-health diagnosis or safety assessment.",
          plan: "Confirm patient priorities and relevant history at follow-up. No intervention or treatment is recorded in this historical entry."
        }
      else
        {
          subjective: "Retrospective summary of #{visit_type.downcase}. #{HISTORY_CONTEXT.fetch(profile)}",
          objective: "Visit completed at #{encounter.site.name}. Structured measurements are available in the encounter when recorded.",
          assessment: profile == 9 ? "Medication and allergy reconciliation remains open." :
            "Current and historical chart information reviewed for this visit.",
          plan: profile == 9 ? "Obtain and reconcile the missing history at a subsequent contact." :
            "Review outstanding questions and the documented care plan at the next contact."
        }
      end
      body = Clinic::Care::SoapNotePayload.dump(
        template_id: behavioral_health ? "behavioral-health-progress" : "adult-physical-exam-detailed",
        template_version: 1, sections:
      )
      note = Clinic::Care::CreateEncounterNote.call(practice:, actor:, encounter:,
        note_kind: "soap", payload_version: Clinic::Care::SoapNotePayload::VERSION,
        encrypted_body: body, request_key: "sandbox-soap-#{encounter.id}")
      revision = note.revisions.order(:revision_no).last!
      Clinic::Care::SignEncounterNote.call(note:, actor:, revision_no: revision.revision_no,
        content_digest: Digest::SHA256.hexdigest(revision.encrypted_body),
        attestation_version: "sandbox-chart-v1")
    end
    private_class_method :note!
  end
end
