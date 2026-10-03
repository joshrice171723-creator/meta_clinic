require "test_helper"

class BehavioralHealthIntegrityTest < ActiveSupport::TestCase
  setup do
    organization = Organization.create!(name: "Synthetic Behavioral Integrity Organization")
    @practice = Clinic::Practice.create!(organization:, name: "Synthetic Behavioral Integrity Practice")
    @user = User.create!(email_address: "behavioral-integrity@example.invalid", password: SecureRandom.hex(18))
    @member = @practice.memberships.create!(user: @user)
    grant_permissions!(@member, "facilities.write", "intake.write", "care_plans.write", "patients.read", "clinical_records.read")
    @site = @practice.sites.create!(code: "BH", status: "active")
    @practice.visit_types.create!(code: "Synthetic shared visit")
    Clinic::Configuration::PracticeFeatures.revise(practice: @practice, site: @site, actor: @member,
      request_key: "integrity-bh-profile", expected_revision: 0, insurance_workflows_enabled: false,
      clinic_type: "behavioral_health", service_scope: [], assessment_scope: [ "psychiatry_assessment" ], finalize: true)
    @patient = @practice.patients.create!(display_name: "Synthetic Integrity Patient", reference: "BH-INTEGRITY")
    @encounter = @practice.encounters.create!(patient: @patient, site: @site, started_at: Time.current, status: "open")
  end

  test "assessment category does not authorize invented calculated scoring" do
    attributes = assessment_attributes.merge(score_source: "calculated", score_value: "4", score_recorded_at: Time.current)
    assert_no_difference "Clinic::Care::AssessmentRevision.count" do
      error = assert_raises(ArgumentError) { create(:assessments, attributes) }
      assert_includes error.message, "No supported instrument scorer is configured"
    end
    unscored = create(:assessments, assessment_attributes)
    assert_nil unscored.score_value
    assert_empty unscored.item_responses
    manual = create(:assessments, attributes.merge(score_source: "clinician_entered"))
    assert_equal "clinician_entered", manual.score_source
    imported = create(:assessments, attributes.merge(score_source: "imported"))
    assert_equal "imported", imported.score_source
  end

  test "historical calculated result can be amended without inventing a new calculation" do
    legacy = Clinic::Care::AssessmentRevision.create!(assessment_attributes.merge(
      practice: @practice, patient: @patient, encounter: @encounter, site: @site, recorded_by_membership: @member,
      series_id: SecureRandom.uuid, version_number: 1, recorded_at: Time.current,
      request_key: "integrity-legacy-result", content_digest: "a" * 64, status: "in_progress",
      assessment_state: "unknown", score_source: "calculated", score_value: "4", score_recorded_at: Time.current.change(usec: 0)))
    amended = revise(:assessments, legacy, follow_up_plan: "Review this historical unverified calculation",
      score_recorded_at: legacy.score_recorded_at.iso8601(6))
    assert_equal "4", amended.score_value
    assert_equal legacy.id, amended.prior_revision_id
    assert_no_difference "Clinic::Care::AssessmentRevision.count" do
      assert_raises(ArgumentError) { revise(:assessments, amended, score_value: "5") }
      assert_raises(ArgumentError) { revise(:assessments, amended, response_summary: "Changed source responses") }
    end
    corrected = revise(:assessments, amended, score_source: "clinician_entered", score_value: "5")
    assert_equal "clinician_entered", corrected.score_source
  end

  test "new goal links require the reviewed current plan while existing goal sources remain intact" do
    plan = create(:care_plans, title: "Synthetic care plan", description: "Entered clinical plan")
    goal = create(:care_goals, care_plan_revision_id: plan.id, description: "Patient-entered priority")
    current = revise(:care_plans, plan, description: "Changed plan agreed with patient")
    assert_no_difference "Clinic::Care::CareGoalRevision.count" do
      error = assert_raises(ArgumentError) do
        create(:care_goals, care_plan_revision_id: plan.id, description: "Stale source selection")
      end
      assert_includes error.message, "The source plan changed"
    end
    amended = revise(:care_goals, goal, description: "Clarified original goal")
    assert_equal plan.id, amended.care_plan_revision_id
    relinked = revise(:care_goals, amended, care_plan_revision_id: current.id)
    assert_equal current.id, relinked.care_plan_revision_id
    assert_raises(ArgumentError) { revise(:care_goals, relinked, care_plan_revision_id: plan.id) }
  end

  test "psychiatry new work is site-specific while saved category amendments remain shared history" do
    assessment = create(:assessments, assessment_attributes)
    weight_site = @practice.sites.create!(code: "WEIGHT", status: "active")
    Clinic::Configuration::PracticeFeatures.revise(practice: @practice, site: weight_site, actor: @member,
      request_key: "integrity-weight-profile", expected_revision: 0, insurance_workflows_enabled: false,
      clinic_type: "weight_loss", service_scope: [], assessment_scope: [ "depression" ], finalize: true)
    weight_encounter = @practice.encounters.create!(patient: @patient, site: weight_site, started_at: Time.current, status: "open")
    assert_raises(ArgumentError) { create(:assessments, assessment_attributes, encounter: weight_encounter) }
    current_features = Clinic::PracticeFeatureVersion.find_by!(practice: @practice, site: @site, revision: 1)
    Clinic::PracticeFeatureVersion.create!(practice: @practice, site: @site, created_by_membership: @member,
      revision: 2, effective_from: Time.current, request_key: "integrity-remove-assessment", content_digest: "b" * 64,
      optional_features: current_features.optional_features.merge("assessment_scope" => []))
    assert_raises(ArgumentError) { create(:assessments, assessment_attributes) }
    amended = revise(:assessments, assessment, follow_up_plan: "Retained historical review")
    assert_equal assessment.id, amended.prior_revision_id
    assert_equal "psychiatry_assessment", amended.category
  end

  test "behavioral intake keeps declined unknown and historical confirmation distinct without scoring" do
    encoded = Clinic::Care::PrevisitIntake.encode(text: "Synthetic return context", form_id: "behavioral-health-follow-up-v1",
      answers: { "bh_history" => { "state" => "unknown" }, "bh_prior_care" => { "state" => "declined" },
        "bh_functioning" => { "state" => "answered", "value" => "Patient reports changes at work" } },
      attested: false, status: "draft", recorder: "patient")
    saved = Clinic::Care::PrevisitIntake.decode(encoded)
    assert_equal "unknown", saved.dig("answers", "bh_history", "state")
    assert_equal "declined", saved.dig("answers", "bh_prior_care", "state")
    assert_equal "draft", saved.fetch("status")
    assert_nil saved.fetch("attestation")
    form = Clinic::Care::PrevisitIntake.form_for(practice: @practice, payload: saved)
    assert_equal false, form.dig(:screening, :enabled)
    assert_not_includes form[:fields].pluck(:id), "instrument_status"
    assert Clinic::Care::BehavioralHealthQuestionnaire.fields([]).all? { |field| field[:reusable] == false }
  end

  test "follow-up queue filters saved origins retains post-closure work and labels shared tasks" do
    grant_permissions!(@member, "encounters.write")
    weight = @practice.sites.create!(code: "WEIGHT-QUEUE", name: "Weight location", status: "active")
    Clinic::Configuration::PracticeFeatures.revise(practice: @practice, site: weight, actor: @member,
      request_key: "integrity-queue-weight-profile", expected_revision: 0, insurance_workflows_enabled: false,
      clinic_type: "weight_loss", service_scope: [], assessment_scope: [], finalize: true)
    weight_encounter = @practice.encounters.create!(patient: @patient, site: weight, started_at: Time.current, status: "open")
    @site.update_column(:name, "")
    @patient.update!(primary_site: weight)
    @encounter.update!(status: "completed", ended_at: Time.current)
    tasks = [ @encounter, weight_encounter ].map do |encounter|
      Clinic::ClinicalTask.create!(practice: @practice, patient: @patient, encounter:, site: encounter.site,
        task_kind: "safety_follow_up", state: "open", pool_code: "clinical", source_type: "manual",
        recorded_by_membership: @member)
    end
    shared = Clinic::ClinicalTask.create!(practice: @practice, patient: @patient,
      task_kind: "patient_call", state: "open", pool_code: "front_desk", source_type: "manual",
      recorded_by_membership: @member)
    follow_up = Clinic::Operations::EncounterFollowUps.record(practice: @practice, actor: @user, encounter: @encounter,
      request_key: "integrity-queue-follow-up", expected_version: 0,
      attributes: { status: "needed", plan: "Contact patient about entered next step", due_at: 1.day.from_now.iso8601 })
    clinic_wide = Clinic::Operations::FollowUpWorklist.call(practice: @practice, actor: @user)
    assert_equal (tasks.map(&:id) + [ shared.id ]).sort, clinic_wide[:clinical_tasks].pluck(:id).sort
    source = clinic_wide[:encounter_follow_ups].find { |row| row[:id] == follow_up.id }
    assert_equal [ @site.id, @site.code ], source.values_at(:source_site_id, :source_site_name)
    filtered = Clinic::Operations::FollowUpWorklist.call(practice: @practice, actor: @user, site_id: @site.id)
    assert_equal [ tasks.first.id, shared.id ].sort, filtered[:clinical_tasks].pluck(:id).sort
    assert_equal [ follow_up.id ], filtered[:encounter_follow_ups].pluck(:id)
    assert_nil filtered[:clinical_tasks].find { |row| row[:id] == shared.id }[:source_site_id]
    assert_equal @site.id, filtered[:clinical_tasks].find { |row| row[:id] == tasks.first.id }[:source_site_id]
    assert_equal @site.code, filtered[:clinical_tasks].find { |row| row[:id] == tasks.first.id }[:source_site_name]
    assert_equal "open", tasks.first.reload.state
    restricted = User.create!(email_address: "behavioral-queue-restricted@example.invalid", password: SecureRandom.hex(18))
    membership = @practice.memberships.create!(user: restricted)
    grant_permissions!(membership, "patients.read")
    grant_permissions!(membership, "encounters.write", scope_kind: "site", site: weight)
    denied_site = Clinic::Operations::FollowUpWorklist.call(practice: @practice, actor: restricted, site_id: @site.id)
    assert_empty denied_site[:clinical_tasks]
    assert_empty denied_site[:encounter_follow_ups]
  end

  private

  def assessment_attributes
    { category: "psychiatry_assessment", instrument_name: "Unscored clinician narrative", response_source: "clinician_observed" }
  end

  def create(kind, attributes = {}, encounter: @encounter, **fields)
    attributes = attributes.merge(fields)
    Clinic::Care::ClinicalPlanWorkflow.create(kind:, practice: @practice, actor: @user, patient: @patient,
      encounter:, attributes:, request_key: SecureRandom.uuid)
  end

  def revise(kind, record, attributes = {}, **fields)
    attributes = attributes.merge(fields)
    Clinic::Care::ClinicalPlanWorkflow.revise(kind:, series_id: record.series_id, practice: @practice,
      actor: @user, patient: @patient, encounter: @encounter, attributes:,
      expected_version: record.version_number, request_key: SecureRandom.uuid)
  end
end
