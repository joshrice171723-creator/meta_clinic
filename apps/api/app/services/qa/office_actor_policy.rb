module Qa
  # Pure, fail-closed policy. Names/recipients from a request never select an actor.
  class OfficeActorPolicy
    class Denied < StandardError; end

    def self.actor(config:, user:, token: nil)
      raise Denied, "Office actor writes are not activated." unless config["QA_OFFICE_ACTORS_ENABLED"] == "1"
      raise Denied, "An active platform-owner principal is required." unless user && user.active? && user.platform_owner?
      if token
        raise Denied, "Office writes require an Office-only credential." unless token.office?
        raise Denied, "A current dedicated service principal is required." if token.revoked_at || token.user_id != user.id
        bindings = { "muse" => [ "QA_OFFICE_MUSE_TOKEN_ID", "muse" ], "dot" => [ "QA_OFFICE_DOT_TOKEN_ID", "codex" ], "codex" => [ "QA_OFFICE_CODEX_TOKEN_ID", "codex" ] }
        ids = bindings.values.filter_map { |key, _recipient| positive_id(config[key]) }
        raise Denied, "Office service bindings must be distinct." unless ids.uniq == ids
        bindings.each do |name, (key, recipient)|
          return name if positive_id(config[key]) == token.id && token.recipient == recipient
        end
      elsif positive_id(config["QA_OFFICE_JOSH_USER_ID"]) == user.id
        return "josh"
      end
      raise Denied, "This authenticated principal has no Office actor binding."
    end

    def self.positive_id(value)
      Integer(value, 10) if value.is_a?(String) && value.match?(/\A[1-9]\d{0,17}\z/)
    end

    def self.input(value, kind:)
      raise ArgumentError, "Unknown Office action." unless %w[position check_in].include?(kind)
      expected = kind == "position" ? %w[expected_revision request_key x y] : %w[expected_revision request_key]
      raise ArgumentError, "Only the Office action fields are accepted; actor identity is server-selected." unless value.is_a?(Hash) && value.keys.sort == expected.sort
      raise ArgumentError, "Use a non-secret unique request key." unless value["request_key"].is_a?(String) && value["request_key"].match?(/\A[A-Za-z0-9_-]{8,100}\z/)
      raise ArgumentError, "Provide the current nonnegative revision." unless value["expected_revision"].is_a?(Integer) && value["expected_revision"] >= 0
      if kind == "position"
        raise ArgumentError, "Position must use floor columns1-9 and rows1-7." unless value["x"].is_a?(Integer) && value["y"].is_a?(Integer) && value["x"].between?(1, 9) && value["y"].between?(1, 7)
      end
      value
    end

    def self.cadence(config)
      seconds = positive_id(config["QA_OFFICE_MUSE_CADENCE_SECONDS"])
      seconds * 1000 if seconds && seconds.between?(10, 86_400)
    end
  end
end
