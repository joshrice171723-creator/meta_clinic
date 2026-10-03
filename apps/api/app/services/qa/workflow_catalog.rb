require_relative "workflow_contract"

module Qa
  # Source artifact validation only. No ledger import, storage or execution.
  class WorkflowCatalog
    C = WorkflowContract
    FIELDS = %w[id title owner_policy required_roles prerequisites fixtures steps dependencies evidence_spec execution_mode].freeze

    class UniqueObject < Hash
      def []=(key, value)
        raise ArgumentError, "Duplicate JSON keys are ambiguous." if key?(key)
        super
      end
    end

    def self.parse(content)
      raise ArgumentError, "Catalog must be JSON of at most 2 MB." unless content.is_a?(String) && content.bytesize <= 2_000_000
      validate(JSON.parse(content, object_class: UniqueObject, allow_duplicate_key: false))
    rescue JSON::ParserError
      raise ArgumentError, "Catalog must be valid JSON."
    end

    def self.validate(input)
      C.object!(input, %w[schema_version state source workflows])
      raise ArgumentError, "Unsupported catalog schema." unless input["schema_version"] == 1
      rows = C.list!(input["workflows"])
      if input["state"] == "unconfigured"
        raise ArgumentError, "Unconfigured catalog cannot imply content or provenance." unless rows.empty? && input["source"].nil?
      else
        raise ArgumentError, "Provide a complete canonical catalog or leave it unconfigured." unless input["state"] == "complete" && rows.length == 116
        C.object!(input["source"], %w[workflows_sha256 coverage_state_sha256 evidence_refs])
        %w[workflows_sha256 coverage_state_sha256].each { |field| C.match!(input["source"][field], C::DIGEST) }
        C.strings!(input["source"]["evidence_refs"], minimum: 1, maximum: 20)
        rows.each { |row| validate_workflow(row) }
        raise ArgumentError, "Catalog must contain each canonical ID exactly once." unless rows.map { |row| row["id"] }.sort == C::IDS
      end
      C.immutable_copy(input)
    end

    def self.validate_workflow(row)
      C.object!(row, FIELDS)
      C.workflow!(row["id"])
      C.text!(row["title"], maximum: 200)
      owner = C.object!(row["owner_policy"], %w[assignment eligible_actors])
      raise ArgumentError, "Ownership requires explicit manual assignment." unless owner["assignment"] == "manual"
      actors = C.strings!(owner["eligible_actors"], minimum: 1, maximum: 4)
      raise ArgumentError, "Unknown actor policy; names do not establish a binding." unless (actors - %w[josh muse dot codex]).empty?
      C.strings!(row["required_roles"], minimum: 1, maximum: 20)
      C.strings!(row["prerequisites"], maximum: 50)
      C.strings!(row["fixtures"], maximum: 50)
      raise ArgumentError, "Declare read_only or requires_write_approval." unless %w[read_only requires_write_approval].include?(row["execution_mode"])
      steps = C.list!(row["steps"], minimum: 1, maximum: 100)
      steps.each do |step|
        C.object!(step, %w[id route selector action fixture_key expected effect])
        C.match!(step["id"], /\A[a-z][a-z0-9_-]{0,79}\z/)
        C.text!(step["route"], maximum: 500)
        raise ArgumentError, "Steps require a same-origin route." unless step["route"].start_with?("/") && !step["route"].start_with?("//") && !step["route"].include?("\\")
        C.text!(step["selector"], maximum: 500)
        raise ArgumentError, "Unsupported declarative action." unless %w[navigate assert click fill select].include?(step["action"])
        raise ArgumentError, "Unknown named fixture." unless step["fixture_key"].nil? || row["fixtures"].include?(step["fixture_key"])
        raise ArgumentError, "Input actions require a named fixture, not inline data." if %w[fill select].include?(step["action"]) && step["fixture_key"].nil?
        raise ArgumentError, "Declare the step effect." unless %w[read_only write].include?(step["effect"])
        raise ArgumentError, "Read-only workflow cannot declare a write step." if row["execution_mode"] == "read_only" && step["effect"] != "read_only"
        C.list!(step["expected"], minimum: 1, maximum: 20).each do |expected|
          C.object!(expected, %w[kind value])
          raise ArgumentError, "Unknown expected-result kind." unless %w[text element url].include?(expected["kind"])
          C.text!(expected["value"])
        end
      end
      ids = steps.map { |step| step["id"] }
      raise ArgumentError, "Step IDs must be unique." unless ids.uniq == ids
      dependencies = C.object!(row["dependencies"], %w[workflows services config_flags])
      C.strings!(dependencies["workflows"]).each do |id|
        C.workflow!(id)
        raise ArgumentError, "A workflow cannot depend on itself." if id == row["id"]
      end
      %w[services config_flags].each { |field| C.strings!(dependencies[field], maximum: 50) }
      spec = C.list!(row["evidence_spec"], minimum: 1, maximum: 300)
      spec.each do |item|
        C.object!(item, %w[step_id kind required])
        raise ArgumentError, "Evidence must reference a declared step." unless ids.include?(item["step_id"])
        raise ArgumentError, "Unsupported evidence kind." unless %w[screenshot text url].include?(item["kind"])
        raise ArgumentError, "Evidence requirement must be explicit." unless [true, false].include?(item["required"])
      end
      raise ArgumentError, "Each step needs an explicit required evidence specification." unless ids.all? { |id| spec.any? { |item| item["step_id"] == id && item["required"] } }
      pairs = spec.map { |item| [item["step_id"], item["kind"]] }
      raise ArgumentError, "Duplicate evidence specifications." unless pairs.uniq == pairs
      row
    end

    def self.fetch(input, workflow_id)
      catalog = validate(input)
      raise ArgumentError, "Canonical workflow catalog is unconfigured." unless catalog["state"] == "complete"
      C.workflow!(workflow_id)
      catalog["workflows"].find { |row| row["id"] == workflow_id }
    end
  end
end
