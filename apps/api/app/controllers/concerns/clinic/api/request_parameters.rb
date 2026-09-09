module Clinic
  module Api
    module RequestParameters
      class Invalid < StandardError
        attr_reader :field

        def initialize(message, field: nil)
          @field = field
          super(message)
        end
      end

      private

      def parameter_hash!(name, permitted, arrays: [], nested_arrays: {})
        value = params.require(name)
        unless value.is_a?(ActionController::Parameters)
          raise Invalid.new("#{name} must be an object.", field: name)
        end

        allowed = permitted.map(&:to_sym) + arrays.map(&:to_sym) + nested_arrays.keys.map(&:to_sym)
        unknown = value.keys.map(&:to_sym) - allowed
        if unknown.any?
          raise Invalid.new("#{unknown.first} is not a supported field.", field: unknown.first)
        end

        (arrays + nested_arrays.keys).each do |field|
          next unless value.key?(field) || value.key?(field.to_s)

          candidate = value[field]
          unless candidate.is_a?(Array)
            raise Invalid.new("#{field} must be an array.", field: field)
          end
        end

        filters = permitted.dup
        filters << arrays.to_h { |field| [ field, [] ] } if arrays.any?
        nested_arrays.each { |field, fields| filters << { field => fields } }
        value.permit(*filters)
      end

      def required_string!(value, field:, maximum: 255)
        text = value.to_s.strip
        if text.empty? || text.length > maximum
          raise Invalid.new("#{field} is required and must be at most #{maximum} characters.", field: field)
        end

        text
      end

      def optional_string(value, field:, maximum: 255)
        return nil if value.nil?

        text = value.to_s.strip
        raise Invalid.new("#{field} must be at most #{maximum} characters.", field: field) if text.length > maximum

        text.presence
      end

      def integer_id!(value, field:)
        text = value.to_s
        unless text.match?(/\A[1-9]\d*\z/)
          raise Invalid.new("#{field} must be a positive integer.", field: field)
        end

        text.to_i
      end

      def bounded_integer!(value, field:, min: 0, max: 100_000)
        text = value.to_s
        unless text.match?(/\A\d+\z/)
          raise Invalid.new("#{field} must be a whole number.", field: field)
        end

        number = text.to_i
        raise Invalid.new("#{field} must be between #{min} and #{max}.", field: field) unless number.between?(min, max)

        number
      end

      def boolean_param(value, field:)
        case value
        when true, "true" then true
        when false, "false" then false
        else raise Invalid.new("#{field} must be true or false.", field: field)
        end
      end

      def enum_param!(value, field:, allowed:)
        text = required_string!(value, field: field, maximum: 80)
        raise Invalid.new("#{field} must be one of: #{allowed.join(', ')}.", field: field) unless allowed.include?(text)

        text
      end

      def time_param!(value, field:)
        text = required_string!(value, field: field, maximum: 80)
        raise ArgumentError unless text.match?(/(?:Z|[+-]\d{2}:\d{2})\z/)
        Time.iso8601(text)
      rescue ArgumentError
        raise Invalid.new("#{field} must be an ISO 8601 timestamp with an offset.", field: field)
      end

      def date_param!(value, field:)
        text = required_string!(value, field: field, maximum: 10)
        Date.iso8601(text)
      rescue ArgumentError
        raise Invalid.new("#{field} must be an ISO 8601 date.", field: field)
      end

      def decimal_string!(value, field:, maximum: 30)
        text = required_string!(value, field: field, maximum: maximum)
        unless text.match?(/\A\d+(?:\.\d+)?\z/)
          raise Invalid.new("#{field} must be a non-negative exact decimal string.", field: field)
        end

        text
      end

      def page_param
        bounded_integer!(params[:page].presence || "1", field: :page, min: 1, max: 100_000)
      end

      def per_page_param(default: 25, maximum: 100)
        bounded_integer!(params[:per_page].presence || default.to_s, field: :per_page, min: 1, max: maximum)
      end

      def query_param(maximum: 100)
        optional_string(params[:q], field: :q, maximum: maximum) || ""
      end

      def render_parameter_error(error)
        payload = { error: error.message }
        payload[:field] = error.field.to_s if error.field
        render json: payload, status: :bad_request
      end
    end
  end
end
