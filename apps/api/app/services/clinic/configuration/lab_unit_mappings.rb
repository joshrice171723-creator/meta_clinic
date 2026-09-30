require "digest"

module Clinic
  module Configuration
    # Clinic declarations, not a terminology catalog or a unit conversion engine.
    class LabUnitMappings
      KEY = "lab_unit_mappings".freeze
      MAX_MAPPINGS = 200

      def self.current_version(practice:)
        Clinic::PracticeFeatureVersion.for_practice(practice).where(site_id: nil)
          .where(effective_from: ..Current.business_time).order(revision: :desc, id: :desc).first
      end

      def self.snapshot(practice:)
        version = current_version(practice:)
        mappings = version&.optional_features&.fetch(KEY, []) || []
        { revision: version&.revision || 0, configured: mappings.any?, mappings:,
          effective_from: version&.effective_from&.iso8601(6) }
      end

      def self.revise(practice:, actor:, mappings:, expected_revision:, request_key:)
        Clinic::Authorization.authorize!(practice:, actor: actor.user, action: "facilities.write")
        normalized = normalize(mappings)
        key = text(request_key, "request_key", 160)
        raise ArgumentError, "request_key has an unsupported format." unless Clinic::Idempotency::KEY_PATTERN.match?(key)
        revision = Integer(expected_revision.to_s, 10)
        raise ArgumentError, "expected_revision must be nonnegative." if revision.negative?
        digest = Digest::SHA256.hexdigest({ operation: KEY, mappings: normalized }.to_json)
        practice.with_lock do
          Clinic::Authorization.authorize!(practice:, actor: actor.user, action: "facilities.write")
          existing = Clinic::PracticeFeatureVersion.for_practice(practice).find_by(request_key: key)
          if existing
            raise Clinic::Idempotency::Conflict unless existing.site_id.nil? && existing.created_by_membership_id == actor.id && existing.content_digest == digest
            return receipt(existing)
          end
          previous = current_version(practice:)
          unless (previous&.revision || 0) == revision
            raise ActiveRecord::StaleObjectError.new(practice, "configure lab unit mappings")
          end
          saved = Clinic::PracticeFeatureVersion.create!(practice:, site: nil,
            created_by_membership: actor, revision: revision + 1,
            optional_features: (previous&.optional_features || {}).merge(KEY => normalized),
            effective_from: Current.business_time, request_key: key, content_digest: digest)
          receipt(saved)
        end
      end

      def self.receipt(version)
        mappings = version.optional_features.fetch(KEY)
        { revision: version.revision, configured: mappings.any?, mappings:,
          effective_from: version.effective_from.iso8601(6), request_key: version.request_key }
      end
      private_class_method :receipt

      def self.normalize(mappings)
        unless mappings.is_a?(Array) && mappings.length <= MAX_MAPPINGS
          raise ArgumentError, "mappings must contain at most #{MAX_MAPPINGS} entries."
        end
        normalized = mappings.map do |row|
          raise ArgumentError, "Each mapping must be an object." unless row.is_a?(Hash)
          row = row.stringify_keys
          unless (row.keys - %w[code_system code code_version dimension unit_codes]).empty?
            raise ArgumentError, "A lab unit mapping contains unsupported fields."
          end
          units = row["unit_codes"]
          unless units.is_a?(Array) && units.length.between?(1, 20)
            raise ArgumentError, "Each mapping requires 1–20 explicit unit codes."
          end
          { "code_system" => text(row["code_system"], "test code system", 240),
            "code" => text(row["code"], "test code", 80),
            "code_version" => row["code_version"].blank? ? nil : text(row["code_version"], "test code version", 80),
            "dimension" => text(row["dimension"], "clinic-supplied dimension", 120),
            "unit_codes" => units.map { |unit| text(unit, "unit code", 80) }.uniq.sort }
        end
        identities = normalized.map { |row| row.values_at("code_system", "code", "code_version") }
        raise ArgumentError, "Each test system/code/version may have only one mapping." unless identities.uniq.length == identities.length
        normalized.sort_by { |row| row.values_at("code_system", "code", "code_version").map(&:to_s) }
      end
      private_class_method :normalize

      def self.text(value, field, maximum)
        unless value.is_a?(String) && value.strip.length.between?(1, maximum)
          raise ArgumentError, "#{field} is required and must be at most #{maximum} characters."
        end
        value.strip
      end
      private_class_method :text

      # Called only inside the new-write idempotency transaction. A committed replay
      # returns its immutable receipt without applying a newer configuration.
      def self.validate_results(practice:, results:)
        practice.lock!
        config = snapshot(practice:)
        results.map do |row|
          status = "not_applicable"
          mapping = nil
          if %w[numeric range].include?(row["value_kind"])
            mapping = config[:mappings].find do |candidate|
              candidate.values_at("code_system", "code", "code_version") ==
                row.values_at("code_system", "code", "code_version")
            end
            status = config[:configured] ? "unmapped" : "unconfigured"
            if mapping
              unless mapping["unit_codes"].include?(row["unit_code"])
                raise ArgumentError, "Result #{row['name']}: supplied unit code does not match the configured test system/code/version mapping."
              end
              status = "configured_match"
            end
          end
          row.merge("unit_validation" => { "status" => status,
            "configuration_revision" => config[:revision], "dimension" => mapping&.fetch("dimension") })
        end
      end
    end
  end
end
