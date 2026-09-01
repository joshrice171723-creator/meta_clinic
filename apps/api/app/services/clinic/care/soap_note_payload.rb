require "json"

module Clinic
  module Care
    module SoapNotePayload
      VERSION = 1
      SECTION_KEYS = %i[subjective objective assessment plan].freeze
      MAX_SECTION_LENGTH = 50_000

      def self.dump(template_id:, template_version:, sections:)
        template = NoteTemplateCatalog.fetch!(template_id.to_s, template_version)
        normalized = SECTION_KEYS.to_h do |key|
          value = sections.fetch(key, "").to_s
          raise ArgumentError, "#{key.to_s.humanize} is too long." if value.length > MAX_SECTION_LENGTH

          [ key, value ]
        end
        raise ArgumentError, "Enter note content before saving." if normalized.values.all?(&:blank?)

        JSON.generate(
          schema: "soap-note-v1",
          note_kind: "soap",
          template_id: template[:id],
          template_version: template[:version],
          sections: normalized
        )
      end

      def self.load!(value)
        payload = JSON.parse(value.to_s, symbolize_names: true)
        unless payload[:schema] == "soap-note-v1" && payload[:note_kind] == "soap" && payload[:sections].is_a?(Hash)
          raise ArgumentError, "The saved SOAP note format is not supported."
        end

        template = NoteTemplateCatalog.fetch!(payload[:template_id].to_s, payload[:template_version])
        sections = SECTION_KEYS.to_h { |key| [ key, payload[:sections].fetch(key, "").to_s ] }
        {
          schema: payload[:schema],
          note_kind: payload[:note_kind],
          template_id: template[:id],
          template_version: template[:version],
          sections: sections
        }
      rescue JSON::ParserError, TypeError
        raise ArgumentError, "The saved SOAP note format is not supported."
      end

      def self.assert_same_template!(current_payload, replacement_payload)
        current = load!(current_payload)
        replacement = load!(replacement_payload)
        return if current.values_at(:template_id, :template_version) == replacement.values_at(:template_id, :template_version)

        raise ArgumentError, "A saved note cannot switch templates. Start a separate reviewed workflow instead."
      end
    end
  end
end
