require "digest"

module Clinic
  module Reminders
    class RevisePolicy
      def self.call(practice:, actor:, expected_revision:, request_key:, enabled:, lead_hours:)
        membership = Clinic::Authorization.authorize!(practice:, actor:, action: "roles.manage")
        key = request_key.to_s.strip
        raise ArgumentError, "request_key is required" unless Clinic::Idempotency::KEY_PATTERN.match?(key)
        raise ArgumentError, "enabled must be true or false" unless [ true, false ].include?(enabled)
        raise ArgumentError, "lead_hours must be a whole number from 1 to 168" unless lead_hours.is_a?(Integer) && lead_hours.between?(1, 168)
        digest = Digest::SHA256.hexdigest([ expected_revision, enabled, lead_hours ].to_json)
        ApplicationRecord.transaction do
          practice.lock!
          previous = PolicyVersion.find_by(practice:, request_key: key)
          if previous
            raise Clinic::Idempotency::Conflict unless previous.content_digest == digest
            return previous
          end
          current = PolicyVersion.current(practice:)
          raise ActiveRecord::StaleObjectError.new(practice, "revise reminder policy") unless (current&.revision || 0) == expected_revision
          policy = PolicyVersion.create!(practice:, written_by_membership: membership,
            revision: (current&.revision || 0) + 1, enabled:, lead_hours:, request_key: key,
            content_digest: digest, effective_from: Current.business_time)
          AuditRecorder.record!(practice:, actor:, action_code: "reminders.configuration.write", outcome: :committed,
            resource_version_ref: "reminder-policy:#{policy.id}:revision:#{policy.revision}")
          policy
        end
      end
    end
  end
end
