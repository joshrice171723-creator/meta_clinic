module Development
  class PilotRehearsal
    PATIENT_REFERENCE = "MC-PILOT-001".freeze
    SITE_CODE = "PILOT".freeze
    VISIT_TYPE_CODE = "Ambulatory follow-up".freeze

    def self.prepare!(practice:, accounts:, as_of: Current.business_time)
      ensure_local!
      administrator = accounts.fetch("clinic-administrator")
      clinical_staff = accounts.fetch("clinical-staff")
      patient = practice.patients.find_or_create_by!(reference: PATIENT_REFERENCE) do |record|
        record.display_name = "Morgan Juniper"
      end
      encounter = practice.encounters.open.find_by(patient: patient)
      return encounter if encounter

      site = practice.sites.find_or_create_by!(code: SITE_CODE) do |record|
        record.name = "Main clinic"
      end
      visit_type = practice.visit_types.find_or_create_by!(code: VISIT_TYPE_CODE)
      starts_at = as_of - 15.minutes
      appointment = practice.appointments.create!(
        patient: patient,
        site: site,
        visit_type: visit_type,
        starts_at: starts_at,
        ends_at: starts_at + 30.minutes,
        status: "confirmed",
        reason: "Medication follow-up and fatigue review"
      )
      encounter = practice.encounters.create!(
        patient: patient,
        site: site,
        appointment: appointment,
        started_at: starts_at,
        status: "open"
      )
      prepare_history!(practice:, patient:, encounter:, reviewer: clinical_staff.clinic_membership, starts_at:)
      prepare_vitals!(practice:, patient:, encounter:, actor: clinical_staff, observed_at: starts_at + 5.minutes)
      Clinic::AuditRecorder.record!(
        practice: practice,
        actor: administrator,
        action_code: "development.pilot_rehearsal.prepared",
        outcome: :committed,
        resource_version_ref: "Clinic::Encounter/#{encounter.id}"
      )
      encounter
    end

    private_class_method def self.prepare_history!(practice:, patient:, encounter:, reviewer:, starts_at:)
      %w[allergies medications care_needs].each_with_index do |topic, index|
        patient.history_reviews.create!(
          practice: practice,
          encounter: encounter,
          topic: topic,
          outcome: "none_reported",
          information_source: "patient",
          reviewer_membership: reviewer,
          reviewed_at: starts_at + (index + 1).minutes,
          request_key: "pilot-rehearsal-#{encounter.id}-history-#{topic}"
        )
      end
    end

    private_class_method def self.prepare_vitals!(practice:, patient:, encounter:, actor:, observed_at:)
      Clinic::Care::VitalSigns.record(
        practice: practice,
        actor: actor,
        patient: patient,
        encounter: encounter,
        request_key: "pilot-rehearsal-#{encounter.id}-vitals",
        dictionary_version: Clinic::Care::VitalSigns::DICTIONARY_VERSION,
        observed_at: observed_at,
        confirmed_patient: true,
        readings: [
          { code: "vital-systolic-bp", value: "118", unit_code: "mm[Hg]" },
          { code: "vital-diastolic-bp", value: "76", unit_code: "mm[Hg]" },
          { code: "vital-heart-rate", value: "74", unit_code: "/min" },
          { code: "vital-temperature", value: "98.4", unit_code: "[degF]" },
          { code: "vital-weight", value: "164.2", unit_code: "[lb_av]" }
        ]
      )
    end

    private_class_method def self.ensure_local!
      return if Rails.env.test? || (Rails.env.development? && ENV["APP_DEVELOPMENT_LOGIN"] == "1")

      raise TestAccounts::Unavailable, "Pilot rehearsal data requires explicitly enabled local access."
    end
  end
end
