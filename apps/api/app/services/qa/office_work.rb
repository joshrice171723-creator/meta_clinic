module Qa
  # Coordination lives in the existing task/event history, separate from QA verdicts.
  class OfficeWork
    class Conflict < StandardError; end
    LEASE = 15.minutes

    def self.identity(user, token)
      raise OfficeActorPolicy::Denied, "An active Office principal is required." unless user&.active? && user.platform_owner?
      name = OfficeActorPolicy.actor(config: OfficeActors.configuration, user:, token:)
      { key: OfficeActors.principal_key(user, token), name:, recipient: token&.recipient, owner: token.nil? }
    end

    def self.allowed(task, principal)
      return [] unless principal && task.kind == "coordination"
      expired = task.status == "claimed" && (!task.lease_expires_at || task.lease_expires_at <= Time.current)
      return [ "recover" ] if principal[:owner] && expired
      return [ "result_confirmed" ] if task.status == "completed" && task.payload["office_status"] != "result_confirmed" && task.payload["requester_principal"] == principal[:key]
      return [ "decision" ] if principal[:owner] && task.payload["office_status"] == "blocked"
      assignee = task.payload["assigned_actor"] || (task.recipient == "muse" ? "muse" : "dot")
      return [] unless assignee == principal[:name]
      return task.payload["office_status"] == "picked_up" ? [ "acknowledged" ] : %w[picked_up acknowledged] if task.status == "queued"
      return [] unless task.status == "claimed" && task.claim_principal == principal[:key] && !expired
      %w[working blocked completed handoff]
    end

    def self.receipts(task)
      Event.where(kind: %w[office_work_queued office_work_transition office_qa_defect_submitted office_qa_retest_submitted]).where("payload ->> 'task_id' = ?", task.id.to_s).order(:id).map do |event|
        { id: event.id, status: event.payload["status"] || "submitted", actor: event.payload["actor"], created_at: event.created_at.iso8601,
          summary: event.payload.dig("input", "result", "summary") || event.summary }
      end
    end

    def self.task_json(task, principal: nil)
      task.as_json.except("claim_principal", "request_digest").merge(
        "payload" => task.payload.except("requester_principal"),
        "office_status" => task.payload["office_status"] || task.status,
        "lease_expired" => task.status == "claimed" && (!task.lease_expires_at || task.lease_expires_at <= Time.current),
        "allowed_transitions" => allowed(task, principal))
    end

    def self.read(user: nil, token: nil)
      principal = begin
        identity(user, token)
      rescue OfficeActorPolicy::Denied
        nil
      end
      { tasks: Task.where(kind: "coordination").order(created_at: :desc).limit(100).map { |task| task_json(task, principal:).merge("receipts" => receipts(task)) },
        can_post: principal.present?, controlled_actor: principal&.fetch(:name) }
    end

    def self.request_browser_qa(user:, input:)
      raise ArgumentError, "Only the displayed revision is accepted." unless input.keys == [ "revision" ]
      build = Workspace.build
      revision = build["revision"]
      raise Conflict, "Refresh QA to request the exact clean build." unless revision.to_s.match?(/\A[0-9a-f]{40}\z/) && !build["dirty"] && input["revision"] == revision
      key = "office-browser-qa-public-#{revision}"
      description = "Run one real browser QA pass on exact live build #{revision}. Route to the browser-capable main agent; never substitute code or HTTP inspection. Use the latest published review scope for this build from Office; if none exists, check homepage sandbox entry and its destination. Verify build.json before and after. Send authenticated check-ins and current-build workflow claims/verdicts while actually working. Attach stored screenshot evidence IDs for this revision. If browser access or routing is unavailable, mark blocked with the reason; never report completion without evidence. No merge, publish, fixture reset, or recurring QA. Stop after this bounded pass."
      # One shared public request per build makes retries and concurrent visitors idempotent.
      task = Task.create_or_find_by!(request_key: key) do |record|
        record.assign_attributes(user:, kind: "coordination", title: "Public Office browser QA", recipient: "muse", revision:,
          payload: { description:, office_status: "queued", requester_actor: "public", request_source: "public_browser_qa", assigned_actor: "muse" })
      end
      Workspace.event(user: task.user, kind: "office_work_queued", summary: task.title, revision:,
        payload: { task_id: task.id, actor: "public" }, event_key: "office:work:queued:#{task.id}")
      task_json(task)
    end

    def self.create(user:, token:, input:, revision:)
      principal = identity(user, token)
      key = AgentRoom.text!(input, "request_key", 100)
      raise ArgumentError, "Use a non-secret unique request key." unless key.match?(/\A[A-Za-z0-9_-]{8,100}\z/)
      title = AgentRoom.text!(input, "title", 200)
      recipient = input.fetch("recipient", "muse")
      raise ArgumentError, "Choose muse or codex." unless %w[muse codex].include?(recipient)
      assignee = input.fetch("assigned_actor", recipient == "muse" ? "muse" : "dot")
      raise ArgumentError, "Choose the actual Muse, dot or Codex assignee." unless %w[muse dot codex].include?(assignee) && recipient == (assignee == "muse" ? "muse" : "codex")
      payload = input.fetch("payload", {})
      raise ArgumentError, "Coordination payload requires only a description." unless payload.is_a?(Hash) && payload.keys == [ "description" ]
      description = AgentRoom.text!(payload, "description", 4000)
      request = { "title" => title, "recipient" => recipient, "revision" => revision, "description" => description, "assigned_actor" => assignee }
      AgentRoom.reject_credentials!(request)
      digest = Task.fingerprint(request)
      locked(user, token) do
        identity(user, token)
        task = Task.create_or_find_by!(request_key: key) do |record|
          record.assign_attributes(user:, kind: "coordination", title:, recipient:, revision:, request_digest: digest,
            payload: { description:, office_status: "queued", requester_principal: principal[:key], requester_actor: principal[:name], assigned_actor: assignee })
        end
        unless task.kind == "coordination" && task.request_digest == digest && task.payload["requester_principal"] == principal[:key]
          raise Conflict, "Request key already records different work or another principal."
        end
        Workspace.event(user:, kind: "office_work_queued", summary: title, revision:, payload: { task_id: task.id, actor: principal[:name] }, event_key: "office:work:queued:#{task.id}")
        task_json(task, principal:)
      end
    end

    def self.transition(user:, token:, id:, input:)
      principal = identity(user, token)
      key = AgentRoom.text!(input, "request_key", 100)
      raise ArgumentError, "Use a non-secret unique request key." unless key.match?(/\A[A-Za-z0-9_-]{8,100}\z/)
      status = AgentRoom.text!(input, "status", 30)
      raise ArgumentError, "Only transition fields are accepted." unless (input.keys - %w[request_key status result assigned_actor]).empty?
      target = input["assigned_actor"]
      if status == "handoff"
        raise ArgumentError, "Choose a different actual Office assignee." unless %w[muse dot codex].include?(target) && target != principal[:name]
      elsif target
        raise ArgumentError, "An assignee is accepted only for a handoff."
      end
      result = input.fetch("result", {})
      raise ArgumentError, "Result must be an object of 8 KB or less." unless result.is_a?(Hash) && result.to_json.bytesize <= 8000
      raise ArgumentError, "Only summary and evidence_refs are accepted." unless (result.keys - %w[summary evidence_refs]).empty?
      AgentRoom.text!(result, "summary", 4000) if result.key?("summary") || %w[blocked completed handoff decision].include?(status)
      refs = result.fetch("evidence_refs", [])
      raise ArgumentError, "Use up to five stored evidence ids." unless refs.is_a?(Array) && refs.length <= 5 && refs.uniq == refs && refs.all? { |ref| ref.is_a?(Integer) && ref.positive? } && Evidence.where(id: refs).count == refs.length
      AgentRoom.reject_credentials!(result)
      operation = { "status" => status, "result" => result, "principal" => principal[:key] }
      operation["assigned_actor"] = target if target
      locked(user, token) do
        principal = identity(user, token)
        task = Task.where(kind: "coordination").find(id)
        task.with_lock do
          event_key = "office:work:#{task.id}:#{key}"
          existing = Event.find_by(event_key:)
          if existing
            raise Conflict, "Transition key records different content or another principal." unless existing.kind == "office_work_transition" && existing.payload["input"] == operation
            return existing.payload["result"]
          end
          raise OfficeActorPolicy::Denied, "This transition is not allowed for this principal or lease." unless allowed(task, principal).include?(status)
          changes = { payload: task.payload.merge("office_status" => status) }
          case status
          when "acknowledged"
            changes.merge!(status: "claimed", claimed_by: user, claim_principal: principal[:key], claim_run_id: "office-#{task.id}-#{SecureRandom.uuid}", claimed_at: Time.current, lease_expires_at: LEASE.from_now)
          when "working", "blocked"
            changes.merge!(lease_expires_at: LEASE.from_now, result:)
          when "completed"
            if task.request_key.start_with?("branch-review-publish-", "office-browser-qa-")
              build = Workspace.build
              raise Conflict, "Browser QA completion requires the exact clean live build." unless build["revision"] == task.revision && !build["dirty"]
              raise ArgumentError, "Browser QA completion requires stored screenshots from this build." if refs.empty? || Evidence.where(id: refs, revision: task.revision, content_type: %w[image/png image/jpeg]).count != refs.length
            end
            changes.merge!(status: "completed", result:, lease_expires_at: nil)
          when "decision"
            changes = { payload: task.payload.merge("owner_decision" => result["summary"], "decision_at" => Time.current.iso8601) }
          when "handoff"
            changes.merge!(status: "queued", recipient: target == "muse" ? "muse" : "codex", claimed_by: nil, claim_principal: nil, claim_run_id: nil, claimed_at: nil, lease_expires_at: nil,
              payload: task.payload.merge("office_status" => "queued", "assigned_actor" => target, "handoff_summary" => result["summary"]))
          when "recover"
            changes.merge!(status: "queued", claimed_by: nil, claim_principal: nil, claim_run_id: nil, claimed_at: nil, lease_expires_at: nil,
              payload: task.payload.merge("office_status" => "queued"))
          end
          task.update!(changes)
          receipt = task_json(task, principal:).merge("receipt_id" => SecureRandom.uuid)
          Event.create!(user:, kind: "office_work_transition", event_key:, summary: "#{principal[:name]}: #{task.title} - #{status}", revision: task.revision,
            payload: { input: operation, result: receipt, task_id: task.id, actor: principal[:name], status: })
          receipt
        end
      end
    end

    def self.save_evidence(user:, token:, id:, input:)
      locked(user, token) do
        principal = identity(user, token)
        task = Task.where(kind: "coordination").find(id)
        task.with_lock do
          raise OfficeActorPolicy::Denied, "Evidence requires your active browser QA task lease." unless allowed(task, principal).include?("working") && task.request_key.start_with?("branch-review-publish-", "office-browser-qa-")
          build = Workspace.build
          raise Conflict, "Evidence requires the exact clean live build." unless build["revision"] == task.revision && !build["dirty"] && input["revision"] == task.revision
          raise ArgumentError, "Only screenshot evidence fields are accepted." unless (input.keys - %w[revision caption content_type data_base64 workflow_ids]).empty?
          caption = AgentRoom.text!(input, "caption", 500)
          data = Base64.strict_decode64(AgentRoom.text!(input, "data_base64", 5_600_000))
          type = input["content_type"]
          valid = type == "image/png" ? data.start_with?("\x89PNG\r\n\x1a\n".b) : type == "image/jpeg" && data.start_with?("\xff\xd8\xff".b)
          raise ArgumentError, "Upload a PNG or JPEG of 4 MB or less." unless valid && data.bytesize.between?(1, 4.megabytes)
          workflows = input["workflow_ids"]
          raise ArgumentError, "Identify the canonical workflows tested." unless workflows.is_a?(Array) && workflows.any? && workflows.uniq == workflows && (workflows - WorkflowContract::IDS).empty?
          digest = Digest::SHA256.hexdigest(data)
          item = Evidence.where(user:, revision: task.revision, digest:).find { |evidence| evidence.context["office_task_id"] == task.id }
          item ||= Evidence.create!(user:, revision: task.revision, caption:, content_type: type, image: data, digest:, workflow_ids: workflows,
            phase: "observation", context: { office_task_id: task.id, authenticated_actor: principal[:name], observed_at: Time.current.iso8601 })
          Workspace.event(user:, kind: "evidence_saved", summary: item.caption, revision: item.revision, payload: { evidence_id: item.id, task_id: task.id }, event_key: "office:evidence:#{task.id}:#{item.id}")
          item
        end
      end
    end

    def self.locked(user, token, &block)
      operation = -> { user.with_lock(&block) }
      token ? token.with_lock { operation.call } : operation.call
    end
  end
end
