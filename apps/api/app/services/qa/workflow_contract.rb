require "json"
require "digest"
require "time"

module Qa
  # Pure contract helpers. Validation is not authorization or persistence.
  module WorkflowContract
    IDS = (1..116).map { |id| format("WF-%03d", id) }.freeze
    SHA = /\A[0-9a-f]{40}\z/
    DIGEST = /\A[0-9a-f]{64}\z/
    KEY = /\A[A-Za-z0-9_-]{8,100}\z/

    def self.object!(value, fields)
      raise ArgumentError, "Unexpected or missing contract fields." unless value.is_a?(Hash) && value.keys.sort == fields.sort
      value
    end

    def self.text!(value, maximum: 1000)
      raise ArgumentError, "Expected nonblank bounded text." unless value.is_a?(String) && !value.strip.empty? && value.length <= maximum
      value
    end

    def self.list!(value, minimum: 0, maximum: 116)
      raise ArgumentError, "Expected bounded array." unless value.is_a?(Array) && value.length.between?(minimum, maximum)
      value
    end

    def self.strings!(value, minimum: 0, maximum: 116)
      list!(value, minimum:, maximum:).each { |item| text!(item) }
      raise ArgumentError, "Duplicate values are ambiguous." unless value.uniq == value
      value
    end

    def self.match!(value, pattern)
      raise ArgumentError, "Invalid exact identifier." unless value.is_a?(String) && value.match?(pattern)
      value
    end

    def self.workflow!(value)
      raise ArgumentError, "Use a canonical WF-001 through WF-116 ID." unless IDS.include?(value)
      value
    end

    def self.positive!(value)
      raise ArgumentError, "Expected positive integer ID." unless value.is_a?(Integer) && value.positive?
      value
    end

    def self.timestamp!(value)
      match!(value, /\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\z/)
      Time.iso8601(value)
    end

    def self.fingerprint(value)
      canonical = lambda do |item|
        case item
        when Hash then item.sort.to_h.transform_values { |child| canonical.call(child) }
        when Array then item.map { |child| canonical.call(child) }
        else item
        end
      end
      Digest::SHA256.hexdigest(JSON.generate(canonical.call(value)))
    end

    def self.immutable_copy(value)
      freeze = lambda do |item|
        case item
        when Hash then item.each { |key, child| key.freeze; freeze.call(child) }
        when Array then item.each { |child| freeze.call(child) }
        end
        item.freeze
      end
      freeze.call(JSON.parse(JSON.generate(value)))
    end
  end
end
