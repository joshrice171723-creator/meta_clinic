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
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
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

  test "all forty five lessons provision independently with unfinished authoritative targets" do
    definitions = Development::DemoLessonCatalog.definitions
    assert_equal 45, definitions.size
    assert_equal definitions.size, definitions.pluck(:id).uniq.size
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
