require "test_helper"

class ClinicAssistantDemoEntryTest < ActionDispatch::IntegrationTest
  setup do
    @previous_environment = Rails.env
    @previous_login_flag = ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env = "development"
    ENV["APP_DEVELOPMENT_LOGIN"] = "1"
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1", "X-Clinic-Demo" => "1" }
  end

  teardown do
    Rails.env = @previous_environment
    ENV["APP_DEVELOPMENT_LOGIN"] = @previous_login_flag
  end

  test "fresh demo visitor is generated server-side and enters assistant without account credentials" do
    assert_difference "Development::DemoVisitor.count", 1 do
      post "/api/demo/visitor", params: {}, headers: csrf_headers, as: :json
    end
    assert_response :success
    assert_equal true, response.parsed_body.fetch("visitor_registered")
    refute response.parsed_body.key?("visitor")
    visitor = Development::DemoVisitor.order(:id).last
    assert_equal "Demo visitor", visitor.name
    assert_match(/\Avisitor-[0-9a-f-]+@example\.invalid\z/, visitor.email)

    assert_no_difference "Development::DemoVisitor.count" do
      post "/api/demo/visitor", params: {}, headers: csrf_headers, as: :json
    end
    assert_response :success
    assert_equal true, response.parsed_body.fetch("visitor_registered")

    post "/api/demo/lesson", params: { lesson_key: "appointment_schedule" }, headers: csrf_headers, as: :json
    assert_response :created, response.body
    run = Development::DemoRun.find(response.parsed_body.dig("run", "id"))
    assert_equal visitor.id, run.visitor_id
    assert run.patient
    refute_nil run.operator_user_id

    post "/api/clinic/assistant/context", params: { patient_id: run.patient.id }, headers: csrf_headers, as: :json
    assert_response :created, response.body
    context = Clinic::Assistant::Context.find_by!(public_id: response.parsed_body.fetch("context_id"))
    assert_equal run.operator_user_id, context.actor_user_id
    assert_equal run.practice_id, context.practice_id
    assert_equal run.patient.id, context.patient_id
    assert_equal run.practice.sites.first!.id, context.site_id
  end

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
