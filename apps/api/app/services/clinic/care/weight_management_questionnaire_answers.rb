module Clinic
  module Care
    # Validation for the one-level typed questionnaire contract. No clinical
    # interpretation, dose conversion, reference lookup or record verification.
    module WeightManagementQuestionnaireAnswers
      MAX_TEXT_LENGTH = 600
      MAX_ENTRIES = 20
      MAX_RECORD_ANSWER_LENGTH = 32_000
      MAX_SELECTIONS = 40
      STATES = %w[answered unanswered not_asked unknown declined not_applicable negative].freeze
      EXCLUSIVE_CHOICES = %w[none none_known none_reported unsure unknown].freeze

      module_function

      def normalize(value, field, status:)
        value = { "state" => value.blank? ? "unanswered" : "answered", "value" => value } if value.is_a?(String)
        value = object(value, "Intake answer")
        allowed = %w[state value]
        allowed += %w[entries] if field[:record_fields]
        allowed += %w[values] if field[:input_type] == "multiselect"
        allowed += %w[other_detail] if field[:choices]&.include?("other")
        allowed += %w[unit measured_at source verification source_details] if field[:units]
        raise ArgumentError, "Choose supported answer details for #{field[:label]}." if (value.keys - allowed).any?
        state = value.fetch("state", "unanswered")
        raise ArgumentError, "Choose a supported answer state." unless STATES.include?(state)
        text = text_value(value.fetch("value", ""), field)
        if field[:record_fields]
          return normalize_records(value, field, state, text, status:)
        end
        if field[:input_type] == "multiselect"
          raise ArgumentError, "Send selected choices as values for #{field[:label]}." if text.present?
          values = selections(value.fetch("values", []), field)
          raise ArgumentError, "Only answered questions can contain selections." if state != "answered" && values.any?
          state = "unanswered" if state == "answered" && values.empty?
          result = { "state" => state, "value" => "", "values" => values }
          normalize_other_detail!(result, value, values, field)
          return result
        end
        state = "unanswered" if state == "answered" && text.empty?
        raise ArgumentError, "Only answered questions can contain values." if state != "answered" && text.present?
        result = { "state" => state, "value" => text }
        if state == "answered"
          result["value"] = scalar(text, field)
          normalize_measurement!(result, value, field, status:) if field[:units]
        elsif (value.keys - %w[state value]).any? { |key| value[key].present? }
          raise ArgumentError, "Measurement details require an answered measurement."
        end
        normalize_other_detail!(result, value, [text], field)
        result
      end

      def normalize_other_detail!(result, value, selected, field)
        return unless value.key?("other_detail")
        detail = text_value(value["other_detail"], { label: "#{field[:label]} other detail" })
        if detail.present? && (result["state"] != "answered" || !selected.include?("other"))
          raise ArgumentError, "Other detail requires an answered Other choice."
        end
        result["other_detail"] = detail
      end

      def normalize_records(value, field, state, text, status:)
        raise ArgumentError, "Use typed records for #{field[:label]}." if text.present?
        entries = value.fetch("entries", [])
        raise ArgumentError, "Records must be an array." unless entries.is_a?(Array)
        raise ArgumentError, "Add fewer records for #{field[:label]}." if entries.size > field.fetch(:max_entries, MAX_ENTRIES)
        raise ArgumentError, "Only answered questions can contain records." if state != "answered" && entries.any?
        if state == "answered" && entries.empty?
          raise ArgumentError, "Add at least one record for #{field[:label]}." unless status == "draft"
          state = "unanswered"
        end
        normalized = entries.map { |entry| normalize_entry(entry, field[:record_fields], status:) }
        raise ArgumentError, "Shorten the records for #{field[:label]}." if JSON.generate(normalized).length > MAX_RECORD_ANSWER_LENGTH
        { "state" => state, "value" => "", "entries" => normalized }
      end

      def normalize_entry(entry, definitions, status:, allow_empty: false)
        entry = object(entry, "Record")
        raise ArgumentError, "Choose supported record fields." if (entry.keys - definitions.map { |child| child[:id] }).any?
        result = entry.to_h do |key, value|
          definition = definitions.find { |child| child[:id] == key }
          normalized = definition[:input_type] == "multiselect" ? selections(value, definition) : scalar(value, definition)
          [key, normalized]
        end
        raise ArgumentError, "Fill in or remove the empty record." if !allow_empty && result.values.all?(&:blank?)
        definitions.each do |definition|
          next if result[definition[:id]].blank? || !definition[:unit_field]
          unit = result[definition[:unit_field]]
          raise ArgumentError, "Choose a unit for #{definition[:label]}." if status != "draft" && unit.blank?
        end
        validate_record_relationships!(result, status:)
        result
      end

      def normalize_measurement!(result, value, field, status:)
        unit = text_value(value.fetch("unit", ""), { label: "Measurement unit" })
        source = text_value(value.fetch("source", ""), { label: "Measurement source" })
        measured_at = text_value(value.fetch("measured_at", ""), { label: "Measurement date" })
        raise ArgumentError, "Choose a supported measurement unit." unless (status == "draft" && unit.blank?) || field[:units].include?(unit)
        sources = field.fetch(:source_choices, WeightManagementQuestionnaire::SOURCES)
        raise ArgumentError, "Choose a supported measurement source." unless (status == "draft" && source.blank?) || sources.include?(source)
        raise ArgumentError, "Enter the actual measurement date." if measured_at.blank? && status != "draft"
        measured_at = scalar(measured_at, { label: "Measurement date", input_type: "date", allow_future: false })
        verification = value.fetch("verification", "unverified")
        verification = "unverified" if verification == ""
        raise ArgumentError, "Choose a supported verification state." unless WeightManagementQuestionnaire::VERIFICATION.include?(verification)
        result.merge!("unit" => unit, "source" => source, "measured_at" => measured_at, "verification" => verification)
        result["source_details"] = text_value(value["source_details"], field) if value.key?("source_details")
      end

      def validate_record_relationships!(entry, status:)
        if entry["confirmation"] == "confirmed" && status != "draft"
          unless %w[street city state postal_code].all? { |key| entry[key].present? }
            raise ArgumentError, "Complete the current physical address before confirming it."
          end
        end
        [%w[started_on ended_on], %w[started_month ended_month], %w[gap_started_on gap_ended_on]].each do |start_key, end_key|
          next if entry[start_key].blank? || entry[end_key].blank?
          raise ArgumentError, "The end cannot be before the start." if entry[end_key] < entry[start_key]
        end
        if entry["measurement_value"].present?
          if status != "draft"
            raise ArgumentError, "Record a measurement source, including unknown if needed." if entry["source"].blank?
            dated = %w[measured_at approximate_month approximate_year age].any? { |key| entry[key].present? }
            raise ArgumentError, "Record when the measurement was taken or choose an unknown date." unless dated || entry["measurement_date_state"] == "unknown"
          end
          if entry["measurement_date_state"] == "unknown" && entry["measured_at"].present?
            raise ArgumentError, "An unknown measurement date cannot also contain an exact date."
          end
          entry["verification"] = "unverified" if entry["verification"].blank?
          if entry["kind"] == "body_fat_percent" && entry["measurement_unit"].present?
            raise ArgumentError, "Body-fat percentage uses percent." unless entry["measurement_unit"] == "%"
            raise ArgumentError, "A percentage must be between 0 and 100." if BigDecimal(entry["measurement_value"]) > 100
          elsif %w[lean_mass fat_mass].include?(entry["kind"]) && entry["measurement_unit"].present?
            raise ArgumentError, "Body mass uses a weight unit." unless WeightManagementQuestionnaire::WEIGHT_UNITS.include?(entry["measurement_unit"])
          end
        end
        if entry["dose_certainty"] == "known" && entry["dose_value"].blank? && status != "draft"
          raise ArgumentError, "Enter the actual dose when dose certainty is known."
        end
        if entry["dose_certainty"] == "unknown" && entry["dose_value"].present?
          raise ArgumentError, "Keep an uncertain dose in the original dose description; do not assert a numeric dose."
        end
      end

      def scalar(value, field)
        text = text_value(value, field)
        return text if text.empty?
        if field[:choices] && !field[:choices].include?(text)
          raise ArgumentError, "Choose a listed answer for #{field[:label]}."
        end
        case field[:input_type]
        when "number"
          raise ArgumentError, "Enter a plain numeric value for #{field[:label]}." unless text.match?(/\A\d{1,9}(?:\.\d{1,6})?\z/)
          number = BigDecimal(text)
          raise ArgumentError, "Enter a whole number for #{field[:label]}." if field[:integer] && number.frac.nonzero?
          if (field[:min] && number < field[:min]) || (field[:max] && number > field[:max]) || (field[:positive] && !number.positive?)
            raise ArgumentError, "Enter a value within the displayed bounds for #{field[:label]}."
          end
          raise ArgumentError, "Historical years cannot be in the future." if field[:historical_year] && number > Current.business_time.year
        when "date", "month", "datetime-local", "time"
          validate_date!(text, field)
        end
        if field[:reference_kind] && !text.match?(/\A[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}\z/)
          raise ArgumentError, "Choose a valid #{field[:label]}."
        end
        if field[:format] == "us_postal" && !text.match?(/\A\d{5}(?:-\d{4})?\z/)
          raise ArgumentError, "Enter a five-digit ZIP code or ZIP+4."
        end
        text
      end

      def validate_date!(text, field)
        type = field[:input_type]
        case type
        when "time"
          raise ArgumentError unless text.match?(/\A(?:[01]\d|2[0-3]):[0-5]\d\z/)
        when "month"
          raise ArgumentError unless text.match?(/\A\d{4}-(?:0[1-9]|1[0-2])\z/) && text[0, 4].to_i.positive?
          raise ArgumentError if field[:allow_future] == false && text > Current.business_time.strftime("%Y-%m")
        when "date", "datetime-local"
          pattern = type == "date" ? /\A\d{4}-\d{2}-\d{2}\z/ : /\A\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d\z/
          raise ArgumentError unless text.match?(pattern) && text[0, 4].to_i.positive?
          parsed = Date.iso8601(text[0, 10])
          raise ArgumentError if field[:allow_future] == false && parsed > Current.business_time.to_date
          if type == "datetime-local" && field[:allow_future] == false
            raise ArgumentError if text > Current.business_time.strftime("%Y-%m-%dT%H:%M")
          end
        end
      rescue ArgumentError
        raise ArgumentError, "Enter a valid #{field[:label]}#{field[:allow_future] == false ? ' that is not in the future' : ''}."
      end

      def selections(value, field)
        unless value.is_a?(Array) && value.size <= MAX_SELECTIONS && value.all? { |item| item.is_a?(String) && field.fetch(:choices).include?(item) }
          raise ArgumentError, "Choose only listed options for #{field[:label]}."
        end
        raise ArgumentError, "Do not repeat a selection for #{field[:label]}." unless value.uniq.size == value.size
        if (value & EXCLUSIVE_CHOICES).any? && value.size > 1
          raise ArgumentError, "Choose none or unsure separately from other answers for #{field[:label]}."
        end
        value
      end

      def text_value(value, field)
        raise ArgumentError, "#{field[:label]} must be text." unless value.is_a?(String)
        raise ArgumentError, "Shorten #{field[:label]}." if value.length > field.fetch(:max_length, MAX_TEXT_LENGTH)
        raise ArgumentError, "Remove unsupported control characters from #{field[:label]}." if value.match?(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/)
        value.strip
      end

      def object(value, label)
        raise ArgumentError, "#{label} must be an object." unless value.is_a?(Hash)
        raise ArgumentError, "#{label} keys must be names." unless value.keys.all? { |key| key.is_a?(String) || key.is_a?(Symbol) }
        result = value.stringify_keys
        raise ArgumentError, "Do not repeat #{label.downcase} fields." unless result.size == value.size
        result
      end
    end
  end
end
