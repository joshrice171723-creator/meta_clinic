module Clinic
  module Care
    # A versioned, non-FHIR intake form stored inside the existing encrypted,
    # append-only previsit note. Rendered text remains available to chart readers.
    module PrevisitIntake
      FORM_ID = "meta-clinic-previsit-v1".freeze
      FIELDS = [
        { id: "visit_reason", label: "What brings you in?", reusable: false },
        { id: "symptoms", label: "Symptoms and when they started", reusable: false },
        { id: "medications", label: "Current medicines and supplements", reusable: true },
        { id: "allergies", label: "Allergies and reactions", reusable: true },
        { id: "history", label: "Health history and recent changes", reusable: true },
        { id: "care_needs", label: "Communication, accessibility or other care needs", reusable: true }
      ].map(&:freeze).freeze
      PREFIX = "MC_INTAKE_V1\n".freeze
      MAX_ANSWER_LENGTH = 600

      module_function

      def encode(text:, answers:)
        raise ArgumentError, "Intake answers must be an object." unless answers.is_a?(Hash)
        unknown = answers.keys.map(&:to_s) - FIELDS.map { |field| field[:id] }
        raise ArgumentError, "Choose supported intake questions." if unknown.any?
        normalized = FIELDS.to_h do |field|
          value = answers[field[:id]] || answers[field[:id].to_sym] || ""
          raise ArgumentError, "Intake answers must be text." unless value.is_a?(String)
          value = value.strip
          raise ArgumentError, "Each intake answer must be #{MAX_ANSWER_LENGTH} characters or fewer." if value.length > MAX_ANSWER_LENGTH
          [field[:id], value]
        end
        return text.to_s.strip if normalized.values.all?(&:blank?)

        encoded = PREFIX + JSON.generate(form_id: FORM_ID, text: text.to_s.strip, answers: normalized)
        raise ArgumentError, "Shorten your intake answers and visit note before saving." if encoded.length > PrevisitNote::MAX_TEXT_LENGTH
        encoded
      end

      def decode(value)
        return unless value.to_s.start_with?(PREFIX)
        payload = JSON.parse(value.delete_prefix(PREFIX))
        return unless payload.is_a?(Hash) && payload["form_id"] == FORM_ID &&
          payload["text"].is_a?(String) && payload["answers"].is_a?(Hash) &&
          (payload["answers"].keys - FIELDS.map { |field| field[:id] }).empty? &&
          payload["answers"].values.all? { |answer| answer.is_a?(String) }
        payload
      rescue JSON::ParserError
        nil
      end

      def render(value)
        payload = decode(value)
        return value unless payload
        sections = FIELDS.filter_map do |field|
          answer = payload["answers"][field[:id]]
          "#{field[:label]}\n#{answer}" if answer.present?
        end
        sections << "Additional note\n#{payload['text']}" if payload["text"].present?
        "Patient-reported intake\n\n#{sections.join("\n\n") }"
      end
    end
  end
end
