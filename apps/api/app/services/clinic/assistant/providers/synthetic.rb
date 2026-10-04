require "date"

module Clinic
  module Assistant
    module Providers
      class Synthetic
        def call(input)
          text = input.fetch(:request_text)
          date = text[/\b\d{4}-\d{2}-\d{2}\b/]
          current_date = Date.iso8601(input.fetch(:current_date))
          date ||= current_date.iso8601 if text.match?(/\btoday\b/i)
          date ||= (current_date + 1).iso8601 if text.match?(/\btomorrow\b/i)
          time = text[/\b(?:[01]\d|2[0-3]):[0-5]\d\b/]
          duration = text[/\b(\d{1,3})\s*(?:minutes?|mins?)\b/i, 1]&.to_i
          return { status: "clarify", message: "What date and time would you prefer?" } unless date && time

          {
            status: "intent",
            intent: { date:, time:, duration_minutes: duration }
          }
        end
      end
    end
  end
end
