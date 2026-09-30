require "digest"

module Clinic
  module Scheduling
    class ReviseOperationalPolicy
      def self.call(practice:, site:, actor:, expected_revision:, request_key:, block_categories:, waiting_thresholds:)
        membership = Clinic::Authorization.authorize!(practice:, actor:, action: "facilities.write", site:)
        raise ArgumentError, "The location must belong to this clinic." unless site.practice_id == practice.id
        key = request_key.to_s.strip
        raise ArgumentError, "request_key is required" unless Clinic::Idempotency::KEY_PATTERN.match?(key)
        categories = normalize(block_categories, thresholds: false)
        thresholds = normalize(waiting_thresholds, thresholds: true)
        digest = Digest::SHA256.hexdigest([ categories, thresholds ].to_json)
        ApplicationRecord.transaction do
          site.lock!
          previous_request = OperationalPolicyVersion.find_by(practice:, site:, request_key: key)
          if previous_request
            raise Clinic::Idempotency::Conflict unless previous_request.content_digest == digest
            return previous_request
          end
          current = OperationalPolicyVersion.current(practice:, site:)
          unless (current&.revision || 0) == expected_revision
            raise ActiveRecord::StaleObjectError.new(site, "revise operational policy")
          end
          OperationalPolicyVersion.create!(practice:, site:, written_by_membership: membership,
            revision: (current&.revision || 0) + 1, block_categories: categories,
            waiting_thresholds: thresholds, request_key: key, content_digest: digest,
            effective_from: Current.business_time)
        end
      end

      def self.normalize(rows, thresholds:)
        unless rows.is_a?(Array) && rows.length <= 20
          raise ArgumentError, "Supply up to 20 explicit clinic policy entries."
        end
        values = rows.map do |row|
          raise ArgumentError, "Each clinic policy entry must be an object." unless row.respond_to?(:to_h)
          row = row.to_h.stringify_keys
          allowed = thresholds ? %w[key label minutes] : %w[key label]
          raise ArgumentError, "Unsupported policy fields." if (row.keys - allowed).any?
          key = row["key"].to_s.strip
          label = row["label"].to_s.strip
          unless key.match?(/\A[a-zA-Z0-9_-]{1,80}\z/) && label.present? && label.length <= 120
            raise ArgumentError, "Each entry needs a stable key and a clinic-defined label of up to 120 characters."
          end
          result = { "key" => key, "label" => label }
          if thresholds
            minutes = Integer(row["minutes"].to_s, 10) rescue nil
            raise ArgumentError, "Waiting thresholds must be whole positive minutes." unless minutes && minutes.positive? && minutes <= 2_147_483_647
            result["minutes"] = minutes
          end
          result
        end
        raise ArgumentError, "Policy entry keys must be unique." unless values.map { |row| row.fetch("key") }.uniq.length == values.length
        if thresholds && values.map { |row| row.fetch("minutes") }.uniq.length != values.length
          raise ArgumentError, "Waiting thresholds must use distinct minute values."
        end
        values.sort_by { |row| thresholds ? [ row.fetch("minutes"), row.fetch("key") ] : row.fetch("key") }
      end
      private_class_method :normalize
    end
  end
end
