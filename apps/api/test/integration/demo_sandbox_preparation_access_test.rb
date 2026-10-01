require "test_helper"

class DemoSandboxPreparationAccessTest < ActionDispatch::IntegrationTest
  setup do
    @previous_environment = Rails.env
    @previous_flag = ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env = "development"
    ENV["APP_DEVELOPMENT_LOGIN"] = "1"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1", "X-Clinic-Demo" => "1" }
    @owner = open_session
    @other = open_session
    [ @owner, @other ].each { |browser| browser.host! "localhost:3000" }
    register(@owner, "owner")
    register(@other, "other")

    # Use the small local tour fixture, not the expanded sandbox or a shared reset.
    @owner.post "/api/demo/lesson", params: { lesson_key: "navigation_tour" },
      headers: csrf_headers(@owner), as: :json
    assert_equal 201, @owner.response.status
    @run = Development::DemoRun.find(@owner.response.parsed_body.dig("run", "id"))
    @lesson = Development::DemoLesson.find_by!(practice_id: @run.practice_id)
    @lesson.update!(lesson_key: "sandbox")
    @run.update!(lesson_key: "sandbox", baseline: { "sandbox_preparation_step" => completed_step })
    @other.post "/api/demo/lesson", params: { lesson_key: "sandbox" },
      headers: csrf_headers(@other), as: :json
    assert_equal 201, @other.response.status
    assert_equal @run.id.to_s, @other.response.parsed_body.dig("run", "id").to_s
  end

  teardown do
    Rails.env = @previous_environment
    ENV["APP_DEVELOPMENT_LOGIN"] = @previous_flag
  end

  test "another bound visitor can confirm completed preparation without mutations" do
    before_run = @run.reload.attributes
    before_lesson = @lesson.reload.attributes
    with_preparer_stub(Development::SharedDemoLesson::SANDBOX_PREPARERS.first, ->(*) { flunk "Must not run a preparer" }) do
      prepare(@other)
      assert_equal 200, @other.response.status
      assert_equal true, @other.response.parsed_body.fetch("complete")
      prepare(@other)
      assert_equal 200, @other.response.status
    end
    assert_equal before_run, @run.reload.attributes
    assert_equal before_lesson, @lesson.reload.attributes
  end

  test "another visitor cannot advance incomplete or legacy unmarked preparation" do
    [ { "sandbox_preparation_step" => 0 }, {} ].each do |baseline|
      @run.update!(baseline:)
      before_run = @run.reload.attributes
      before_lesson = @lesson.reload.attributes
      with_preparer_stub(Development::SharedDemoLesson::SANDBOX_PREPARERS.first, ->(*) { flunk "Unauthorized preparation" }) do
        prepare(@other)
        assert_equal 404, @other.response.status
      end
      assert_equal before_run, @run.reload.attributes
      assert_equal before_lesson, @lesson.reload.attributes
    end
  end

  test "owner finishes the last stage once and another visitor only confirms it" do
    @run.update!(baseline: { "sandbox_preparation_step" => completed_step - 1 })
    generation = @lesson.reload.generation
    calls = 0
    with_preparer_stub(Development::SharedDemoLesson::SANDBOX_PREPARERS.last, ->(*) { calls += 1 }) do
      prepare(@owner)
      assert_equal 200, @owner.response.status
      assert_equal true, @owner.response.parsed_body.fetch("complete")
      prepare(@other)
      assert_equal 200, @other.response.status
      assert_equal true, @other.response.parsed_body.fetch("complete")
    end
    assert_equal 1, calls
    assert_equal completed_step, @run.reload.baseline.fetch("sandbox_preparation_step")
    assert_equal generation + 1, @lesson.reload.generation
  end

  test "an inactive run cannot confirm completed preparation" do
    @run.update!(active: false)
    prepare(@other)
    assert_equal 404, @other.response.status
  end

  private

  def with_preparer_stub(preparer, replacement)
    original = preparer.method(:prepare!)
    preparer.define_singleton_method(:prepare!, &replacement)
    yield
  ensure
    preparer.define_singleton_method(:prepare!, original) if original
  end

  def completed_step = Development::SharedDemoLesson::SANDBOX_PREPARERS.length

  def register(browser, label)
    browser.post "/api/demo/visitor", params: {
      name: "Synthetic #{label}", email: "#{label}-#{SecureRandom.hex(6)}@example.test", company: "Synthetic Clinic"
    }, headers: csrf_headers(browser), as: :json
    assert_equal 200, browser.response.status
  end

  def csrf_headers(browser)
    browser.get "/api/csrf", headers: @headers
    assert_equal 200, browser.response.status
    @headers.merge("X-CSRF-Token" => browser.response.parsed_body.fetch("csrf_token"))
  end

  def prepare(browser)
    browser.post "/api/demo/sandbox/prepare", params: {}, headers: csrf_headers(browser), as: :json
  end
end
