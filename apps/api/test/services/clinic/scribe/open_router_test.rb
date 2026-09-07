require "test_helper"

class Clinic::Scribe::OpenRouterTest < ActiveSupport::TestCase
  setup do
    @prior_key = ENV["OPENROUTER_API_KEY"]
    @prior_model = ENV["OPENROUTER_SCRIBE_MODEL"]
    ENV["OPENROUTER_API_KEY"] = "test-openrouter-key"
    ENV["OPENROUTER_SCRIBE_MODEL"] = "test/free-audio"
  end

  teardown do
    @prior_key ? ENV["OPENROUTER_API_KEY"] = @prior_key : ENV.delete("OPENROUTER_API_KEY")
    @prior_model ? ENV["OPENROUTER_SCRIBE_MODEL"] = @prior_model : ENV.delete("OPENROUTER_SCRIBE_MODEL")
  end

  test "request includes captured reviewer context reviewed labs audio and forced result tool" do
    response = http_response(Net::HTTPOK, "200", "OK", "{}")
    captured = with_stubbed_http(response) do
      Clinic::Scribe::OpenRouter.send(:request, audio: "audio bytes".b, format: "ogg", duration_ms: 30_102,
        reviewer_context: "Reviewer documents ankle soreness.",
        lab_reports: [{ lab_report_id: 8, lab_report_version_id: 13, content_digest: "a" * 64,
          source_name: "Clinic laboratory", title: "Metabolic panel", status: "final",
          collected_at: "2026-09-07T14:00:00Z", issued_at: "2026-09-07T15:00:00Z",
          results: [{ "name" => "Potassium", "code" => "2823-3", "value" => "4.2", "unit" => "mmol/L" }] }])
    end

    body = JSON.parse(captured.fetch(:request).body)
    assert_equal "test/free-audio", body.fetch("model")
    content = body.dig("messages", 1, "content")
    audio = content.find { |item| item["type"] == "input_audio" }
    assert_equal({ "data" => Base64.strict_encode64("audio bytes".b), "format" => "ogg" }, audio.fetch("input_audio"))
    source_material = JSON.parse(content.find { |item| item["type"] == "text" }.fetch("text").split("JSON:\n", 2).last)
    assert_equal "Reviewer documents ankle soreness.", source_material.fetch("reviewer_context")
    lab = source_material.fetch("reviewed_lab_reports").sole
    assert_equal 13, lab.fetch("lab_report_version_id")
    assert_equal "4.2", lab.fetch("results").sole.fetch("value")
    assert_equal "mmol/L", lab.fetch("results").sole.fetch("unit")
    assert_equal "submit_scribe_result", body.dig("tool_choice", "function", "name")
    tool = body.fetch("tools").sole
    assert_equal Clinic::Scribe::Workflow::SECTIONS.sort,
      tool.dig("function", "parameters", "properties", "sections", "required").sort
  end

  test "malformed provider error payload retains the classified HTTP failure" do
    response = http_response(Net::HTTPBadRequest, "400", "Bad Request", '{"error":"malformed"}')

    error = assert_raises(Clinic::Scribe::OpenRouter::Error) do
      with_stubbed_http(response) do
        Clinic::Scribe::OpenRouter.send(:request, audio: "audio".b, format: "ogg", duration_ms: 1_000,
          reviewer_context: nil, lab_reports: [])
      end
    end

    assert_equal "invalid_provider_request", error.code
    assert_equal 400, error.http_status
    assert_nil error.provider_code
  end

  private

  def with_stubbed_http(response)
    captured = {}
    http = Object.new
    http.define_singleton_method(:request) do |request|
      captured[:request] = request
      response
    end
    singleton = Net::HTTP.singleton_class
    original = Net::HTTP.method(:start)
    singleton.define_method(:start) do |*_args, **_options, &block|
      block.call(http)
    end
    yield captured
    captured
  ensure
    singleton&.define_method(:start, original) if original
  end

  def http_response(type, code, message, body)
    response = type.new("1.1", code, message)
    response.instance_variable_set(:@read, true)
    response.instance_variable_set(:@body, body)
    response
  end
end
