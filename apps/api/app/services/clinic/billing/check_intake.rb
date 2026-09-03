module Clinic
  module Billing
    # Provider integration is deliberately unavailable until the product, privacy,
    # retention and access policies are approved. An eventual adapter must accept
    # only this metadata contract and must never receive raw image bytes from APPly.
    module CheckOcrAdapter
      class NotAuthorized < StandardError; end

      def self.scan(**)
        raise NotAuthorized, "Check scanning/OCR provider is not authorized."
      end
    end

    class CheckIntake
      ALLOWED_METADATA_KEYS = %w[amount check_number currency provider_reference].freeze
      IMAGE_KEYS = %w[image image_base64 image_bytes image_data mime_type object_key raw_image raw_payload].freeze
      MAX_CHECK_NUMBER_LENGTH = 64
      MAX_PROVIDER_REFERENCE_LENGTH = 100
      MAX_STATUS_LENGTH = 64

      Result = Data.define(:status, :metadata, :redacted_response)

      def self.call(metadata:, adapter: CheckOcrAdapter)
        normalized = validate_metadata!(metadata)
        response = adapter.scan(metadata: normalized)

        Result.new(
          status: normalize_status(response),
          metadata: redacted_metadata(normalized),
          redacted_response: redact_response(response)
        )
      end

      def self.validate_metadata!(metadata)
        raise ArgumentError, "Check intake metadata must be an object." unless metadata.is_a?(Hash)

        values = metadata.each_with_object({}) { |(key, value), result| result[key.to_s] = value }
        if (values.keys & IMAGE_KEYS).any?
          raise ArgumentError, "Check intake metadata cannot contain image material."
        end

        rejected = values.keys - ALLOWED_METADATA_KEYS
        if rejected.any?
          raise ArgumentError, "Check intake metadata contains unsupported or protected fields."
        end

        normalized = {}
        if values.key?("amount")
          normalized["amount"] = Money.decimal(values["amount"], name: "check amount", positive: true).to_s("F")
        end
        if values.key?("currency")
          currency = values["currency"].to_s.strip.upcase
          raise ArgumentError, "Check currency must be a three-letter code." unless currency.match?(/\A[A-Z]{3}\z/)

          normalized["currency"] = currency
        end
        if values.key?("check_number")
          normalized["check_number"] = bounded_string(values["check_number"], "check number", MAX_CHECK_NUMBER_LENGTH)
        end
        if values.key?("provider_reference")
          normalized["provider_reference"] = bounded_string(values["provider_reference"], "provider reference", MAX_PROVIDER_REFERENCE_LENGTH)
        end
        normalized
      end

      def self.redacted_metadata(metadata)
        {
          "amount" => metadata["amount"],
          "currency" => metadata["currency"],
          "has_check_number" => metadata.key?("check_number"),
          "has_provider_reference" => metadata.key?("provider_reference")
        }.compact
      end

      def self.redact_response(response)
        raise ArgumentError, "Check OCR adapter response must be an object." unless response.is_a?(Hash)

        fields = response["fields"] || response[:fields]
        field_names = fields.is_a?(Hash) ? fields.keys.map(&:to_s).reject(&:empty?).first(50).sort : []
        { "status" => normalize_status(response), "fields_present" => field_names }
      end

      def self.normalize_status(response)
        status = response.is_a?(Hash) ? (response["status"] || response[:status]) : nil
        status = status.to_s.strip
        if status.empty? || status.length > MAX_STATUS_LENGTH
          raise ArgumentError, "Check OCR adapter response has an invalid status."
        end

        status
      end

      def self.bounded_string(value, name, maximum)
        normalized = value.to_s.strip
        if normalized.empty? || normalized.length > maximum
          raise ArgumentError, "#{name} is blank or exceeds the supported length."
        end

        normalized
      end
      private_class_method :bounded_string
    end
  end
end
