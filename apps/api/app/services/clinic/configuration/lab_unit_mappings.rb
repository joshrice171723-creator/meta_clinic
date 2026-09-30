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
        key = text(request_key, "request_key", 160)
        raise ArgumentError, "request_key has an unsupported format." unless Clinic::Idempotency::KEY_PATTERN.match?(key)
        revision = Integer(expected_revision.to_s, 10)
        raise ArgumentError, "expected_revision must be nonnegative." if revision.negative?
        practice.with_lock do
          Clinic::Authorization.authorize!(practice:, actor: actor.user, action: "facilities.write")
          existing = Clinic::PracticeFeatureVersion.for_practice(practice).find_by(request_key: key)
          legacy_replay = existing && Array(existing.optional_features[KEY]).none? { |row| row["validation_engine"] }
          normalized = normalize(mappings, legacy_replay:)
          digest = Digest::SHA256.hexdigest({ operation: KEY, mappings: normalized }.to_json)
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

      def self.normalize(mappings, legacy_replay: false)
        unless mappings.is_a?(Array) && mappings.length <= MAX_MAPPINGS
          raise ArgumentError, "mappings must contain at most #{MAX_MAPPINGS} entries."
        end
        validator = UcumDimensions.new if mappings.any? && !legacy_replay
        normalized = mappings.map do |row|
          raise ArgumentError, "Each mapping must be an object." unless row.is_a?(Hash)
          row = row.stringify_keys
          unless (row.keys - %w[code_system code code_version dimension expected_dimension_unit unit_codes]).empty?
            raise ArgumentError, "A lab unit mapping contains unsupported fields."
          end
          units = row["unit_codes"]
          unless units.is_a?(Array) && units.length.between?(1, 20)
            raise ArgumentError, "Each mapping requires 1–20 explicit unit codes."
          end
          unit_codes = units.map { |unit| text(unit, "unit code", 80) }.uniq.sort
          normalized = { "code_system" => text(row["code_system"], "test code system", 240),
            "code" => text(row["code"], "test code", 80),
            "code_version" => row["code_version"].blank? ? nil : text(row["code_version"], "test code version", 80),
            "dimension" => text(row["dimension"], "clinic-supplied dimension", 120),
            "unit_codes" => unit_codes }
          if legacy_replay
            raise Clinic::Idempotency::Conflict if row["expected_dimension_unit"].present?
            next normalized # Old owned receipts are acknowledged, never newly saved.
          end
          expected = text(row["expected_dimension_unit"], "expected dimension reference UCUM unit", 80)
          expected_vector = validator.reduce(expected)
          unit_codes.each do |unit|
            unless validator.reduce(unit) == expected_vector
              raise ArgumentError, "Configured unit #{unit} is dimension-incompatible with the supplied expected reference unit."
            end
          end
          normalized.merge("expected_dimension_unit" => expected,
            "dimension_vector" => expected_vector, "validation_engine" => "ucum-2.2-linear-dimensions-v1")
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
        validator = nil
        results.map do |row|
          supplied = row["unit_code"]
          status = "not_applicable"
          mapping = nil
          actual_vector = nil
          validated = nil
          if %w[numeric range].include?(row["value_kind"])
            mapping = config[:mappings].find do |candidate|
              candidate.values_at("code_system", "code", "code_version") ==
                row.values_at("code_system", "code", "code_version")
            end
            status = config[:configured] ? "unmapped" : "unconfigured"
            if mapping && mapping["validation_engine"] == "ucum-2.2-linear-dimensions-v1" && mapping["expected_dimension_unit"].present?
              validator ||= UcumDimensions.new
              expected_vector = validator.reduce(mapping.fetch("expected_dimension_unit"))
              actual_vector = validator.reduce(supplied)
              unless actual_vector == expected_vector
                raise ArgumentError, "Result #{row['name']}: UCUM unit dimensions are incompatible with the clinic-supplied expected dimension."
              end
              unless mapping.fetch("unit_codes").include?(supplied)
                raise ArgumentError, "Result #{row['name']}: dimension-compatible unit is not included in this clinic's approved unit list."
              end
              status = "dimensionally_validated"
              validated = supplied
            elsif mapping
              status = "configuration_incomplete"
            end
          end
          row.merge("supplied_unit_code" => supplied, "unit_code" => validated,
            "unit_validation" => { "status" => status,
              "configuration_revision" => config[:revision], "dimension" => mapping&.fetch("dimension"),
              "expected_dimension_unit" => mapping&.dig("expected_dimension_unit"),
              "dimension_vector" => actual_vector,
              "validation_engine" => validated && "ucum-2.2-linear-dimensions-v1" })
        end
      end

      # Historical membership-only codes remain raw provenance. Do not relabel
      # them as validated or mutate their immutable payload/digest.
      def self.present_result(row)
        return row if row.dig("unit_validation", "status") == "dimensionally_validated" &&
          row.dig("unit_validation", "validation_engine") == "ucum-2.2-linear-dimensions-v1"

        row.merge("supplied_unit_code" => row["supplied_unit_code"] || row["unit_code"], "unit_code" => nil)
      end
    end
  end
end
