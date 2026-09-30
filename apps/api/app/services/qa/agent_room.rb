module Qa
  class AgentRoom
    KIND = "agent_room_message".freeze
    BUILD_FIELDS = %w[build_at_send build_dirty build_available].freeze
    class Conflict < StandardError; end

    def self.text!(input, field, maximum)
      value = input[field]
      raise ArgumentError, "#{field} is required (maximum #{maximum} characters)." unless value.is_a?(String) && value.strip.present? && value.length <= maximum
      value.strip
    end

    def self.messages(after = nil)
      if after.present? && !after.to_s.match?(/\A\d{1,18}\z/)
        raise ArgumentError, "after_id must be a nonnegative message cursor."
      end
      scope = Event.where(kind: KIND)
      rows = after.present? ? scope.where("id > ?", after.to_i).order(:id).limit(100).to_a : scope.order(id: :desc).limit(100).to_a.reverse
      cursor = rows.last&.id || after.to_i
      { messages: rows.map { |item| receipt(item) }, next_cursor: cursor, has_more: scope.where("id > ?", cursor).exists? }
    end

    def self.receipt(item)
      { id: item.id, message: item.payload, thread_id: item.payload["thread_id"] || item.id,
        created_at: item.created_at.iso8601, delivery: "persisted", authenticated_author_id: item.user_id, revision: item.revision }
    end

    def self.matches?(item, actor, payload)
      item.kind == KIND && item.user_id == actor.id && item.payload.except(*BUILD_FIELDS) == payload.except(*BUILD_FIELDS)
    end

    def self.reject_credentials!(value)
      if value.to_json.match?(/Bearer\s+[A-Za-z0-9_+\/-]{12,}|-----BEGIN[^-]*PRIVATE KEY-----|\bqa_[A-Za-z0-9_-]{43}\b|\b(?:password|pin)\s*[:=]\s*\S+/i)
        raise ArgumentError, "Remove credentials from Office coordination."
      end
    end

    def self.post(actor, input, source:, authenticated_actor: nil)
      key = text!(input, "message_key", 100)
      payload = { "agent" => authenticated_actor ? OfficeActors::NAMES.fetch(authenticated_actor) : text!(input, "agent", 80), "recipient" => text!(input, "recipient", 80),
        "body" => text!(input, "body", 2000), "identity" => "self_reported", "authenticated_source" => source,
        "provenance" => "reported" }
      if authenticated_actor
        payload.merge!("agent" => OfficeActors::NAMES.fetch(authenticated_actor), "identity" => "server_bound", "authenticated_actor" => authenticated_actor)
      end
      if input["reference_revision"].present?
        raise ArgumentError, "Reference revision must be a full 40-character SHA." unless input["reference_revision"].is_a?(String) && input["reference_revision"].match?(/\A[0-9a-f]{40}\z/)
        payload["reference_revision"] = input["reference_revision"]
      end
      payload["case_reference"] = text!(input, "case_reference", 100) if input["case_reference"].present?
      if input["task_id"].present?
        raise ArgumentError, "task_id must identify an existing task." unless input["task_id"].is_a?(Integer) && input["task_id"] > 0 && Task.exists?(id: input["task_id"])
        payload["task_id"] = input["task_id"]
      end
      if input["evidence_refs"].present?
        refs = input["evidence_refs"]
        unless refs.is_a?(Array) && refs.length.between?(1, 5) && refs.all? { |id| id.is_a?(Integer) && id > 0 } && refs.uniq.length == refs.length && Evidence.where(id: refs).count == refs.length
          raise ArgumentError, "Provide up to five distinct stored evidence ids."
        end
        payload["evidence_refs"] = refs
      end
      if input["correlation_nonce"].present?
        nonce = text!(input, "correlation_nonce", 100)
        raise ArgumentError, "Use 8â€“100 letters, digits, underscores or hyphens for the non-secret nonce." unless nonce.match?(/\A[A-Za-z0-9_-]{8,100}\z/)
        payload["correlation_nonce"] = nonce
      end
      if input["reply_to"].present?
        raise ArgumentError, "reply_to must be a message id." unless input["reply_to"].is_a?(Integer) && input["reply_to"] > 0
        parent = Event.find_by(id: input["reply_to"], kind: KIND)
        raise ArgumentError, "Reply message does not exist." unless parent
        payload.merge!("reply_to" => parent.id, "thread_id" => parent.payload["thread_id"] || parent.id)
      end
      reject_credentials!(payload.merge("message_key" => key))
      actor.with_lock do
        existing = Event.find_by(event_key: "room:#{key}")
        if existing
          raise Conflict, "Message key already records different content or another author." unless matches?(existing, actor, payload)
          return receipt(existing)
        end
        if Event.where(kind: KIND, user_id: actor.id).where("created_at >= ?", 1.minute.ago).count >= 30
          raise Conflict, "Message limit reached (30 per minute); wait before posting again."
        end
        build = Workspace.build
        payload.merge!("build_at_send" => build["revision"], "build_dirty" => !!build["dirty"], "build_available" => build["revision"].present?)
        item = Workspace.event(user: actor, kind: KIND, summary: "#{payload['agent']} â†’ #{payload['recipient']}",
          revision: build["dirty"] ? nil : build["revision"], payload:, event_key: "room:#{key}")
        raise Conflict, "Message key already records different content or another author." unless matches?(item, actor, payload)
        receipt(item)
      end
    end
  end
end
