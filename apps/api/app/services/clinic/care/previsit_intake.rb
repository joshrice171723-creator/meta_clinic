module Clinic
  module Care
    # A versioned, non-FHIR intake form stored inside the existing encrypted,
    # append-only previsit note. Rendered text remains available to chart readers.
    module PrevisitIntake
      FORM_ID = "meta-clinic-previsit-v3".freeze
      LEGACY_FORM_IDS = %w[meta-clinic-previsit-v1 meta-clinic-previsit-v2].freeze
      ATTESTATION_ID = "patient-confirmed-current-and-care-team-sharing".freeze
      ATTESTATION_VERSION = "2026-09-11".freeze
      QUESTIONNAIRE_VERSION = 1
      FIELDS = [
        { id: "visit_reason", label: "What brings you in?", reusable: false },
        { id: "symptoms", label: "Symptoms and when they started", reusable: false },
        { id: "medications", label: "Current medicines and supplements", reusable: true },
        { id: "allergies", label: "Allergies and reactions", reusable: true },
        { id: "history", label: "Health history and recent changes", reusable: true },
        { id: "care_needs", label: "Communication, accessibility or other care needs", reusable: true },
        { id: "goals", label: "What would you like help with?", reusable: false },
        { id: "telehealth_location", label: "Where are you physically located for this video visit? (City and state)", reusable: false },
        { id: "prior_approaches", label: "Previous treatments and medicines", reusable: true, history_kind: "treatment" },
        { id: "procedures", label: "Previous procedures, surgeries, or hospitalizations", reusable: true, history_kind: "procedure" },
        { id: "barriers", label: "Anything making your plan difficult to follow?", reusable: false },
        { id: "height", label: "Current height", reusable: false, units: %w[cm [in_i]] },
        { id: "weight", label: "Current weight", reusable: false, units: %w[kg [lb_av]] }
      ].map(&:freeze).freeze
      PREFIX = "MC_INTAKE_V1\n".freeze
      MAX_ANSWER_LENGTH = 600
      MAX_HISTORY_ENTRIES = 20
      ANSWER_STATES = %w[answered unanswered not_asked unknown declined not_applicable negative].freeze
      HISTORY_DATE_PRECISIONS = %w[exact approximate unknown].freeze
      TREATMENT_KINDS = %w[diet_program medication other].freeze
      TREATMENT_DURATIONS = %w[less_than_month one_to_three_months three_to_six_months six_to_twelve_months more_than_year unknown].freeze
      TREATMENT_OUTCOMES = %w[no_benefit some_benefit meaningful_benefit_not_maintained unknown].freeze
      TREATMENT_MAINTENANCE = %w[yes no unknown not_applicable].freeze
      TREATMENT_STOP_REASONS = %w[completed no_benefit adverse_effect cost_or_access preference clinician_advice ongoing unknown].freeze
      PROCEDURE_KINDS = %w[procedure surgery hospitalization other].freeze
      PROCEDURE_OUTCOMES = %w[helpful not_helpful mixed unknown].freeze
      PROCEDURE_COMPLICATIONS = %w[none_reported known unknown not_applicable].freeze
      SPECIALTY_FORMS = {
        "weight-management-initial-v1" => FIELDS.reject { |field| field[:id] == "symptoms" } + [
          { id: "habits", label: "Is there anything about eating, activity or sleep you want to discuss?", reusable: false }
        ],
        "weight-management-follow-up-v1" => FIELDS.select { |field| %w[goals barriers weight care_needs].include?(field[:id]) } + [
          { id: "changes", label: "What has changed since your last visit?", reusable: false },
          { id: "history_changes", label: "Have your medicines, supplements, allergies or health history changed?", reusable: false,
            choices: %w[yes no unknown declined] },
          { id: "change_details", label: "Describe the change, or save it for discussion at your visit.", reusable: false },
          { id: "habits", label: "Is there anything about eating, activity or sleep you want to discuss?", reusable: false }
        ]
      }.freeze

      module_function

      def fields(form_id = FORM_ID)
        SPECIALTY_FORMS.fetch(form_id, FIELDS)
      end

      def form_for(practice:, appointment: nil, payload: nil)
        id = payload&.fetch("form_id", nil) || Configuration::StarterProfile.form_id(practice:, appointment:)
        { id: id, version: QUESTIONNAIRE_VERSION, fields: fields(id), answer_states: ANSWER_STATES,
          provenance: %w[patient_reported staff_recorded inherited imported calculated] }
      end

      def medication_options(practice)
        Clinic::Inventory::PharmacyProduct.where(practice: practice, category: "medication", active: true)
          .order(:name, :id).limit(500).pluck(:name)
      end

      def encode(text:, answers:, attested:, status: "submitted", inherited_from: nil, recorder: "patient", form_id: FORM_ID,
        confirmed_chunks: [])
        raise ArgumentError, "Choose a supported form revision." unless ([FORM_ID] + SPECIALTY_FORMS.keys).include?(form_id)
        raise ArgumentError, "Choose draft or submitted intake." unless %w[draft submitted].include?(status)
        raise ArgumentError, "Intake answers must be an object." unless answers.is_a?(Hash)
        confirmed_chunks = normalize_confirmed_chunks(confirmed_chunks)
        unknown = answers.keys.map(&:to_s) - fields(form_id).map { |field| field[:id] }
        raise ArgumentError, "Choose supported intake questions." if unknown.any?
        normalized = fields(form_id).to_h do |field|
          value = answers[field[:id]] || answers[field[:id].to_sym] || ""
          [field[:id], normalize_answer(value, field, status: status)]
        end
        additional_text = text.to_s.strip
        raise ArgumentError, "Intake note must be text." unless text.is_a?(String)
        return additional_text if normalized.values.all? { |answer| answer["state"] == "unanswered" } && additional_text.blank? && status == "submitted"
        if status == "submitted" && attested != true
          raise ArgumentError, recorder == "staff" ? "Confirm that you recorded these answers from the patient." : "Confirm the intake is current and may be shared with your care team."
        end

        encoded = PREFIX + JSON.generate(
          form_id: form_id,
          questionnaire_version: QUESTIONNAIRE_VERSION,
          status: status,
          text: additional_text,
          answers: normalized,
          confirmed_chunks: confirmed_chunks,
          inherited_from: inherited_from,
          recorder: recorder,
          staff_confirmation: status == "submitted" && recorder == "staff",
          attestation: status == "submitted" && recorder == "patient" ? {
            id: ATTESTATION_ID,
            version: ATTESTATION_VERSION,
            accepted: true
          } : nil
        )
        raise ArgumentError, "Shorten your intake answers and visit note before saving." if encoded.length > PrevisitNote::MAX_TEXT_LENGTH
        encoded
      end

      def normalize_confirmed_chunks(value)
        chunks = Array(value).map { |item| Integer(item.to_s, 10) }
        raise ArgumentError, "Confirmed intake groups must be non-negative integers." if chunks.any?(&:negative?)

        chunks.uniq.sort
      rescue ArgumentError
        raise ArgumentError, "Confirmed intake groups must be non-negative integers."
      end
      private_class_method :normalize_confirmed_chunks

      def normalize_answer(value, field, status: "submitted")
        return normalize_history_answer(value, field, status:) if field[:history_kind]

        value = { "state" => value.blank? ? "unanswered" : "answered", "value" => value } if value.is_a?(String)
        raise ArgumentError, "Intake answers must be text or structured answers." unless value.is_a?(Hash)
        value = value.stringify_keys
        raise ArgumentError, "Choose supported answer details." if (value.keys - %w[state value unit measured_at source]).any?
        state = value.fetch("state", "unanswered")
        raise ArgumentError, "Choose a supported answer state." unless ANSWER_STATES.include?(state)
        text = value.fetch("value", "")
        raise ArgumentError, "Intake answer values must be text." unless text.is_a?(String)
        text = text.strip
        state = "unanswered" if state == "answered" && text.blank?
        raise ArgumentError, "Each intake answer must be #{MAX_ANSWER_LENGTH} characters or fewer." if text.length > MAX_ANSWER_LENGTH
        raise ArgumentError, "Only an answered question can contain a value." if state != "answered" && text.present?
        result = { "state" => state, "value" => text }
        if field[:choices] && state == "answered" && !field[:choices].include?(text)
          raise ArgumentError, "Choose a listed answer for #{field[:label]}"
        end
        if field[:units] && state == "answered"
          raise ArgumentError, "Enter a positive measurement." unless text.match?(/\A\d+(?:\.\d+)?\z/) && BigDecimal(text).positive?
          raise ArgumentError, "Choose a supported measurement unit." unless (status == "draft" && value["unit"].blank?) || field[:units].include?(value["unit"])
          source = value["source"]
          raise ArgumentError, "Choose how the measurement was obtained." unless (status == "draft" && source.blank?) || %w[patient_reported clinic_measured].include?(source)
          measured_at = value["measured_at"]
          begin
            if status == "draft" && measured_at.blank?
              measured_at = nil
            else
              raise ArgumentError unless measured_at.is_a?(String) && measured_at.match?(/\A\d{4}-\d{2}-\d{2}\z/)
              date = Date.iso8601(measured_at)
              raise ArgumentError if date > Current.business_time.to_date
            end
          rescue ArgumentError
            raise ArgumentError, "Enter the actual measurement date, not a future date."
          end
          result.merge!("unit" => value["unit"], "source" => source, "measured_at" => measured_at)
        elsif (value.keys - %w[state value]).any?
          raise ArgumentError, "Measurement details belong only to an answered height or weight."
        end
        result
      end

      def normalize_history_answer(value, field, status: "submitted")
        value = { "state" => value.blank? ? "unanswered" : "answered", "value" => value } if value.is_a?(String)
        raise ArgumentError, "Intake answers must be text or structured answers." unless value.is_a?(Hash)

        value = value.stringify_keys
        raise ArgumentError, "Choose supported history answer details." if (value.keys - %w[state value entries]).any?
        state = value.fetch("state", "unanswered")
        raise ArgumentError, "Choose a supported answer state." unless ANSWER_STATES.include?(state)
        text = value.fetch("value", "")
        raise ArgumentError, "Intake answer values must be text." unless text.is_a?(String)
        text = text.strip
        entries = value.fetch("entries", nil)
        if entries.nil?
          raise ArgumentError, "Each intake answer must be #{MAX_ANSWER_LENGTH} characters or fewer." if text.length > MAX_ANSWER_LENGTH
          state = "unanswered" if state == "answered" && text.blank?
          raise ArgumentError, "Only an answered question can contain a value." if state != "answered" && text.present?
          return { "state" => state, "value" => text }
        end

        raise ArgumentError, "History entries must be an array." unless entries.is_a?(Array)
        raise ArgumentError, "Add fewer history entries." if entries.length > MAX_HISTORY_ENTRIES
        raise ArgumentError, "Only an answered question can contain history entries." unless state == "answered"
        raise ArgumentError, "Answer at least one history entry." if entries.empty?

        normalized_entries = entries.map { |entry| normalize_history_entry(entry, field[:history_kind]) }
        raise ArgumentError, "Shorten the history details before saving." if JSON.generate(normalized_entries).length > 5_000
        { "state" => state, "value" => "", "entries" => normalized_entries }
      end

      def normalize_history_entry(entry, kind)
        raise ArgumentError, "History entries must be objects." unless entry.is_a?(Hash)

        entry = entry.stringify_keys
        allowed = %w[kind name date_precision date_value duration outcome maintenance stop_reason adverse_effects adverse_effect_details complication_state complication_details]
        raise ArgumentError, "Choose supported history entry details." if (entry.keys - allowed).any?
        name = entry.fetch("name", "").to_s.strip
        raise ArgumentError, "Name each previous treatment or procedure." if name.blank?
        raise ArgumentError, "History names must be 240 characters or fewer." if name.length > 240
        date_precision = entry.fetch("date_precision", "unknown").to_s
        raise ArgumentError, "Choose a supported date certainty." unless HISTORY_DATE_PRECISIONS.include?(date_precision)
        date_value = entry.fetch("date_value", "").to_s.strip
        if date_precision == "exact"
          raise ArgumentError, "Enter a complete historical date." unless date_value.match?(/\A\d{4}-\d{2}-\d{2}\z/)
          raise ArgumentError, "Historical dates cannot be in the future." if Date.iso8601(date_value) > Current.business_time.to_date
        elsif date_precision == "approximate"
          raise ArgumentError, "Enter an approximate year." unless date_value.match?(/\A\d{4}\z/)
          raise ArgumentError, "Historical dates cannot be in the future." if date_value.to_i > Current.business_time.year
        else
          date_value = ""
        end
        normalized = { "kind" => entry.fetch("kind", "other").to_s, "name" => name,
          "date_precision" => date_precision, "date_value" => date_value }
        if kind == "treatment"
          normalized["kind"] = enum_history_value(normalized["kind"], TREATMENT_KINDS, "treatment type")
          normalized["duration"] = enum_history_value(entry.fetch("duration", "unknown"), TREATMENT_DURATIONS, "treatment duration")
          normalized["outcome"] = enum_history_value(entry.fetch("outcome", "unknown"), TREATMENT_OUTCOMES, "treatment outcome")
          normalized["maintenance"] = enum_history_value(entry.fetch("maintenance", "unknown"), TREATMENT_MAINTENANCE, "maintenance status")
          normalized["stop_reason"] = enum_history_value(entry.fetch("stop_reason", "unknown"), TREATMENT_STOP_REASONS, "reason ended")
          normalized["adverse_effects"] = enum_history_value(entry.fetch("adverse_effects", "unknown"), %w[none_reported reported unknown], "adverse-effect status")
          normalized["adverse_effect_details"] = bounded_history_text(entry["adverse_effect_details"])
        else
          normalized["kind"] = enum_history_value(normalized["kind"], PROCEDURE_KINDS, "procedure type")
          normalized["outcome"] = enum_history_value(entry.fetch("outcome", "unknown"), PROCEDURE_OUTCOMES, "procedure outcome")
          normalized["complication_state"] = enum_history_value(entry.fetch("complication_state", "unknown"), PROCEDURE_COMPLICATIONS, "complication status")
          normalized["complication_details"] = bounded_history_text(entry["complication_details"])
        end
        normalized
      rescue ArgumentError
        raise
      rescue Date::Error
        raise ArgumentError, "Enter a valid historical date."
      end

      def enum_history_value(value, allowed, label)
        normalized = value.to_s
        raise ArgumentError, "Choose a supported #{label}." unless allowed.include?(normalized)

        normalized
      end

      def bounded_history_text(value)
        text = value.to_s.strip
        raise ArgumentError, "History details must be 600 characters or fewer." if text.length > MAX_ANSWER_LENGTH

        text
      end

      def decode(value)
        return unless value.to_s.start_with?(PREFIX)
        payload = JSON.parse(value.delete_prefix(PREFIX))
        modern = payload.is_a?(Hash) && ([FORM_ID] + SPECIALTY_FORMS.keys).include?(payload["form_id"])
        return unless payload.is_a?(Hash) && ([ FORM_ID ] + LEGACY_FORM_IDS + SPECIALTY_FORMS.keys).include?(payload["form_id"]) &&
          payload["text"].is_a?(String) && payload["answers"].is_a?(Hash) &&
          (payload["answers"].keys - fields(payload["form_id"]).map { |field| field[:id] }).empty? &&
          payload["answers"].values.all? { |answer| answer.is_a?(String) || (modern && answer.is_a?(Hash)) }
        return if modern && payload["questionnaire_version"].present? && payload["questionnaire_version"] != QUESTIONNAIRE_VERSION
        return if modern && payload["confirmed_chunks"].present? &&
          (!payload["confirmed_chunks"].is_a?(Array) || payload["confirmed_chunks"].any? { |item| !item.is_a?(Integer) || item.negative? })
        return unless !modern || %w[draft submitted].include?(payload["status"])
        if payload["form_id"] == "meta-clinic-previsit-v2" || (modern && payload["status"] == "submitted" && payload["recorder"] != "staff")
          attestation = payload["attestation"]
          return unless attestation.is_a?(Hash) && attestation == {
            "id" => ATTESTATION_ID,
            "version" => ATTESTATION_VERSION,
            "accepted" => true
          }
        end
        payload
      rescue JSON::ParserError
        nil
      end

      def render(value)
        payload = decode(value)
        return value unless payload
        sections = fields(payload["form_id"]).filter_map do |field|
          answer = answer_text(payload["answers"][field[:id]])
          "#{field[:label]}\n#{answer}" if answer.present?
        end
        sections << "Additional note\n#{payload['text']}" if payload["text"].present?
        if payload["attestation"]
          sections << "Patient confirmation\nConfirmed current and authorized for care-team review"
        end
        sections << "Staff confirmation\nRecorded by staff; this is not a patient attestation or clinical review." if payload["staff_confirmation"]
        if payload["inherited_from"].is_a?(Hash)
          source = payload["inherited_from"]
          sections << "Previous-answer source\nNote #{source['note_id']}, version #{source['version']}, recorded #{source['recorded_at']}; questions: #{Array(source['question_ids']).join(', ')}"
        end
        heading = payload["status"] == "draft" ? "Patient-reported intake — draft, not confirmed" : "Patient-reported intake"
        "#{heading}\n\n#{sections.join("\n\n") }"
      end

      def answer_text(answer)
        return answer unless answer.is_a?(Hash)
        return nil if answer["state"] == "unanswered"
        return nil unless ANSWER_STATES.include?(answer["state"])
        return answer["state"].tr("_", " ").capitalize unless answer["state"] == "answered"
        if answer["entries"].is_a?(Array)
          return answer["entries"].filter_map do |entry|
            next unless entry.is_a?(Hash)

            details = [ entry["kind"], entry["outcome"], entry["date_value"].presence || entry["date_precision"] ]
            [ entry["name"], details.compact.join(" · ") ].compact.join(" — ")
          end.join("\n")
        end
        [ answer["value"], answer["unit"], answer["measured_at"], answer["source"]&.tr("_", " ") ].compact.join(" ")
      end
    end
  end
end
