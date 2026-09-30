module Qa
  # Owner approves a public fingerprint. The raw secret stays in its actor runtime.
  class OfficeEnrollment
    def self.approve(user:, input:)
      raise OfficeActorPolicy::Denied, "An active platform owner must approve enrollment." unless user&.active? && user.platform_owner?
      raise ArgumentError, "Only enrollment fields are accepted." unless (input.keys - %w[request_key actor digest name cadence_seconds]).empty?
      key = AgentRoom.text!(input, "request_key", 100)
      raise ArgumentError, "Use a unique approval key." unless key.match?(/\A[A-Za-z0-9_-]{8,100}\z/)
      name = AgentRoom.text!(input, "name", 80)
      target = input["actor"]
      raise ArgumentError, "Only actual Muse or dot can be enrolled." unless %w[muse dot].include?(target)
      digest = input["digest"]
      raise ArgumentError, "Provide the agent's SHA256 fingerprint, never its secret." unless digest.is_a?(String) && digest.match?(/\A[0-9a-f]{64}\z/)
      cadence = input["cadence_seconds"]
      raise ArgumentError, "Cadence must match the real Muse schedule (10–86400 seconds)." if cadence && (!cadence.is_a?(Integer) || !cadence.between?(10, 86_400) || target != "muse")
      AgentRoom.reject_credentials!(name)
      user.with_lock do
        event_key = "office:enrollment:#{key}"
        existing = Event.find_by(event_key:)
        if existing
          raise OfficeWork::Conflict, "Approval key records another fingerprint or principal." unless existing.kind == "office_enrolled" && existing.user_id == user.id && existing.payload["input"] == input
          return existing.payload["result"]
        end
        Snapshot.insert_all([ { key: "office:bindings", data: {}, created_at: Time.current, updated_at: Time.current } ], unique_by: :key)
        bindings = Snapshot.find_by!(key: "office:bindings")
        bindings.with_lock do
          config_key = target == "muse" ? "QA_OFFICE_MUSE_TOKEN_ID" : "QA_OFFICE_DOT_TOKEN_ID"
          config = OfficeActors.configuration
          prior = ServiceToken.find_by(id: OfficeActorPolicy.positive_id(config[config_key]), revoked_at: nil)
          raise OfficeWork::Conflict, "This actor is already bound. Revoke its old credential before replacement." if prior
          raise OfficeWork::Conflict, "This fingerprint already has an authentication record." if ServiceToken.exists?(digest:)
          token = ServiceToken.create!(user:, name:, digest:, scope: "office", recipient: target == "muse" ? "muse" : "codex")
          updated = bindings.data.fetch("config", {}).merge(config_key => token.id.to_s,
            "QA_OFFICE_JOSH_USER_ID" => user.id.to_s, "QA_OFFICE_ACTORS_ENABLED" => "1")
          updated["QA_OFFICE_MUSE_CADENCE_SECONDS"] = cadence.to_s if cadence
          bindings.update!(data: { config: updated })
          result = { actor: target, fingerprint: digest, scope: "office", receipt_id: SecureRandom.uuid }
          Event.create!(user:, kind: "office_enrolled", event_key:, summary: "Owner approved #{OfficeActors::NAMES.fetch(target)} Office-only fingerprint", payload: { input:, result: })
          result
        end
      end
    end
  end
end
