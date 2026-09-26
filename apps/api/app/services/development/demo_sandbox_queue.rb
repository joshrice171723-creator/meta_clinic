module Development
  class DemoSandboxQueue
    VISITS = {
      "Sandbox Primary Care" => [
        [ "Annual wellness", "Annual wellness check" ],
        [ "Medication review", "Review current medications" ],
        [ "Lab follow-up", "Discuss laboratory results" ],
        [ "Care planning", "Review care goals" ]
      ],
      "Sandbox Weight Management" => [
        [ "Weight management follow-up", "Review weight management progress" ],
        [ "Nutrition consult", "Discuss nutrition goals" ],
        [ "Medication check", "Review medication response" ],
        [ "Goal review", "Review activity and care goals" ]
      ]
    }.freeze
    BEHAVIORAL_VISITS = [
      [ "Behavioral health initial visit", "Discuss sleep and mood concerns" ],
      [ "Medication follow-up", "Review medication response" ],
      [ "Behavioral health follow-up", "Review care goals and symptoms" ],
      [ "Psychiatric evaluation", "Clarify treatment history" ]
    ].freeze

    def self.prepare!(run)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? &&
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?

      practices = run.practice.organization.practices.order(:id).to_a
      raise ArgumentError, "Sandbox queue needs two clinics" unless practices.length == 2

      practices.each do |practice|
        practice.sites.order(:id).each_with_index do |site, site_index|
          visit_specs = practice.name == "Sandbox Primary Care" && site_index == 1 ?
            BEHAVIORAL_VISITS : VISITS.fetch(practice.name)
          prepare_site!(practice:, site:, site_index: site_index + 1,
            actor: run.operator_user, visit_specs:)
        end
      end
    end

    def self.prepare_site!(practice:, site:, site_index:, actor:, visit_specs:)
      zone = ActiveSupport::TimeZone[site.timezone_override.presence || practice.timezone] ||
        raise(ArgumentError, "Sandbox location timezone is unavailable")
      date = Current.business_time.in_time_zone(zone).to_date
      date -= 1.day while [ 0, 6 ].include?(date.wday)

      visit_specs.each_with_index do |(visit_code, reason), index|
        patient = practice.patients.find_by!(reference: "SBX-#{site_index}-#{(index + 11).to_s.rjust(3, '0')}")
        clinician = practice.clinician_profiles.find_by!(reference: "SBX-CLIN-#{site_index}-#{index % 3 + 1}")
        room = site.rooms.find_by!(code: "EXAM-#{index % 3 + 1}")
        starts_at = zone.local(date.year, date.month, date.day, [ 9, 11, 13, 15 ].fetch(index))
        appointment = Clinic::Scheduling::BookAppointment.call(
          practice:, actor:, patient:, site:, room:, booked_clinician: clinician,
          visit_type: practice.visit_types.find_by!(code: visit_code), reason:,
          starts_at:, ends_at: starts_at + 30.minutes, request_key: SecureRandom.uuid
        )
        Clinic::Scheduling::TransitionAppointment.call(appointment:, actor:, to: "confirmed")
        encounter = Clinic::Scheduling::CreateEncounter.call(
          practice:, actor:, patient:, appointment:, started_at: starts_at
        )
        if index.positive?
          Clinic::Scheduling::AssignProvider.call(
            encounter:, actor:, clinician_profile: clinician, expected_token: nil,
            request_key: SecureRandom.uuid
          )
        end
        prepare_flow!(practice:, patient:, encounter:, clinician:, index:)
      end
    end
    private_class_method :prepare_site!

    def self.prepare_flow!(practice:, patient:, encounter:, clinician:, index:)
      return if index.zero?

      staff_actor = clinic_manager!(practice, encounter.site)
      if index == 1
        revise_intake!(practice:, actor: staff_actor, patient:, encounter:, status: "incomplete",
          identity_state: "not_confirmed", visit_reason_state: "not_recorded",
          history_state: "incomplete", vitals_state: "incomplete")
        return
      end

      observations = record_vitals!(practice:, actor: staff_actor, patient:, encounter:)
      history_reviews = %w[allergies medications care_needs].map do |topic|
        has_active_history = case topic
        when "allergies" then patient.allergies.recorded_details.where(clinical_status: "active").exists?
        when "medications" then patient.medication_statements.recorded_details.where(status: "active").exists?
        when "care_needs" then patient.care_needs.active_at(Current.business_time).exists?
        end
        Clinic::Care::ClinicalHistory.review(
          practice:, actor: staff_actor, patient:, encounter:, topic:,
          outcome: has_active_history ? "current_list_confirmed" : "none_reported",
          information_source: "patient", notes: nil,
          request_key: "sandbox-queue-#{encounter.id}-history-#{topic}"
        )
      end
      intake = revise_intake!(practice:, actor: staff_actor, patient:, encounter:, status: "ready_for_handoff",
        identity_state: "confirmed", visit_reason_state: "confirmed", history_state: "reviewed",
        vitals_state: "recorded", observation_ids: observations.map(&:id),
        history_review_ids: history_reviews.map(&:id))
      handoff = Clinic::Care::NurseWorkflow.request_handoff(
        practice:, actor: staff_actor, patient:, encounter:, intake_revision_id: intake.id,
        request_key: "sandbox-queue-#{encounter.id}-handoff"
      )
      return unless index == 3

      Clinic::Care::NurseWorkflow.transition_handoff(
        practice:, actor: clinician.membership.user, handoff:, action: "accept",
        expected_version: handoff.lock_version,
        request_key: "sandbox-queue-#{encounter.id}-handoff-accept"
      )
    end
    private_class_method :prepare_flow!

    def self.revise_intake!(practice:, actor:, patient:, encounter:, status:, identity_state:,
      visit_reason_state:, history_state:, vitals_state:, observation_ids: [], history_review_ids: [])
      Clinic::Care::NurseWorkflow.revise_intake(
        practice:, actor:, patient:, encounter:, expected_version: 0,
        request_key: "sandbox-queue-#{encounter.id}-intake",
        attributes: { status:, identity_state:, visit_reason_state:, history_state:, vitals_state: },
        observation_ids:, history_review_ids:
      )
    end
    private_class_method :revise_intake!

    def self.record_vitals!(practice:, actor:, patient:, encounter:)
      Clinic::Care::VitalSigns.record(
        practice:, actor:, patient:, encounter:, request_key: "sandbox-queue-#{encounter.id}-vitals",
        dictionary_version: Clinic::Care::VitalSigns::DICTIONARY_VERSION,
        observed_at: encounter.started_at + 10.minutes, confirmed_patient: true,
        readings: [
          { code: "vital-weight", value: "78.4", unit_code: "kg" },
          { code: "vital-systolic-bp", value: "122", unit_code: "mm[Hg]" },
          { code: "vital-diastolic-bp", value: "78", unit_code: "mm[Hg]" }
        ]
      ).select { |observation| observation.value_kind_numeric? }
    end
    private_class_method :record_vitals!

    def self.clinic_manager!(practice, site)
      employment = Clinic::Workforce::Employment.includes(:staff_member, :membership, :employment_sites)
        .where(practice:, status: "active").find do |candidate|
          candidate.staff_member.job_title == "Clinic manager" && candidate.eligible_site?(site)
        end
      employment&.membership&.user || raise(ArgumentError, "Sandbox site needs an active clinic manager")
    end
    private_class_method :clinic_manager!
  end
end
