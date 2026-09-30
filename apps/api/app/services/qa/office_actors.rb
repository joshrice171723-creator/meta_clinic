require "securerandom"

module Qa
  # Uses existing snapshots/events; no credential creation or schema change.
  class OfficeActors
    KEY = "office:actors".freeze
    NAMES = { "josh" => "Josh", "muse" => "Muse", "dot" => "dot" }.freeze
    class Conflict < StandardError; end

    def self.principal_key(user, token)
      token ? "service:#{token.id}:#{user.id}" : "owner:#{user.id}"
    end

    def self.registered(config)
      return {} unless config["QA_OFFICE_ACTORS_ENABLED"] == "1"
      result = {}
      user = User.find_by(id: OfficeActorPolicy.positive_id(config["QA_OFFICE_JOSH_USER_ID"]))
      begin
        name = OfficeActorPolicy.actor(config:, user:)
        result[name] = principal_key(user, nil)
      rescue OfficeActorPolicy::Denied
        # Invalid/revoked/absent bindings remain unavailable.
      end
      %w[QA_OFFICE_MUSE_TOKEN_ID QA_OFFICE_DOT_TOKEN_ID].each do |key|
        token = ServiceToken.includes(:user).find_by(id: OfficeActorPolicy.positive_id(config[key]))
        next unless token
        begin
          name = OfficeActorPolicy.actor(config:, user: token.user, token:)
          result[name] = principal_key(token.user, token)
        rescue OfficeActorPolicy::Denied
          next
        end
      end
      result
    end

    def self.read(config: ENV, viewer: nil, token: nil)
      bindings = registered(config)
      rows = Snapshot.find_by(key: KEY)&.data || {}
      controlled = begin
        OfficeActorPolicy.actor(config:, user: viewer, token:)
      rescue OfficeActorPolicy::Denied
        nil
      end
      actors = NAMES.map do |id, name|
        stored = rows[id]
        stored = nil unless stored && bindings[id] && stored["principal_key"] == bindings[id]
        { id:, name:, control: bindings[id] ? "bound" : "uncontrolled",
          connection: stored&.dig("receipt") ? "check_in_recorded" : "not_connected",
          position: stored&.dig("position"), revision: stored&.dig("revision") || 0,
          principal_id: stored&.dig("principal_id"), receipt: stored&.dig("receipt") }
      end
      { contract_version: 1, actor_binding: bindings.empty? ? "not_configured" : "server_bound",
        controlled_actor: controlled, actors:, muse_cadence_ms: OfficeActorPolicy.cadence(config),
        notice: "Positions and check-ins are authenticated recorded state, not proof of continuous work or live presence." }
    end

    def self.write(user:, token:, input:, kind:, config: ENV)
      OfficeActorPolicy.input(input, kind:)
      OfficeActorPolicy.actor(config:, user:, token:)
      # Lock/reload both credential and owner before authorization to handle revocation.
      operation = lambda do
        user.with_lock do
          actor = OfficeActorPolicy.actor(config:, user:, token:)
          principal = principal_key(user, token)
          # ON CONFLICT DO NOTHING bypasses the uniqueness validator and never
          # overwrites an existing singleton. Its row lock still guards changes.
          Snapshot.insert_all([ { key: KEY, data: {}, created_at: Time.current, updated_at: Time.current } ], unique_by: :key)
          record = Snapshot.find_by!(key: KEY)
          record.with_lock do
            rows = record.data.deep_dup
            previous = rows[actor]
            previous = nil unless previous && previous["principal_key"] == principal
            state = previous || { "principal_key" => principal, "principal_id" => SecureRandom.uuid, "revision" => 0 }
            event_key = "office:#{actor}:#{input['request_key']}"
            payload = input.except("expected_revision", "request_key").merge("actor" => actor, "principal_id" => state["principal_id"], "action" => kind)
            existing = Event.find_by(event_key:)
            if existing
              unless existing.user_id == user.id && existing.kind == "office_actor_updated" && existing.payload["input"] == payload
                raise Conflict, "Office request key belongs to a different action or binding."
              end
              return existing.payload["result"]
            end
            raise Conflict, "Office actor revision changed; refresh before writing." unless state["revision"] == input["expected_revision"]
            if Event.where(kind: "office_actor_updated").where("event_key LIKE ?", "office:#{actor}:%").where("created_at >= ?", 1.minute.ago).count >= 120
              raise Conflict, "Office actor update limit reached; wait before retrying."
            end
            now = Time.current
            state["revision"] += 1
            if kind == "position"
              state["position"] = { "x" => input["x"], "y" => input["y"] }
            else
              state["receipt"] = { "id" => SecureRandom.uuid, "authenticatedActorId" => state["principal_id"], "receivedAtMs" => (now.to_f * 1000).floor }
            end
            rows[actor] = state
            result = { "actor" => actor, "revision" => state["revision"], "position" => state["position"], "principal_id" => state["principal_id"], "receipt" => state["receipt"] }
            record.update!(data: rows)
            Event.create!(user:, kind: "office_actor_updated", event_key:, summary: "Authenticated #{NAMES.fetch(actor)} #{kind}", payload: { input: payload, result: })
            result
          end
        end
      end
      token ? token.with_lock { operation.call } : operation.call
    end
  end
end
