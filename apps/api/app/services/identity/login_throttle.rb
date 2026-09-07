require "digest"

module Identity
  class LoginThrottle
    WINDOW_SECONDS = 300

    def self.prune_expired!
      ApplicationRecord.connection.delete(<<~SQL)
        DELETE FROM identity_login_throttles WHERE key_digest IN (
          SELECT key_digest FROM identity_login_throttles
          WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '1 day'
          ORDER BY expires_at LIMIT 1000
        )
      SQL
    end

    def self.exceeded?(scope:, value:, limit:)
      # No email address or network address is retained in the throttle table.
      key = Digest::SHA256.hexdigest("#{scope}:#{value}")
      sql = ApplicationRecord.sanitize_sql_array([<<~SQL, key])
        INSERT INTO identity_login_throttles (key_digest, attempts, expires_at)
        VALUES (?, 1, CURRENT_TIMESTAMP + INTERVAL '300 seconds')
        ON CONFLICT (key_digest) DO UPDATE SET
          attempts = CASE WHEN identity_login_throttles.expires_at <= CURRENT_TIMESTAMP
            THEN 1 ELSE LEAST(identity_login_throttles.attempts + 1, 1000000) END,
          expires_at = CASE WHEN identity_login_throttles.expires_at <= CURRENT_TIMESTAMP
            THEN CURRENT_TIMESTAMP + INTERVAL '300 seconds' ELSE identity_login_throttles.expires_at END
        RETURNING attempts
      SQL
      ApplicationRecord.connection.select_value(sql).to_i > limit
    end
  end
end
