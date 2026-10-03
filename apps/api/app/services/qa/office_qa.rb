module Qa
  # A mirror of Muse's ledger; submitted reports are work, not ledger proof.
  class OfficeQa
    KEY = "office:qa-ledger".freeze
    SHA = /\A[0-9a-f]{40}\z/
    HASH = /\A[0-9a-f]{64}\z/
    DEFECT_FIELDS = %w[id title severity status workflow repro_steps expected actual evidence_refs repair_attempts revision version originating_task_id].freeze

    def self.read(user: nil, token: nil)
      principal = principal(user, token)
      build = Workspace.build
      MuseWrites.expire_stale_claims!(build:)
      pin = Snapshot.find_by(key: "pin")&.data
      mirror = Snapshot.find_by(key: KEY)&.data
      state = Workspace.state
      defects = mirror ? mirror.fetch("defects") : state.fetch("known_issues", [])
      coverage = mirror ? mirror.fetch("coverage") : state.fetch("coverage", [])
      batches = mirror ? mirror.fetch("batches") : state.fetch("batches", [])
      recorded_tasks = defects.filter_map { |item| item["originating_task_id"] }
      counts = mirror && %w[open pending_retest fixed].to_h { |status| [ status, defects.count { |item| item["status"] == status } ] }
      old = pin&.fetch("revision", nil)
      revision = build["revision"]
      diff = "https://github.com/#{Workspace::REPOSITORY}/compare/#{old}...#{revision}" if old&.match?(SHA) && revision&.match?(SHA) && old != revision
      { build:, pin:, diff_url: diff,
        ledger: { source: mirror ? mirror.fetch("source_label", "Muse KNOWN_ISSUES.md") : "Historical import; fresh Muse ledger unavailable", imported_at: mirror&.fetch("imported_at", nil),
          counts:, defects:, pending_requests: Task.where(kind: "coordination").where("payload ->> 'office_action' = 'file_defect'").where.not(id: recorded_tasks).order(created_at: :desc).limit(100).map { |task| OfficeWork.task_json(task, principal:) } },
        coverage: { workflows: coverage.map { |item| item.merge("stale_build" => item["revision"].blank? || item["revision"] != revision || build["dirty"] == true) },
          pointer: mirror ? mirror["pointer"] : state["coverage_pointer"], imported_at: mirror&.fetch("imported_at", nil), source: mirror ? mirror.fetch("source_label", "Muse COVERAGE_STATE.json / WORKFLOWS.md") : "Historical import", expected_total: 116 },
        retest_requests: (Snapshot.find_by(key: MuseWrites::RETEST_SNAPSHOT)&.data&.fetch("requests", []) || []).map { |item| item.merge("ready" => item["requested_on_build"] != revision && revision.present? && build["dirty"] == false && old == revision) },
        batches: batches.map { |batch| batch.merge("poll" => Snapshot.find_by(key: "office:batch:#{batch['id']}")&.data) },
        active_batch: batches.find { |batch| !%w[completed closed retested cancelled].include?(batch["status"]) },
        capabilities: { file_defect: principal.present?, request_retest: principal.present?, poll_batch: principal.present?, import_ledger: principal&.fetch(:name) == "muse" } }
    end

    def self.principal(user, token)
      OfficeWork.identity(user, token)
    rescue OfficeActorPolicy::Denied
      nil
    end

    def self.import_ledger(user:, token:, input:)
      raise OfficeActorPolicy::Denied, "Only bound Muse can mirror its authoritative ledger." unless OfficeWork.identity(user, token)[:name] == "muse"
      raise ArgumentError, "Ledger mirror exceeds 1 MB." if input.to_json.bytesize > 1_000_000
      exact_fields!(input, %w[request_key source defects coverage pointer batches])
      source = input["source"]
      raise ArgumentError, "Provide hashes of all three source files." unless source.is_a?(Hash) && source.keys.sort == %w[coverage_sha256 known_issues_sha256 workflows_sha256] && source.values.all? { |value| value.is_a?(String) && value.match?(HASH) }
      defects = input["defects"]
      raise ArgumentError, "Provide the full defect array, at most 1000 records." unless defects.is_a?(Array) && defects.length <= 1000
      defects = defects.map { |item| defect!(item) }
      raise ArgumentError, "Defect ids must be unique." unless defects.map { |item| item["id"] }.uniq.length == defects.length
      coverage = Workspace.coverage_export({ "coverage" => input["coverage"], "pointer" => input["pointer"] })
      raise ArgumentError, "A full ledger mirror requires all 116 workflows." unless coverage["coverage"].length == 116
      batches = input["batches"]
      raise ArgumentError, "Provide up to 100 batch records." unless batches.is_a?(Array) && batches.length <= 100 && batches.all? { |item| item.is_a?(Hash) && item["id"].is_a?(String) && item["id"].match?(/\A[A-Za-z0-9_-]{1,80}\z/) && item.to_json.bytesize <= 10_000 }
      batches.each do |item|
        exact_fields!(item, %w[id status title pr_number head revision version ci_state notes observed_at], required: %w[id status])
        AgentRoom.text!(item, "status", 80)
        raise ArgumentError, "Batch fields must be scalar values." unless item.values.all? { |value| value.nil? || value.is_a?(String) || value.is_a?(Integer) }
        raise ArgumentError, "Batch PR must be a positive number." if item["pr_number"] && !(item["pr_number"].is_a?(Integer) && item["pr_number"].positive?)
        %w[head revision].each { |field| raise ArgumentError, "Batch revisions require a full SHA." if item[field] && !(item[field].is_a?(String) && item[field].match?(SHA)) }
      end
      raise ArgumentError, "Batch ids must be unique." unless batches.map { |item| item["id"] }.uniq.length == batches.length
      AgentRoom.reject_credentials!(input)
      record = { "source" => source, "defects" => defects, "coverage" => coverage["coverage"], "pointer" => input["pointer"], "batches" => batches }
      operation(user, token, input, "ledger_import", record) do |identity, receipt_id|
        raise OfficeActorPolicy::Denied, "Only bound Muse can mirror its ledger." unless identity[:name] == "muse"
        Snapshot.put(KEY, record.merge("imported_at" => Time.current.iso8601))
        { "receipt_id" => receipt_id, "imported" => true, "defects" => defects.length, "workflows" => 116 }
      end
    end

    def self.defect!(item)
      exact_fields!(item, DEFECT_FIELDS, required: %w[id title severity status workflow repro_steps expected actual evidence_refs repair_attempts revision version])
      raise ArgumentError, "A defect requires its positive ledger id." unless item["id"].is_a?(Integer) && item["id"].positive?
      AgentRoom.text!(item, "title", 200)
      raise ArgumentError, "Invalid severity or ledger state." unless %w[critical high medium low unknown].include?(item["severity"]) && %w[open pending_retest fixed].include?(item["status"])
      workflow!(item["workflow"])
      %w[repro_steps expected actual].each { |field| raise ArgumentError, "#{field} exceeds 4000 characters." unless item[field].nil? || item[field].is_a?(String) && item[field].length <= 4000 }
      raise ArgumentError, "Repair attempts must be 0–3 or null when unknown." unless item["repair_attempts"].nil? || item["repair_attempts"].is_a?(Integer) && item["repair_attempts"].between?(0, 3)
      raise ArgumentError, "Revision must be a full SHA or null." unless item["revision"].nil? || item["revision"].is_a?(String) && item["revision"].match?(SHA)
      raise ArgumentError, "Version must be at most 100 characters or null." unless item["version"].nil? || item["version"].is_a?(String) && item["version"].length <= 100
      refs = item["evidence_refs"]
      raise ArgumentError, "Provide at most five stored evidence ids or public HTTPS references." unless refs.is_a?(Array) && refs.length <= 5 && refs.all? { |ref| evidence_reference?(ref) }
      if item["originating_task_id"] && !(item["originating_task_id"].is_a?(Integer) && item["originating_task_id"].positive? && Task.exists?(id: item["originating_task_id"], kind: "coordination"))
        raise ArgumentError, "originating_task_id must identify existing Office work."
      end
      item
    end

    def self.file_defect(user:, token:, input:)
      exact_fields!(input, %w[request_key title severity workflow repro_steps expected actual])
      AgentRoom.text!(input, "title", 200)
      raise ArgumentError, "Choose a severity." unless %w[critical high medium low].include?(input["severity"])
      workflow!(input["workflow"])
      %w[repro_steps expected actual].each { |field| AgentRoom.text!(input, field, 4000) }
      build = clean_build!
      report = input.except("request_key").merge("revision" => build["revision"], "version" => build["version"])
      operation(user, token, input, "defect_submitted", report) do |identity, receipt_id|
        title = "File defect: #{input['title']}".truncate(200)
        task = Task.create!(user:, kind: "coordination", recipient: "muse", title:, revision: build["revision"], request_key: "office-defect-#{receipt_id}", request_digest: Task.fingerprint(report),
          payload: { office_action: "file_defect", report:, description: "Write this exact-build report to KNOWN_ISSUES.md, then import the full ledger with this task's originating_task_id. Do not run QA.",
            office_status: "queued", requester_principal: identity[:key], requester_actor: identity[:name], assigned_actor: "muse" })
        { "task" => OfficeWork.task_json(task, principal: identity), "receipt_id" => receipt_id, "delivery" => "submitted", "ledger_recorded" => false }
      end
    end

    def self.request_retest(user:, token:, input:)
      exact_fields!(input, %w[request_key defect_id])
      raise ArgumentError, "defect_id must be a positive ledger id." unless input["defect_id"].is_a?(Integer) && input["defect_id"].positive?
      defect = Snapshot.find_by(key: KEY)&.data&.fetch("defects", [])&.find { |item| item["id"] == input["defect_id"] }
      raise ArgumentError, "Import the current Muse ledger before requesting this retest." unless defect
      build = clean_build!
      raise OfficeWork::Conflict, "Confirm the current exact-build pin before queuing a retest." unless Snapshot.find_by(key: "pin")&.data&.fetch("revision", nil) == build["revision"]
      report = { "defect_id" => defect["id"], "revision" => build["revision"] }
      operation(user, token, input, "retest_submitted", report) do |identity, receipt_id|
        # One retest per defect/build; an explicit new build is the retry boundary.
        key = "office-retest-#{defect['id']}-#{build['revision']}"
        task = Task.create_or_find_by!(request_key: key) do |record|
          record.assign_attributes(user:, kind: "retest", title: "Retest ##{defect['id']}: #{defect['title']}".truncate(200), recipient: "muse", revision: build["revision"], request_digest: Task.fingerprint(report),
            payload: report.merge("version" => build["version"], "office_status" => "submitted", "requested_by_actor" => identity[:name]))
        end
        raise OfficeWork::Conflict, "Canonical retest key records different work." unless task.kind == "retest" && task.request_digest == Task.fingerprint(report)
        Workspace.event(user:, kind: "task_queued", summary: task.title, revision: task.revision, payload: { task_id: task.id }, event_key: "queued:#{task.id}")
        { "task" => OfficeWork.task_json(task, principal: identity), "receipt_id" => receipt_id, "delivery" => task.status == "queued" ? "submitted" : task.status, "ledger_recorded" => true }
      end
    end

    def self.poll_batch(user:, token:, input:)
      exact_fields!(input, %w[request_key batch_id])
      id = AgentRoom.text!(input, "batch_id", 80)
      batches = Snapshot.find_by(key: KEY)&.data&.fetch("batches", nil) || Workspace.state.fetch("batches", [])
      batch = batches.find { |item| item["id"] == id }
      number = batch && batch["pr_number"]
      raise ArgumentError, "The recorded batch must contain its existing PR number." unless number.is_a?(Integer) && number.positive?
      operation(user, token, input, "batch_polled", { "batch_id" => id, "pr_number" => number }) do |_identity, receipt_id|
        pr = Workspace.read_json(URI("https://api.github.com/repos/#{Workspace::REPOSITORY}/pulls/#{number}"), github: true)
        head = pr.dig("head", "sha")
        raise ArgumentError, "GitHub returned an invalid PR identity." unless pr["number"] == number && head.is_a?(String) && head.match?(SHA)
        ci = Workspace.read_json(URI("https://api.github.com/repos/#{Workspace::REPOSITORY}/commits/#{head}/status"), github: true)
        checks = Workspace.read_json(URI("https://api.github.com/repos/#{Workspace::REPOSITORY}/commits/#{head}/check-runs?per_page=100"), github: true)
        raise ArgumentError, "GitHub returned invalid checks." unless checks["check_runs"].is_a?(Array) && checks["total_count"].is_a?(Integer)
        states = checks["check_runs"].map do |check|
          check["status"] != "completed" ? "pending" : %w[success skipped neutral].include?(check["conclusion"]) ? "success" : "failure"
        end
        states << ci["state"] if ci.fetch("statuses", []).present?
        states << "pending" if checks["total_count"] > checks["check_runs"].length
        ci_state = states.empty? ? "unavailable" : states.any? { |state| %w[failure error].include?(state) } ? "failure" : states.all? { |state| state == "success" } ? "success" : "pending"
        build = Workspace.build
        merged_revision = pr["merge_commit_sha"] if pr["merged"] == true
        target = merged_revision.is_a?(String) && merged_revision.match?(SHA) ? merged_revision : head
        result = { "batch_id" => id, "pr_number" => number, "head" => head, "merge_revision" => merged_revision, "state" => pr["state"], "merged" => pr["merged"] == true, "ci_state" => ci_state,
          "deployed_revision" => build["revision"], "deployment" => build["revision"] == target ? "candidate_deployed" : "awaiting_deploy", "observed_at" => Time.current.iso8601, "receipt_id" => receipt_id }
        Snapshot.put("office:batch:#{id}", result)
        result
      end
    end

    def self.clean_build!
      build = Workspace.build
      raise OfficeWork::Conflict, "A fresh clean exact build is required." unless build["revision"].is_a?(String) && build["revision"].match?(SHA) && build["version"].present? && !build["dirty"]
      build
    end

    def self.workflow!(id)
      raise ArgumentError, "Choose WF-001–WF-116 or null." unless id.nil? || id.is_a?(String) && id.match?(/\AWF-(?:00[1-9]|0[1-9][0-9]|10[0-9]|11[0-6])\z/)
    end

    def self.evidence_reference?(value)
      return Evidence.exists?(id: value) if value.is_a?(Integer) && value.positive?
      return false unless value.is_a?(String) && value.length <= 500
      uri = URI.parse(value)
      uri.scheme == "https" && uri.host.present? && uri.userinfo.nil? && !uri.query.to_s.match?(/(?:token|secret|password|api_key|authorization)=/i)
    rescue URI::InvalidURIError
      false
    end

    def self.exact_fields!(input, fields, required: fields)
      raise ArgumentError, "Unexpected or missing fields." unless input.is_a?(Hash) && (input.keys - fields).empty? && (required - input.keys).empty?
    end

    def self.operation(user, token, input, kind, payload)
      OfficeWork.identity(user, token)
      key = AgentRoom.text!(input, "request_key", 100)
      raise ArgumentError, "Use a non-secret unique request key." unless key.match?(/\A[A-Za-z0-9_-]{8,100}\z/)
      AgentRoom.reject_credentials!(payload)
      OfficeWork.locked(user, token) do
        identity = OfficeWork.identity(user, token)
        event_key = "office:qa:#{kind}:#{key}"
        digest = Task.fingerprint(payload)
        existing = Event.find_by(event_key:)
        if existing
          raise OfficeWork::Conflict, "Request key records different content or principal." unless existing.payload["digest"] == digest && existing.payload["principal"] == identity[:key]
          return existing.payload["result"]
        end
        receipt_id = SecureRandom.uuid
        result = yield(identity, receipt_id)
        history = { digest:, principal: identity[:key], result: }
        history.merge!(task_id: result["task"]["id"], actor: identity[:name], status: "submitted") if result["task"]
        Event.create!(user:, kind: "office_qa_#{kind}", event_key:, summary: "#{identity[:name]}: #{kind.tr('_', ' ')}", revision: payload["revision"], payload: history)
        result
      end
    end
  end
end
