require "test_helper"

class QaOfficeQaTest < ActiveSupport::TestCase
  setup do
    @owner = User.create!(email_address: "office-qa-owner@example.invalid", password: "Independent-office-only!", platform_owner: true)
    @muse = Qa::ServiceToken.create!(user: @owner, recipient: "muse", scope: "office", name: "Independent Muse", digest: Digest::SHA256.hexdigest(SecureRandom.hex(32)))
    @dot = Qa::ServiceToken.create!(user: @owner, recipient: "codex", scope: "office", name: "Independent Dot", digest: Digest::SHA256.hexdigest(SecureRandom.hex(32)))
    Qa::Snapshot.put("office:bindings", { "config" => { "QA_OFFICE_ACTORS_ENABLED" => "1", "QA_OFFICE_MUSE_TOKEN_ID" => @muse.id.to_s, "QA_OFFICE_DOT_TOKEN_ID" => @dot.id.to_s, "QA_OFFICE_JOSH_USER_ID" => @owner.id.to_s } })
    @build = { "revision" => "a" * 40, "version" => "office-qa-test", "dirty" => false, "observed_at" => Time.current.iso8601 }
    @defect = { "id" => 42, "title" => "Independent defect", "severity" => "high", "status" => "open", "workflow" => "WF-001", "repro_steps" => "Open the example", "expected" => "Example opens", "actual" => "Example fails", "evidence_refs" => [], "repair_attempts" => 0, "revision" => "b" * 40, "version" => "old-build" }
    @import = { "request_key" => "import-full-ledger", "source" => %w[known_issues_sha256 coverage_sha256 workflows_sha256].to_h { |key| [ key, "c" * 64 ] }, "defects" => [ @defect ],
      "coverage" => (1..116).map { |id| { "id" => format("WF-%03d", id), "status" => "passed", "revision" => "b" * 40 } }, "pointer" => 42,
      "batches" => [ { "id" => "repair-42", "status" => "awaiting_deploy", "pr_number" => 66 } ] }
  end

  def with_workspace(name, value)
    original = Qa::Workspace.method(name)
    implementation = value.respond_to?(:call) ? value : ->(*) { value }
    Qa::Workspace.define_singleton_method(name, implementation)
    yield
  ensure
    Qa::Workspace.define_singleton_method(name, original)
  end

  def import
    Qa::OfficeQa.import_ledger(user: @owner, token: @muse, input: @import)
  end

  test "only server bound Muse imports the whole ledger and changed retries conflict" do
    assert_raises(Qa::OfficeActorPolicy::Denied) { Qa::OfficeQa.import_ledger(user: @owner, token: @dot, input: @import) }
    assert_raises(ArgumentError) { Qa::OfficeQa.import_ledger(user: @owner, token: @muse, input: @import.merge("coverage" => @import["coverage"].take(115))) }
    first = import
    assert_equal first, import
    assert_equal 1, Qa::Event.where(kind: "office_qa_ledger_import").count
    assert_raises(Qa::OfficeWork::Conflict) { Qa::OfficeQa.import_ledger(user: @owner, token: @muse, input: @import.merge("pointer" => 43)) }
    with_workspace(:build, @build) do
      result = Qa::OfficeQa.read
      assert_equal({ "open" => 1, "pending_retest" => 0, "fixed" => 0 }, result[:ledger][:counts])
      assert_equal 116, result[:coverage][:workflows].length
      assert result[:coverage][:workflows].all? { |item| item["stale_build"] }
      refute result[:capabilities][:file_defect]
    end
    @muse.update!(revoked_at: Time.current)
    assert_raises(Qa::OfficeActorPolicy::Denied) { import }
  end

  test "public history has unknown current counts and exact-build diff" do
    Qa::Snapshot.put("pin", { "revision" => "b" * 40 })
    with_workspace(:build, @build) do
      result = Qa::OfficeQa.read
      assert_nil result[:ledger][:counts]
      assert_nil result[:ledger][:imported_at]
      assert_includes result[:diff_url], "#{'b' * 40}...#{'a' * 40}"
    end
  end

  test "filing persists one observed Muse request and never invents ledger proof" do
    input = @defect.slice("title", "severity", "workflow", "repro_steps", "expected", "actual").merge("request_key" => "file-independent-defect")
    with_workspace(:build, @build) do
      first = Qa::OfficeQa.file_defect(user: @owner, token: @dot, input:)
      assert_equal first, Qa::OfficeQa.file_defect(user: @owner, token: @dot, input:)
      assert_equal false, first["ledger_recorded"]
      task = Qa::Task.find(first["task"]["id"])
      assert_equal "coordination", task.kind
      assert_equal "muse", task.recipient
      assert_equal @build["revision"], task.revision
      assert_equal @build["version"], task.payload.dig("report", "version")
      assert_equal task.id, Qa::Event.find_by!(kind: "office_qa_defect_submitted").payload["task_id"]
      assert_nil Qa::Snapshot.find_by(key: Qa::OfficeQa::KEY)
      assert_raises(Qa::OfficeWork::Conflict) { Qa::OfficeQa.file_defect(user: @owner, token: @dot, input: input.merge("actual" => "Different failure")) }
      assert_raises(Qa::OfficeActorPolicy::Denied) { Qa::OfficeQa.file_defect(user: nil, token: nil, input:) }
    end
    with_workspace(:build, @build.merge("dirty" => true)) do
      replay = Qa::OfficeQa.file_defect(user: @owner, token: @dot, input:)
      assert_equal @build["revision"], replay.dig("task", "revision")
    end
  end

  test "retests do not require pins and deduplicate known builds across principals" do
    import
    input = { "request_key" => "retest-independent-defect", "defect_id" => 42 }
    with_workspace(:build, @build) do
      first = Qa::OfficeQa.request_retest(user: @owner, token: @dot, input:)
      second = Qa::OfficeQa.request_retest(user: @owner, token: @muse, input: input.merge("request_key" => "second-agent-retest"))
      assert_equal first["task"]["id"], second["task"]["id"]
      assert_equal 1, Qa::Task.where(kind: "retest").count
      assert_equal "queued", first["task"]["status"]
      assert_empty first["task"]["allowed_transitions"]
    end
  end

  test "unavailable metadata records a pending defect and exact replay retains its original observation" do
    input = @defect.slice("title", "severity", "workflow", "repro_steps", "expected", "actual").merge("request_key" => "unknown-build-defect")
    saved = with_workspace(:build, { "revision" => nil }) do
      Qa::OfficeQa.file_defect(user: @owner, token: @dot, input:)
    end
    assert_nil saved.dig("task", "revision")
    task = Qa::Task.find(saved.dig("task", "id"))
    assert_equal "unavailable", task.payload.dig("report", "submission_build_observation", "status")
    with_workspace(:build, @build.merge("revision" => "e" * 40)) do
      assert_equal saved, Qa::OfficeQa.file_defect(user: @owner, token: @dot, input:)
    end
  end

  test "unknown repair attempts remain null while the three attempt cap stays enforced" do
    @import["defects"] = [ @defect.merge("repair_attempts" => nil) ]
    import
    assert_nil Qa::Snapshot.find_by!(key: Qa::OfficeQa::KEY).data.fetch("defects").first.fetch("repair_attempts")
    with_workspace(:build, @build) do
      assert_nil Qa::OfficeQa.read[:ledger][:defects].first.fetch("repair_attempts")
    end
    [ -1, 4 ].each do |attempts|
      input = @import.merge("request_key" => "invalid-repair-count-#{attempts}", "defects" => [ @defect.merge("repair_attempts" => attempts) ])
      assert_raises(ArgumentError) { Qa::OfficeQa.import_ledger(user: @owner, token: @muse, input:) }
    end
    assert_equal 3, Qa::OfficeQa.defect!(@defect.merge("repair_attempts" => 3))["repair_attempts"]
  end

  test "production build without dirty field files a report and its imported ledger record clears pending" do
    input = @defect.slice("title", "severity", "workflow", "repro_steps", "expected", "actual").merge("request_key" => "production-build-report")
    production = @build.slice("version", "revision")
    with_workspace(:build, production) do
      receipt = Qa::OfficeQa.file_defect(user: @owner, token: @dot, input:)
      task_id = receipt.fetch("task").fetch("id")
      assert_equal production["revision"], receipt.dig("task", "revision")
      assert_equal [ task_id ], Qa::OfficeQa.read[:ledger][:pending_requests].map { |task| task["id"] }
      Qa::Task.find(task_id).update!(status: "completed")
      assert_equal [ task_id ], Qa::OfficeQa.read[:ledger][:pending_requests].map { |task| task["id"] }, "Completion alone does not prove ledger recording"
      import
      assert_equal [ task_id ], Qa::OfficeQa.read[:ledger][:pending_requests].map { |task| task["id"] }, "An unrelated ledger import does not confirm the report"
      @import["request_key"] = "production-report-recorded"
      @import["defects"] = [ @defect.merge("originating_task_id" => task_id, "revision" => production["revision"], "version" => production["version"]) ]
      import
      assert_empty Qa::OfficeQa.read[:ledger][:pending_requests]
      assert Qa::Task.exists?(task_id), "Recorded request history is preserved"
    end
    with_workspace(:build, production.merge("dirty" => true)) do
      assert_equal true, Qa::OfficeQa.clean_build!["dirty"]
    end
  end

  test "poll reads only recorded PR and appends a retry-safe receipt" do
    import
    urls = []
    test_case = self
    reader = lambda do |uri, github:|
      test_case.assert github
      urls << uri.to_s
      if uri.path.end_with?("/pulls/66")
        { "number" => 66, "head" => { "sha" => "d" * 40 }, "state" => "open", "merged" => false }
      elsif uri.path.end_with?("/status")
        { "state" => "pending", "statuses" => [] }
      else
        { "check_runs" => [ { "status" => "completed", "conclusion" => "success" } ], "total_count" => 1 }
      end
    end
    with_workspace(:read_json, reader) do
      with_workspace(:build, @build) do
        input = { "request_key" => "poll-existing-batch", "batch_id" => "repair-42" }
        first = Qa::OfficeQa.poll_batch(user: @owner, token: @dot, input:)
        assert_equal first, Qa::OfficeQa.poll_batch(user: @owner, token: @dot, input:)
        assert_equal "awaiting_deploy", first["deployment"]
        assert_equal "success", first["ci_state"]
        assert_equal 3, urls.length
        assert_equal 1, Qa::Event.where(kind: "office_qa_batch_polled").count
        assert_raises(ArgumentError) { Qa::OfficeQa.poll_batch(user: @owner, token: @dot, input: input.merge("batch_id" => "unrecorded-pr")) }
      end
    end
  end
end
