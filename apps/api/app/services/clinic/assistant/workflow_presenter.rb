module Clinic
  module Assistant
    class WorkflowPresenter
      MAX_SECTIONS = 12
      MAX_FIELDS = 60
      MAX_ROWS = 100
      MAX_TEXT = 4_000

      def self.present!(result)
        value = result.respond_to?(:deep_stringify_keys) ? result.deep_stringify_keys : {}
        sections = Array(value["sections"]).first(MAX_SECTIONS).map do |section|
          section = section.deep_stringify_keys
          fields = Array(section["fields"]).first(MAX_FIELDS).map do |field|
            field = field.deep_stringify_keys
            { label: safe_text(field["label"], maximum: 160), value: safe_value(field["value"]) }
          end
          columns = Array(section["columns"]).first(MAX_FIELDS).map do |column|
            column = column.deep_stringify_keys
            { key: safe_text(column["key"], maximum: 100), label: safe_text(column["label"], maximum: 160) }
          end
          rows = Array(section["rows"]).first(MAX_ROWS).map do |row|
            next {} unless row.is_a?(Hash)
            row.deep_stringify_keys.slice(*columns.map { |column| column[:key] }).transform_values { |item| safe_value(item) }
          end
          { title: safe_text(section["title"], maximum: 160), fields:, columns:, rows: }.compact
        end
        payload = {
          status: "result", title: safe_text(value["title"], maximum: 160), sections:,
          source_path: safe_path(value["source_path"]), receipt_id: safe_text(value["receipt_id"], maximum: 80).presence
        }.compact
        raise ArgumentError, "The workflow returned no presentable result." if payload[:title].blank? || sections.empty?

        payload
      end

      def self.preview(definition:, inputs:, context:)
        fields = definition.fetch("fields").index_by { |field| field.fetch("key") }
        values = inputs.filter_map do |key, value|
          field = fields[key]
          next unless field

          label = field.fetch("label", key.humanize)
          display = case field.fetch("type")
          when "record"
            value.is_a?(Hash) ? value["label"] : nil
          when "select"
            Array(field["options"]).find { |option| option.fetch("value").to_s == value.to_s }&.fetch("label") || value
          when "boolean"
            value ? "Yes" : "No"
          when "array"
            Array(value).map { |item| safe_value(item) }.join(", ")
          else value
          end
          { label: safe_text(label, maximum: 160), value: safe_text(display, maximum: MAX_TEXT) } if display.present?
        end
        values.unshift({ label: "Patient", value: safe_text(context.patient.display_name, maximum: 160) }) if context.patient
        values.unshift({ label: "Location", value: safe_text(context.site.name.presence || context.site.code, maximum: 160) })
        values
      end

      def self.safe_message(value)
        text = safe_text(value, maximum: 500)
        text.presence || "Please describe the clinic task you want help with."
      end

      def self.preview_entries(value)
        Array(value).first(MAX_FIELDS).filter_map do |entry|
          next unless entry.is_a?(Hash)
          row = entry.deep_stringify_keys
          label = safe_text(row["label"], maximum: 160)
          display = safe_text(row["value"], maximum: MAX_TEXT)
          { label:, value: display } if label.present? && display.present?
        end
      end

      def self.safe_text(value, maximum: MAX_TEXT)
        return "" if value.nil?
        value.to_s.encode("UTF-8", invalid: :replace, undef: :replace, replace: "")
          .gsub(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/, "").strip.first(maximum)
      end

      def self.safe_value(value)
        case value
        when nil, true, false, Numeric then value
        when Date, Time, DateTime then value.iso8601
        when String then safe_text(value)
        else safe_text(value.to_s)
        end
      end

      def self.safe_path(value)
        path = value.to_s
        return if path.blank? || !path.start_with?("/") || path.start_with?("//")
        return if path.match?(/[\r\n]/) || path.include?("\\")
        return unless path.start_with?("/clinic/", "/demo/", "/schedule", "/patients")

        path.first(500)
      end

      private_class_method :safe_value, :safe_path
    end
  end
end
