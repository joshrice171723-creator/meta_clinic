module Clinic
  module Assistant
    class WorkflowSchema
      FIELD_TYPES = %w[text number decimal boolean date datetime select record array].freeze
      ARRAY_ITEM_TYPES = %w[text number decimal boolean date select].freeze
      MAX_FIELDS = 60
      MAX_ARRAY_ITEMS = 100

      class Invalid < StandardError
        attr_reader :field

        def initialize(message, field: nil)
          @field = field
          super(message)
        end
      end

      def self.normalize!(definition:, raw:, context:, allow_missing: false, model_suggestion: false)
        inputs = raw.respond_to?(:to_unsafe_h) ? raw.to_unsafe_h : raw
        raise Invalid.new("inputs must be an object.", field: :inputs) unless inputs.is_a?(Hash)

        inputs = inputs.stringify_keys
        fields = definition.fetch("fields")
        raise Invalid.new("The workflow schema is unavailable.") if fields.length > MAX_FIELDS
        field_map = fields.index_by { |field| field.fetch("key") }
        unknown = inputs.keys - field_map.keys
        raise Invalid.new("#{unknown.first} is not a supported field.", field: unknown.first) if unknown.any?

        normalized = {}
        fields.each do |field|
          key = field.fetch("key")
          unless inputs.key?(key)
            if field["required"] && !allow_missing && !(model_suggestion && field["type"] == "record")
              raise Invalid.new("Choose #{field.fetch('label') || key.humanize}.", field: key)
            end
            next
          end
          next if inputs[key].nil? && !field["required"]
          if model_suggestion && field["type"] == "record"
            raise Invalid.new("Choose #{field.fetch('label') || key.humanize} from the available list.", field: key)
          end
          normalized[key] = normalize_field(field, inputs[key], context:, operation: definition.fetch("key"), key:)
        end
        normalized
      end

      def self.suggestion!(definition:, raw:, context:)
        inputs = raw.respond_to?(:to_unsafe_h) ? raw.to_unsafe_h : raw
        raise Invalid.new("The assistant could not read that request.") unless inputs.is_a?(Hash)

        inputs = inputs.stringify_keys
        field_map = definition.fetch("fields").index_by { |field| field.fetch("key") }
        unknown = inputs.keys - field_map.keys
        raise Invalid.new("The assistant returned unsupported workflow fields.") if unknown.any?
        inputs.reject { |key, _value| field_map.fetch(key).fetch("type") == "record" }
          .each_with_object({}) do |(key, value), result|
            result[key] = normalize_field(field_map.fetch(key), value, context:,
              operation: definition.fetch("key"), key:)
          end
      end

      def self.missing_required(definition:, inputs:)
        definition.fetch("fields").select do |field|
          field["required"] && !inputs.key?(field.fetch("key"))
        end
      end

      def self.record_fields(definition)
        definition.fetch("fields").select { |field| field.fetch("type") == "record" }
      end

      def self.normalize_field(field, value, context:, operation:, key:)
        type = field.fetch("type")
        raise Invalid.new("#{key} has an unsupported field type.", field: key) unless FIELD_TYPES.include?(type)

        case type
        when "text"
          raise Invalid.new("#{key} must be text.", field: key) unless value.nil? || value.is_a?(String)
          text = value || ""
          maximum = bounded_limit(field["max_length"], default: 2_000)
          raise Invalid.new("#{key} is too long.", field: key) if text.length > maximum
          raise Invalid.new("Choose #{field.fetch('label') || key.humanize}.", field: key) if field["required"] && text.strip.empty?
          text
        when "number"
          unless value.is_a?(Integer) && value >= (field["minimum"] || 0) && value <= (field["maximum"] || 2_147_483_647)
            raise Invalid.new("#{key} must be a whole number in range.", field: key)
          end
          value
        when "decimal"
          raise Invalid.new("#{key} must be an exact decimal string.", field: key) unless value.is_a?(String)
          text = value
          unless text.length <= 40 && text.match?(/\A[+-]?[0-9]+(?:\.[0-9]+)?\z/)
            raise Invalid.new("#{key} must be an exact decimal string.", field: key)
          end
          text
        when "boolean"
          raise Invalid.new("#{key} must be true or false.", field: key) unless value == true || value == false
          value
        when "date"
          begin
            raise Date::Error unless value.is_a?(String)
            Date.iso8601(value).iso8601
          rescue Date::Error
            raise Invalid.new("#{key} must be a valid date.", field: key)
          end
        when "datetime"
          begin
            raise ArgumentError unless value.is_a?(String) && value.length <= 80
            zone_name = context&.site&.timezone_override.presence || context&.practice&.timezone
            zone = ActiveSupport::TimeZone[zone_name] if zone_name
            parsed = if value.match?(/(?:Z|[+-]\d{2}:?\d{2})\z/i)
              Time.iso8601(value).in_time_zone(zone || "UTC")
            elsif zone
              zone.iso8601(value)
            else
              raise ArgumentError
            end
            raise ArgumentError unless parsed
            parsed.iso8601(6)
          rescue ArgumentError
            raise Invalid.new("#{key} must be a valid date and time.", field: key)
          end
        when "select"
          raise Invalid.new("Choose an available #{field.fetch('label') || key.humanize}.", field: key) unless value.is_a?(String) || value.is_a?(Integer)
          option = Array(field["options"]).find { |candidate| candidate.fetch("value").to_s == value.to_s }
          raise Invalid.new("Choose an available #{field.fetch('label') || key.humanize}.", field: key) unless option
          option.fetch("value").to_s
        when "record"
          token = value
          raise Invalid.new("Choose an available #{field.fetch('label') || key.humanize}.", field: key) unless token.is_a?(String) && token.present? && token.length <= 80
          WorkflowContext.resolve_selection!(context:, operation:, field: key, selection_id: token)
        when "array"
          normalize_array(field, value, context:, operation:, key:)
        end
      end

      def self.normalize_array(field, value, context:, operation:, key:)
        raise Invalid.new("#{key} must be a list.", field: key) unless value.is_a?(Array)
        item = field["items"]
        raise Invalid.new("#{key} has no declared item schema.", field: key) unless item.is_a?(Hash)
        maximum = bounded_limit(field["max_items"], default: MAX_ARRAY_ITEMS)
        raise Invalid.new("#{key} has too many items.", field: key) if value.length > maximum

        item = item.deep_stringify_keys
        item_type = item["type"].to_s
        if item_type == "object"
          nested_fields = Array(item["fields"])
          raise Invalid.new("#{key} has an invalid item schema.", field: key) if nested_fields.empty? || nested_fields.length > MAX_FIELDS
          return value.each_with_index.map do |entry, index|
            nested_definition = { "key" => "#{key}[#{index}]", "fields" => nested_fields }
            normalize!(definition: nested_definition, raw: entry, context:, allow_missing: false)
          end
        end
        raise Invalid.new("#{key} has an unsupported item type.", field: key) unless ARRAY_ITEM_TYPES.include?(item_type)

        value.map.with_index do |entry, index|
          normalize_field(item, entry, context:, operation:, key: "#{key}[#{index}]")
        end
      end

      def self.bounded_limit(value, default:)
        return default unless value
        return value if value.is_a?(Integer) && value.between?(1, 10_000)

        default
      end

      private_class_method :normalize_field, :normalize_array, :bounded_limit
    end
  end
end
