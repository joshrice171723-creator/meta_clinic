require "json"

module Clinic
  module Care
    module SoapNotePayload
      VERSION = 1
      CORRECTION_VERSION = 2
      SECTION_KEYS = %i[subjective objective assessment plan].freeze
      MAX_SECTION_LENGTH = 50_000
      MAX_CORRECTION_REASON_LENGTH = 2_000

      def self.dump(template_id:, template_version:, sections:)
        template = NoteTemplateCatalog.fetch!(template_id.to_s, template_version)
        normalized = normalize_sections!(sections)

        JSON.generate(
          schema: "soap-note-v1",
          note_kind: "soap",
          template_id: template[:id],
          template_version: template[:version],
          sections: normalized
        )
      end

      def self.dump_correction(template_id:, template_version:, sections:, corrected_revision_id:,
        corrected_revision_no:, reason:, source: { kind: "manual" })
        template = NoteTemplateCatalog.fetch!(template_id.to_s, template_version)
        normalized = normalize_sections!(sections)
        correction = normalize_correction!(
          corrected_revision_id: corrected_revision_id,
          corrected_revision_no: corrected_revision_no,
          reason: reason,
          source: source
        )

        JSON.generate(
          schema: "soap-note-v2",
          note_kind: "soap",
          template_id: template[:id],
          template_version: template[:version],
          sections: normalized,
          correction: correction
        )
      end

      def self.load!(value)
        payload = JSON.parse(value.to_s, symbolize_names: true)
        unless %w[soap-note-v1 soap-note-v2].include?(payload[:schema]) &&
          payload[:note_kind] == "soap" && payload[:sections].is_a?(Hash)
          raise ArgumentError, "The saved SOAP note format is not supported."
        end

        template = NoteTemplateCatalog.fetch!(payload[:template_id].to_s, payload[:template_version])
        sections = SECTION_KEYS.to_h { |key| [ key, payload[:sections].fetch(key, "").to_s ] }
        result = {
          schema: payload[:schema],
          note_kind: payload[:note_kind],
          template_id: template[:id],
          template_version: template[:version],
          sections: sections
        }
        if payload[:schema] == "soap-note-v2"
          correction = payload[:correction]
          raise ArgumentError, "The saved SOAP note correction is not supported." unless correction.is_a?(Hash)

          result[:correction] = normalize_correction!(
            corrected_revision_id: correction[:corrected_revision_id],
            corrected_revision_no: correction[:corrected_revision_no],
            reason: correction[:reason],
            source: correction[:source]
          )
        end
        result
      rescue JSON::ParserError, TypeError
        raise ArgumentError, "The saved SOAP note format is not supported."
      end

      def self.assert_same_template!(current_payload, replacement_payload)
        current = load!(current_payload)
        replacement = load!(replacement_payload)
        return if current.values_at(:template_id, :template_version) == replacement.values_at(:template_id, :template_version)

        raise ArgumentError, "A saved note cannot switch templates. Start a separate reviewed workflow instead."
      end

      def self.prepare_revision(current_payload, replacement_payload)
        current = load!(current_payload)
        replacement = load!(replacement_payload)
        unless current.values_at(:template_id, :template_version) == replacement.values_at(:template_id, :template_version)
          raise ArgumentError, "A saved note cannot switch templates. Start a separate reviewed workflow instead."
        end
        if current[:correction].nil?
          raise ArgumentError, "Start corrections through the signed note correction workflow." if replacement[:correction]

          return { encrypted_body: replacement_payload, payload_version: VERSION }
        end
        if replacement[:correction] && replacement[:correction] != current[:correction]
          raise ArgumentError, "Correction provenance cannot be changed while editing the unsigned revision."
        end

        correction = current.fetch(:correction)
        {
          encrypted_body: dump_correction(
            template_id: replacement.fetch(:template_id),
            template_version: replacement.fetch(:template_version),
            sections: replacement.fetch(:sections),
            corrected_revision_id: correction.fetch(:corrected_revision_id),
            corrected_revision_no: correction.fetch(:corrected_revision_no),
            reason: correction.fetch(:reason),
            source: correction.fetch(:source)
          ),
          payload_version: CORRECTION_VERSION
        }
      end

      def self.normalize_sections!(sections)
        values = sections.respond_to?(:to_h) ? sections.to_h.with_indifferent_access : {}
        normalized = SECTION_KEYS.to_h do |key|
          value = values.fetch(key, "").to_s
          raise ArgumentError, "#{key.to_s.humanize} is too long." if value.length > MAX_SECTION_LENGTH

          [ key, value ]
        end
        raise ArgumentError, "Enter note content before saving." if normalized.values.all?(&:blank?)

        normalized
      end
      private_class_method :normalize_sections!

      def self.normalize_correction!(corrected_revision_id:, corrected_revision_no:, reason:, source:)
        revision_id = positive_integer!(corrected_revision_id, "The corrected revision is invalid.")
        revision_no = positive_integer!(corrected_revision_no, "The corrected revision is invalid.")

        normalized_reason = reason.to_s.strip
        raise ArgumentError, "Enter a correction reason." if normalized_reason.blank?
        if normalized_reason.length > MAX_CORRECTION_REASON_LENGTH
          raise ArgumentError, "The correction reason is too long."
        end

        values = source.respond_to?(:to_h) ? source.to_h.with_indifferent_access : {}
        case values[:kind].to_s
        when "manual"
          normalized_source = { kind: "manual" }
        when "scribe_export"
          draft_id = positive_integer!(values[:draft_id], "The Scribe correction source is invalid.")
          digest = values[:output_digest].to_s
          unless digest.match?(/\A[0-9a-f]{64}\z/)
            raise ArgumentError, "The Scribe correction source is invalid."
          end
          normalized_source = { kind: "scribe_export", draft_id: draft_id, output_digest: digest }
        else
          raise ArgumentError, "The correction source is not supported."
        end

        {
          corrected_revision_id: revision_id,
          corrected_revision_no: revision_no,
          reason: normalized_reason,
          source: normalized_source
        }
      end
      private_class_method :normalize_correction!

      def self.positive_integer!(value, message)
        integer = Integer(value)
        return integer if integer.positive?

        raise ArgumentError, message
      rescue TypeError, ArgumentError
        raise ArgumentError, message
      end
      private_class_method :positive_integer!
    end
  end
end
