require "test_helper"

class GuidedClinicDemoTest < ActionDispatch::IntegrationTest
  setup do
    @previous_environment = Rails.env
    @previous_flag = ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env = "development"
    ENV["APP_DEVELOPMENT_LOGIN"] = "1"
    Rails.cache.clear
    ActionMailer::Base.deliveries.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1", "X-Clinic-Demo" => "1" }
  end

  teardown do
    Rails.env = @previous_environment
    ENV["APP_DEVELOPMENT_LOGIN"] = @previous_flag
  end

  test "contact capture logs usage without creating or personalizing a clinic" do
    get "/api/demo/run", headers: @headers
    assert_response :success
    assert_equal false, response.parsed_body.fetch("visitor_registered")
    assert_empty response.parsed_body.fetch("lessons")

    assert_difference "Development::DemoVisitor.count", 1 do
      assert_no_difference [ "Clinic::Practice.count", "User.count" ] do
        register_visitor
      end
    end

    visitor = Development::DemoVisitor.order(:id).last
    assert_equal "Taylor Example", visitor.name
    assert_equal "taylor@example.test", visitor.email
    assert_equal "Example Clinic", visitor.company
    assert_nil visitor.clinic_name
    assert_empty visitor.lesson_progress
    assert response.parsed_body.fetch("lessons").all? { |lesson| lesson.fetch("status") == "available" }
  end

  test "each entry resets and reuses the fixed clinic while retaining entry usage" do
    register_visitor
    first = enter_lesson("clinic_setup")
    first_record = Development::DemoRun.find(first.fetch("id"))
    practice = first_record.practice
    finalize!(first_record)
    assert Clinic::Configuration::PracticeFeatures.snapshot(practice:).fetch(:finalized)

    second = enter_lesson("clinic_setup")
    second_record = Development::DemoRun.find(second.fetch("id"))
    assert_equal practice.id, second_record.practice_id
    refute_equal first_record.id, second_record.id
    refute first_record.reload.active?
    assert_equal first_record.visitor_id, second_record.visitor_id
    refute Clinic::Configuration::PracticeFeatures.snapshot(practice:).fetch(:finalized)
    assert_equal 1, Development::DemoLesson.where(lesson_key: "clinic_setup", practice_id: practice.id).count
  end

  test "entering another lesson leaves its fixed clinic data isolated" do
    register_visitor
    setup_run = Development::DemoRun.find(enter_lesson("clinic_setup").fetch("id"))
    finalize!(setup_run)

    inventory_run = Development::DemoRun.find(enter_lesson("inventory_product_create").fetch("id"))
    refute_equal setup_run.practice_id, inventory_run.practice_id
    refute setup_run.reload.active?
    assert Clinic::Configuration::PracticeFeatures.snapshot(practice: setup_run.practice).fetch(:finalized)
    assert_equal 2, Development::DemoLesson.where(lesson_key: %w[clinic_setup inventory_product_create]).count
  end

  test "leaving a completed lesson records its outcome and elapsed time" do
    visitor = demo_visitor
    started_at = Time.zone.now.change(usec: 0) + 1.hour
    completed_at = started_at + 4.minutes

    run = travel_to(started_at) { Development::SharedDemoLesson.enter!("navigation_tour", visitor:) }
    run.update!(baseline: run.baseline.to_h.merge("review_acknowledged" => true))

    travel_to(completed_at) { Development::SharedDemoLesson.leave!(run) }

    run.reload
    assert_equal 240, run.elapsed_seconds
    assert_equal completed_at, run.completed_at
    refute run.active?
    assert_empty run.baseline
  end

  test "navigation tour prepares data for every clinic workspace" do
    run = Development::SharedDemoLesson.enter!("navigation_tour", visitor: demo_visitor)

    assert run.paid_patient?
    assert run.practice.appointments.where(patient: run.patient).exists?
    assert run.practice.encounters.where(patient: run.patient).exists?
    assert Clinic::Inventory::Receipt.where(practice: run.practice).exists?
    assert run.practice.patient_portal_requests.refill.where(patient: run.patient).exists?
    assert Clinic::EncounterFollowUp.where(practice: run.practice).exists?
    assert Clinic::Scheduling::WaitlistEntry.where(practice: run.practice, patient: run.patient).exists?
    assert run.practice.scribe_encounters.where(patient: run.patient).exists?
    assert Clinic::StaffConversation.where(practice: run.practice).exists?
    assert Clinic::Workforce::Employment.where(practice: run.practice).exists?
    assert Clinic::Telehealth::Visit.where(practice: run.practice).exists?
    assert Clinic::PatientReminder.where(practice: run.practice).exists?
  end

  test "sandbox prepares a full editable clinic without appearing as a lesson" do
    register_visitor
    payload = enter_lesson("sandbox")
    run = Development::DemoRun.find(payload.fetch("id"))

    assert_equal true, payload.fetch("sandbox")
    refute_includes payload.fetch("lessons").pluck("id"), "sandbox"
    refute_includes payload.fetch("lessons").pluck("id"), "sandbox_companion"
    assert_equal "/clinic", payload.fetch("steps").sole.fetch("href")
    organization = run.practice.organization
    assert_equal "Meta Clinic Sandbox #{run.practice_id}", organization.name
    assert_equal 2, organization.practices.count
    companion = organization.practices.where.not(id: run.practice_id).sole
    assert_equal "Sandbox Weight Management", companion.name
    assert_equal 2, companion.sites.count
    assert companion.patients.exists?(reference: "SANDBOX-PAT-001")
    assert companion.inventory_purchase_orders.exists?
    assert Clinic::Membership.active.exists?(practice: companion, user: run.operator_user)
    assert run.paid_patient?
    assert run.practice.appointments.where(patient: run.patient).exists?
    assert run.practice.encounters.where(patient: run.patient).exists?
    assert Clinic::Inventory::Receipt.where(practice: run.practice).exists?
    assert run.practice.patient_portal_requests.refill.where(patient: run.patient).exists?
    assert Clinic::EncounterFollowUp.where(practice: run.practice).exists?
    assert Clinic::Scheduling::WaitlistEntry.where(practice: run.practice, patient: run.patient).exists?
    assert run.practice.scribe_encounters.where(patient: run.patient).exists?
    assert Clinic::StaffConversation.where(practice: run.practice).exists?
    assert Clinic::Workforce::Employment.where(practice: run.practice).exists?
    assert Clinic::Telehealth::Visit.where(practice: run.practice).exists?
    assert Clinic::PatientReminder.where(practice: run.practice).exists?
    assert_equal 2, run.practice.sites.count
    assert_operator run.practice.patients.count, :>=, 8
    default_site = run.practice.sites.first!
    sandbox_references = Development::DemoSandboxPreparation::PATIENTS.map { |fixture| fixture.fetch(:reference) }
    sandbox_patients = run.practice.patients.where(reference: sandbox_references)
    sandbox_appointments = run.practice.appointments.where(patient: sandbox_patients).to_a
    assert_equal sandbox_patients.count, sandbox_appointments.count
    assert sandbox_appointments.all? { |appointment| appointment.site_id == default_site.id }
    tracked_encounter = run.practice.encounters.find_by!(patient: run.patient)
    assert tracked_encounter.appointment
    assert_equal default_site.id, tracked_encounter.appointment.site_id

    expected_appointments = (sandbox_appointments + [ tracked_encounter.appointment ]).uniq
    visible_appointment_ids = expected_appointments.group_by do |appointment|
      appointment.starts_at.in_time_zone(run.practice.timezone).strftime("%Y-%m-01")
    end.flat_map do |month, _appointments|
      get "/api/clinic/schedule_calendar", params: { site_id: default_site.id, date: month }, headers: @headers
      assert_response :success
      response.parsed_body.fetch("days").flat_map { |day| day.fetch("appointments").map { |row| row.fetch("id") } }
    end.uniq
    assert_equal expected_appointments.map(&:id).sort, visible_appointment_ids.sort
    assert_operator run.practice.appointments.distinct.pluck(:starts_at).map(&:to_date).uniq.count, :>=, 6
    assert_operator run.practice.pharmacy_products.count, :>=, 5
    assert_operator run.practice.inventory_suppliers.count, :>=, 4
    assert_operator run.practice.inventory_locations.count, :>=, 4
    assert_operator run.practice.inventory_purchase_orders.count, :>=, 5
    assert_operator run.practice.inventory_shipments.count, :>=, 5

    get "/api/clinic/context", headers: @headers
    assert_response :success
    assert_equal true, response.parsed_body.fetch("demo_sandbox")
    northside = run.practice.sites.find_by!(code: "SANDBOX-NORTH")
    patch "/api/clinic/context", params: { site_id: northside.id }, headers: csrf_headers, as: :json
    assert_response :success
    get "/api/clinic/context", headers: @headers
    assert_equal northside.id, response.parsed_body.dig("current_site", "id")
    patch "/api/clinic/context", params: { practice_id: companion.id }, headers: csrf_headers, as: :json
    assert_response :success
    get "/api/clinic/context", headers: @headers
    assert_equal companion.id, response.parsed_body.dig("practice", "id")
    assert_equal true, response.parsed_body.fetch("demo_sandbox")
    get "/api/session", headers: @headers
    assert_equal false, response.parsed_body.dig("user", "platform_owner")
  end

  test "sandbox appointments remain in the future after clinic hours" do
    run = nil

    travel_to(Time.zone.now.next_day.change(hour: 23, min: 30)) do
      run = Development::SharedDemoLesson.enter!("sandbox", visitor: demo_visitor)
      assert run.practice.appointments.all? { |appointment| appointment.starts_at >= Current.business_time }
    end
  end

  test "sandbox reset replaces every expanded fixture" do
    visitor = demo_visitor
    first = Development::SharedDemoLesson.enter!("sandbox", visitor:)
    first_site_id = first.practice.sites.find_by!(code: "SANDBOX-NORTH").id
    first_patient_id = first.practice.patients.find_by!(reference: "SANDBOX-PAT-001").id
    first_appointment_at = first.practice.appointments.find_by!(patient_id: first_patient_id).starts_at
    first_product_id = first.practice.pharmacy_products.find_by!(sku: "SANDBOX-PREP-PADS").id
    first_companion = first.practice.organization.practices.where.not(id: first.practice_id).sole
    first_companion_site_id = first_companion.sites.find_by!(code: "SANDBOX-NORTH").id

    second = travel_to(Time.zone.now + 14.days) do
      Development::SharedDemoLesson.enter!("sandbox", visitor:, previous_run: first)
    end

    assert_equal first.practice_id, second.practice_id
    refute second.practice.sites.exists?(first_site_id)
    refute second.practice.patients.exists?(first_patient_id)
    refute second.practice.pharmacy_products.exists?(first_product_id)
    assert_equal 2, second.practice.sites.count
    assert_operator second.practice.patients.count, :>=, 8
    second_patient = second.practice.patients.find_by!(reference: "SANDBOX-PAT-001")
    second_appointment_at = second.practice.appointments.find_by!(patient: second_patient).starts_at
    assert_operator second_appointment_at, :>, first_appointment_at
    assert_operator second.practice.pharmacy_products.count, :>=, 5
    second_companion = second.practice.organization.practices.where.not(id: second.practice_id).sole
    assert_equal first_companion.id, second_companion.id
    refute second_companion.sites.exists?(first_companion_site_id)
    assert_equal 2, second_companion.sites.count
  end

  test "an expired guided demo session can resume its bound lesson" do
    register_visitor
    run = Development::DemoRun.find(enter_lesson("navigation_tour").fetch("id"))
    expired_session = MemberSession.find_by!(user: run.operator_user)
    expired_session.destroy!

    post "/api/demo/run/resume", headers: csrf_headers, as: :json

    assert_response :success
    assert_equal run.id, response.parsed_body.dig("run", "id")
    refute MemberSession.exists?(expired_session.id)
    assert MemberSession.where(user: run.operator_user).exists?

    get "/api/session", headers: @headers
    assert_response :success
    assert_equal run.operator_user_id, response.parsed_body.dig("user", "id")
    assert_equal true, response.parsed_body.dig("clinic_access", "active")
  end

  test "a new entrant invalidates the previous lease with a restart notice" do
    register_visitor
    original = enter_lesson("clinic_setup")
    original_session_id = MemberSession.where(
      user_id: Development::DemoRun.find(original.fetch("id")).operator_user_id
    ).sole.id

    other = open_session
    other.host! "localhost:3000"
    register_visitor_for(other, email: "second@example.test")
    replacement = enter_lesson_for(other, "clinic_setup")
    assert_equal original.dig("clinic", "id"), replacement.dig("clinic", "id")
    refute_equal original.fetch("id"), replacement.fetch("id")

    get "/api/demo/run", headers: @headers
    assert_response :success
    assert_equal false, response.parsed_body.fetch("active")
    assert_equal true, response.parsed_body.fetch("visitor_registered")
    assert_match(/restarted in another demo session/i, response.parsed_body.fetch("notice"))
    refute MemberSession.exists?(original_session_id)
  end

  test "contact and lesson completion never become catalog progress" do
    register_visitor
    run = enter_lesson("operations_review")
    post "/api/demo/lesson/complete", headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "complete", response.parsed_body.dig("run", "steps", 0, "status")

    post "/api/demo/lesson", params: { lesson_key: nil }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal false, response.parsed_body.fetch("active")
    assert response.parsed_body.fetch("lessons").all? { |lesson| lesson.fetch("status") == "available" }
    assert_empty Development::DemoRun.find(run.fetch("id")).visitor.lesson_progress
  end

  test "review acknowledgement rejects action lessons and invalid lesson keys" do
    register_visitor
    assert_no_difference [ "Development::DemoLesson.count", "Clinic::Practice.count" ] do
      post "/api/demo/lesson", params: { lesson_key: "missing_lesson" }, headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
    end

    enter_lesson("clinic_setup")
    post "/api/demo/lesson/complete", headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_match(/guided action/i, response.parsed_body.fetch("error"))
  end

  test "scoped reset refuses ordinary and mismatched clinics and preserves update immutability" do
    ordinary_user = User.create!(email_address: "ordinary-reset@example.test",
      password: SecureRandom.urlsafe_base64(24), active: true)
    ordinary_practice = Development::TestClinic.create!(ordinary_user).practice

    assert_raises(ActiveRecord::StatementInvalid) do
      ApplicationRecord.transaction(requires_new: true) do
        call_reset_function("clinic_setup", ordinary_practice.id)
      end
    end

    register_visitor
    enter_lesson("patient_enroll")
    lesson = Development::DemoLesson.find_by!(lesson_key: "patient_enroll")
    assert_raises(ActiveRecord::StatementInvalid) do
      ApplicationRecord.transaction(requires_new: true) do
        call_reset_function("clinic_setup", lesson.practice_id)
      end
    end

    version = Clinic::Care::SubscriptionVersion.where(practice_id: lesson.practice_id).first!
    assert_raises(ActiveRecord::StatementInvalid) do
      ApplicationRecord.transaction(requires_new: true) do
        ApplicationRecord.connection.execute(
          "UPDATE clinic_subscription_versions SET snapshot = snapshot WHERE id = #{Integer(version.id)}"
        )
      end
    end
  end

  test "all forty six lessons provision independently with unfinished authoritative targets" do
    definitions = Development::DemoLessonCatalog.definitions
    assert_equal 46, definitions.size
    assert_equal definitions.size, definitions.pluck(:id).uniq.size
    assert_equal "navigation_tour", definitions.first.fetch(:id)
    visitor = demo_visitor
    previous = nil
    practice_ids = []

    definitions.each do |definition|
      run = Development::SharedDemoLesson.enter!(definition.fetch(:id), visitor:, previous_run: previous)
      practice_ids << run.practice_id
      assert_equal definition.fetch(:id), run.lesson_key
      assert_equal definition.fetch(:template_key, "primary_care"), run.template_key
      assert_equal run.practice_id, Development::DemoLesson.find_by!(lesson_key: run.lesson_key).practice_id
      assert_equal "available", Development::DemoLessonCatalog.step_for(run).fetch(:status)
      refute Development::DemoLessonCatalog.complete?(run), "#{run.lesson_key} started complete"
      assert_empty previous.reload.baseline if previous
      previous = run
    end

    assert_equal definitions.size, practice_ids.uniq.size
    assert_equal definitions.size, Development::DemoLesson.where(lesson_key: definitions.pluck(:id)).count
  end

  test "rich review and action clinics reset their cyclic fixtures in place" do
    visitor = demo_visitor
    keys = %w[
      patient_enroll telehealth_review scribe_review reminders_review messages_review workforce_review inventory_count
    ]

    keys.each do |lesson_key|
      first = Development::SharedDemoLesson.enter!(lesson_key, visitor:)
      practice_id = first.practice_id
      membership_count = first.practice.memberships.count
      refute_empty first.baseline

      second = Development::SharedDemoLesson.enter!(lesson_key, visitor:, previous_run: first)
      assert_equal practice_id, second.practice_id
      assert_equal 2, Development::DemoLesson.find_by!(lesson_key:).generation
      refute Development::DemoLessonCatalog.complete?(second), "#{lesson_key} reset complete"
      assert_empty first.reload.baseline
      assert_nil first.patient_user_id
      assert_nil first.membership_prospect_id
      assert_equal membership_count, second.practice.memberships.count if lesson_key == "messages_review"
      if lesson_key == "workforce_review"
        assert_equal 1, Clinic::Workforce::Employment.where(practice_id: second.practice_id).count
      end
      if lesson_key == "telehealth_review"
        appointment = second.practice.appointments.order(:id).last!
        date = appointment.starts_at.in_time_zone(second.practice.timezone).to_date.iso8601
        assert_equal "/clinic/telehealth?date=#{date}",
          Development::DemoLessonCatalog.step_for(second).fetch(:href)
        assert Clinic::Telehealth::Visit.where(practice_id: second.practice_id, appointment:).exists?
      end
      if lesson_key == "scribe_review"
        assert Clinic::Scribe::NoteTemplate.where(template_id: "soap", version: 1, status: "active").exists?
        assert second.practice.scribe_encounters.where(patient: second.patient).exists?
        treatment_step = Development::DemoLessonCatalog.steps_for(second).find { |step| step.fetch(:id) == "scribe_review_treatment" }
        assert_equal "/clinic/patients/#{second.patient.id}/encounters/#{second.practice.encounters.where(patient: second.patient).order(:id).last!.id}",
          treatment_step.fetch(:href)
      end
    end
  end

  test "specialty note revisions reset while retaining distinct clinic types and scenarios" do
    visitor = demo_visitor
    expected = {
      "primary_care__visit_save" => ["primary_care", "primary-care-follow-up", "daily energy and sleep"],
      "weight_management__visit_save" => ["weight_management", "weight-management-follow-up", "activity goal"]
    }

    expected.each do |lesson_key, (clinic_type, template_id, phrase)|
      first = Development::SharedDemoLesson.enter!(lesson_key, visitor:)
      note = first.practice.encounter_notes.order(:id).last!
      initial = note.revisions.order(:revision_no).last!
      payload = Clinic::Care::SoapNotePayload.load!(initial.encrypted_body)
      assert_equal clinic_type, first.template_key
      assert_equal template_id, payload.fetch(:template_id)
      assert_includes payload.dig(:sections, :subjective), phrase

      revised_body = Clinic::Care::SoapNotePayload.dump(
        template_id:, template_version: 1,
        sections: payload.fetch(:sections).merge(plan: "Revised synthetic follow-up plan.")
      )
      revision = Clinic::Care::ReviseEncounterNote.call(
        note:, actor: first.operator_user, encrypted_body: revised_body,
        expected_revision: initial.revision_no, request_key: "specialty-revision-#{first.id}"
      )
      assert Development::DemoLessonCatalog.complete?(first)

      second = Development::SharedDemoLesson.enter!(lesson_key, visitor:, previous_run: first)
      assert_equal first.practice_id, second.practice_id
      refute Clinic::EncounterNoteRevision.exists?(revision.id)
      refute Development::DemoLessonCatalog.complete?(second)
      assert_empty first.reload.baseline
      refreshed = Clinic::EncounterNoteRevision.where(practice_id: second.practice_id).order(:revision_no).last!
      assert_equal template_id, Clinic::Care::SoapNotePayload.load!(refreshed.encrypted_body).fetch(:template_id)
    end
  end

  test "the route is unavailable outside local development" do
    Rails.env = "test"
    get "/api/demo/run", headers: @headers
    assert_response :not_found
  end

  test "demo entry and reset preserve the regular browser session" do
    password = SecureRandom.urlsafe_base64(24)
    user = User.create!(email_address: "regular-isolation@example.test", password:, active: true)
    regular_headers = @headers.except("X-Clinic-Demo")
    get "/api/csrf", headers: regular_headers
    post "/api/session", params: { email_address: user.email_address, password: },
      headers: regular_headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token")), as: :json
    assert_response :success
    regular_session = user.member_sessions.sole.id

    register_visitor
    enter_lesson("clinic_setup")
    get "/api/session", headers: regular_headers
    assert_response :success
    assert_equal user.id, response.parsed_body.dig("user", "id")
    assert MemberSession.exists?(regular_session)

    post "/api/demo/run/reset", headers: csrf_headers, as: :json
    assert_response :success
    get "/api/session", headers: regular_headers
    assert_response :success
    assert_equal user.id, response.parsed_body.dig("user", "id")
  end

  test "sample scribe creation requires the active scribe lesson" do
    register_visitor
    run = Development::DemoRun.find(enter_lesson("scribe_review").fetch("id"))
    post "/api/clinic/scribe/encounters/create_synthetic",
      params: { encounter: { patient_id: run.patient.id, site_id: run.practice.sites.first!.id } },
      headers: csrf_headers, as: :json
    assert_response :created
    assert_equal run.patient.id, response.parsed_body.dig("encounter", "patient_id")
  end

  test "demo workspace prefix keeps CSRF and identity separate" do
    get "/api/demo-workspace/csrf", headers: @headers.except("X-Clinic-Demo")
    assert_response :success
    assert response.parsed_body.fetch("csrf_token").present?
    assert response.headers["Set-Cookie"].to_s.include?("_apply_demo_session")
    refute response.headers["Set-Cookie"].to_s.include?("_apply_session=")
  end

  test "hosted lessons require the dedicated database and staging opt in" do
    previous = ENV.to_h.slice("APP_GUIDED_DEMO", "APP_DEPLOYMENT_ENV", "PGDATABASE")
    Rails.env = "production"
    ENV["APP_GUIDED_DEMO"] = "1"
    ENV["APP_DEPLOYMENT_ENV"] = "staging"
    ENV["PGDATABASE"] = "apply"
    refute GuidedDemoAccess.hosted?
    ENV["PGDATABASE"] = "apply_guided_demo"
    assert GuidedDemoAccess.hosted?
    ENV["APP_DEPLOYMENT_ENV"] = "production"
    refute GuidedDemoAccess.hosted?
  ensure
    %w[APP_GUIDED_DEMO APP_DEPLOYMENT_ENV PGDATABASE].each { |key| ENV[key] = previous[key] }
  end

  test "hosted lesson sessions do not load local named account previews" do
    register_visitor
    enter_lesson("scribe_review")
    previous = ENV.to_h.slice("APP_GUIDED_DEMO", "APP_DEPLOYMENT_ENV", "PGDATABASE")
    Rails.env = "production"
    ENV["APP_GUIDED_DEMO"] = "1"
    ENV["APP_DEPLOYMENT_ENV"] = "staging"
    ENV["PGDATABASE"] = "apply_guided_demo"
    get "/api/session", headers: @headers
    assert_response :success
    assert_equal true, response.parsed_body.fetch("user").fetch("development_demo")
    assert_nil response.parsed_body.fetch("user").fetch("development_account_id")
  ensure
    %w[APP_GUIDED_DEMO APP_DEPLOYMENT_ENV PGDATABASE].each { |key| ENV[key] = previous[key] } if previous
  end
  private


  def register_visitor
    post "/api/demo/visitor",
      params: { name: "  Taylor Example  ", email: " TAYLOR@EXAMPLE.TEST ", company: "  Example Clinic  " },
      headers: csrf_headers, as: :json
    assert_response :success
  end

  def register_visitor_for(session, email:)
    session.post "/api/demo/visitor",
      params: { name: "Second Visitor", email:, company: "Example Clinic" },
      headers: csrf_headers_for(session), as: :json
    assert_equal 200, session.response.status
  end

  def enter_lesson(lesson_key)
    post "/api/demo/lesson", params: { lesson_key: }, headers: csrf_headers, as: :json
    assert_response :created, response.body
    response.parsed_body.fetch("run")
  end

  def enter_lesson_for(session, lesson_key)
    session.post "/api/demo/lesson", params: { lesson_key: }, headers: csrf_headers_for(session), as: :json
    assert_equal 201, session.response.status, session.response.body
    session.response.parsed_body.fetch("run")
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def csrf_headers_for(session)
    session.get "/api/csrf", headers: @headers
    assert_equal 200, session.response.status
    @headers.merge("X-CSRF-Token" => session.response.parsed_body.fetch("csrf_token"))
  end

  def finalize!(run)
    practice = run.practice
    membership = Clinic::Membership.find_by!(practice:, user_id: run.operator_user_id)
    snapshot = Clinic::Configuration::PracticeFeatures.snapshot(practice:)
    Clinic::Configuration::PracticeFeatures.revise(
      practice:, actor: membership, request_key: "guided-finalize-#{run.id}",
      expected_revision: snapshot.fetch(:revision), insurance_workflows_enabled: false,
      clinic_type: snapshot.fetch(:clinic_type), service_scope: snapshot.fetch(:service_scope),
      assessment_scope: snapshot.fetch(:assessment_scope), finalize: true
    )
  end

  def call_reset_function(lesson_key, practice_id)
    lesson = ApplicationRecord.connection.quote(lesson_key)
    ApplicationRecord.connection.execute(
      "SELECT development_reset_demo_practice(#{lesson}, #{Integer(practice_id)})"
    )
  end

  def demo_visitor
    Development::DemoVisitor.create!(
      name: "Synthetic Test Visitor", email: "demo-#{SecureRandom.hex(6)}@example.test", company: "Example Clinic"
    )
  end
end
