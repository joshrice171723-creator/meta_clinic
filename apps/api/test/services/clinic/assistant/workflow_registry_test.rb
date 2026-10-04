require "test_helper"

class WorkflowRegistryTest < ActiveSupport::TestCase
  test "catalog checks site readiness once and still authorizes each workflow" do
    registry = Clinic::Assistant::WorkflowRegistry
    authorization_log = []
    handler = Class.new do
      define_method(:initialize) { |**_context| }
      define_method(:authorize!) { |key:, inputs:| authorization_log << key }
    end
    definitions = %w[test.first test.second test.third].map do |key|
      { "key" => key, "title" => key.humanize, "domain" => "test", "description" => "Test operation",
        "kind" => "read", "fields" => [], "patient_required" => false, "encounter_required" => false,
        "handler" => handler }
    end
    original_definitions = registry.method(:definitions)
    original_site_ready = registry.method(:site_ready?)
    readiness_calls = 0
    registry.define_singleton_method(:definitions) { definitions }
    registry.define_singleton_method(:site_ready?) do |_context|
      readiness_calls += 1
      true
    end
    context = Struct.new(:practice, :actor_user, :site, :patient, :encounter).new(nil, nil, nil, nil, nil)

    catalog = registry.catalog(context:)

    assert_equal 1, readiness_calls
    assert_equal definitions.map { |entry| entry.fetch("key") }, authorization_log
    assert catalog.all? { |entry| entry.fetch("availability") == "available" }
  ensure
    registry.define_singleton_method(:definitions, original_definitions) if original_definitions
    if original_site_ready
      registry.define_singleton_method(:site_ready?, original_site_ready)
      registry.send(:private_class_method, :site_ready?)
    end
  end
end
