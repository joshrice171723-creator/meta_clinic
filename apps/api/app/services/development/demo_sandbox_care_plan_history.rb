module Development
  class DemoSandboxCarePlanHistory
    def self.prepare!(run)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? &&
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?

      run.practice.organization.practices.order(:id).each do |practice|
        practice.sites.order(:id).each_with_index do |site, site_index|
          patients = practice.patients.where(primary_site: site)
            .where("reference LIKE 'SBX-%'").order(:id).offset(14).limit(3).to_a
          raise ArgumentError, "Care-plan history needs three background patients at the site" unless patients.length == 3

          patients.each_with_index do |patient, index|
            encounter = Clinic::Scheduling::CreateEncounter.call(
              practice:, actor: run.operator_user, patient:, site:,
              room: site.rooms.order(:id).first!, started_at: Current.business_time - (index + 1).hours
            )
            prepare_patient!(practice:, actor: run.operator_user, patient:, encounter:, index:)
          end
          book_follow_up!(practice:, actor: run.operator_user, patient: patients.first, site:, site_index: site_index + 1)
        end
      end
    end

    def self.prepare_patient!(practice:, actor:, patient:, encounter:, index:)
      key = "sandbox-care-plan-history-#{encounter.id}"
      today = Current.business_time.to_date
      plan = Clinic::Care::ClinicalPlanWorkflow.create(
        kind: :care_plans, practice:, actor:, patient:, encounter:, request_key: "#{key}-plan",
        attributes: { title: "Progress follow-up", description: "Review the documented goal at the next visit",
          starts_on: today - 30.days, ends_on: today + 30.days }
      )
      plan = Clinic::Care::ClinicalPlanWorkflow.revise(
        kind: :care_plans, series_id: plan.series_id, practice:, actor:, patient:, encounter:,
        attributes: { status: "active" }, expected_version: plan.version_number,
        request_key: "#{key}-activate-plan"
      )
      goal = Clinic::Care::ClinicalPlanWorkflow.create(
        kind: :care_goals, practice:, actor:, patient:, encounter:, request_key: "#{key}-goal",
        attributes: { care_plan_revision_id: plan.id, description: "Review progress and confirm the next care step",
          target_on: today + (index == 1 ? -7.days : 14.days) }
      )
      goal = Clinic::Care::ClinicalPlanWorkflow.revise(
        kind: :care_goals, series_id: goal.series_id, practice:, actor:, patient:, encounter:,
        attributes: { status: "active" }, expected_version: goal.version_number,
        request_key: "#{key}-activate-goal"
      )
      return unless index == 2

      Clinic::Care::ClinicalPlanWorkflow.revise(
        kind: :care_goals, series_id: goal.series_id, practice:, actor:, patient:, encounter:,
        attributes: { status: "achieved", outcome_text: "Patient reported reviewing progress at an earlier visit",
          outcome_source: "patient_reported", outcome_recorded_at: Current.business_time },
        expected_version: goal.version_number, request_key: "#{key}-achieve-goal"
      )
    end
    private_class_method :prepare_patient!

    def self.book_follow_up!(practice:, actor:, patient:, site:, site_index:)
      zone = ActiveSupport::TimeZone[site.timezone_override.presence || practice.timezone] ||
        raise(ArgumentError, "Sandbox location timezone is unavailable")
      date = Current.business_time.in_time_zone(zone).to_date.beginning_of_week(:monday) + 4.weeks
      starts_at = zone.local(date.year, date.month, date.day, 10)
      visit_code = practice.name == "Sandbox Weight Management" ? "Weight management follow-up" : "Follow-up visit"
      Clinic::Scheduling::BookAppointment.call(
        practice:, actor:, patient:, site:, room: site.rooms.find_by!(code: "EXAM-1"),
        booked_clinician: practice.clinician_profiles.find_by!(reference: "SBX-CLIN-#{site_index}-1"),
        visit_type: practice.visit_types.find_by!(code: visit_code),
        starts_at:, ends_at: starts_at + 30.minutes, reason: "Review care-plan goal",
        request_key: "sandbox-care-plan-follow-up-#{patient.id}"
      )
    end
    private_class_method :book_follow_up!
  end
end
