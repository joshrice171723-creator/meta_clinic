# Independently synthetic contract definitions; never seeded into live QA.
module QaWorkflowContractFixtures
  def with_qa_method(receiver, name, implementation)
    original = receiver.method(name)
    receiver.define_singleton_method(name) { |*args, **kwargs, &block| implementation.call(*args, **kwargs, &block) }
    yield
  ensure
    receiver.define_singleton_method(name, original)
  end

  def catalog
    @catalog ||= {
      "schema_version" => 1, "state" => "complete",
      "source" => { "workflows_sha256" => "a" * 64, "coverage_state_sha256" => "b" * 64, "evidence_refs" => ["synthetic-contract-source"] },
      "workflows" => Qa::WorkflowContract::IDS.map do |id|
        { "id" => id, "title" => "Synthetic contract fixture #{id}",
          "owner_policy" => { "assignment" => "manual", "eligible_actors" => ["muse"] },
          "required_roles" => ["synthetic_reader"], "prerequisites" => [], "fixtures" => ["synthetic_empty_board"],
          "execution_mode" => "read_only",
          "steps" => [{ "id" => "open", "route" => "/synthetic-contract", "selector" => "[data-testid=synthetic-board]", "action" => "assert", "fixture_key" => nil,
            "expected" => [{ "kind" => "text", "value" => "Synthetic ready" }], "effect" => "read_only" }],
          "dependencies" => { "workflows" => [], "services" => [], "config_flags" => [] },
          "evidence_spec" => [{ "step_id" => "open", "kind" => "screenshot", "required" => true }] }
      end
    }
  end
end
