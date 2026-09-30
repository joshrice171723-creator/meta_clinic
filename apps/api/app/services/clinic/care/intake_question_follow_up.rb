module Clinic
  module Care
    # Deliberately recorded documentation, not a generated task or clinical decision.
    module IntakeQuestionFollowUp
      MAX_ENTRIES = 50
      MAX_TEXT_LENGTH = 600
      module_function

      def normalize(value, form_id:)
        raise ArgumentError, "Question follow-up must be an object." unless value.is_a?(Hash)
        raise ArgumentError, "Record follow-up for at most #{MAX_ENTRIES} questions." if value.size > MAX_ENTRIES
        ids = PrevisitIntake.fields_for_recorder(form_id, recorder: "staff").map { |field| field[:id] }
        unless value.keys.all? { |id| id.is_a?(String) && ids.include?(id) }
          raise ArgumentError, "Choose supported intake questions for follow-up."
        end
        value.to_h do |id, entry|
          unless entry.is_a?(Hash) && (entry.keys - %w[reason next_action rebind]).empty?
            raise ArgumentError, "Choose supported question follow-up details."
          end
          text = %w[reason next_action].to_h do |key|
            raw = entry[key]
            unless raw.is_a?(String) && raw.strip.present? && raw.length <= MAX_TEXT_LENGTH
              raise ArgumentError, "Question follow-up #{key.tr('_', ' ')} must contain 1–#{MAX_TEXT_LENGTH} characters."
            end
            [key, raw.strip]
          end
          rebind = entry.fetch("rebind", false)
          raise ArgumentError, "Follow-up context confirmation must be true or false." unless [true, false].include?(rebind)
          [id, text.merge("rebind" => rebind)]
        end
      end

      def attach!(payload:, prior:, entries:, member:, revision_version:)
        previous = prior&.fetch("question_follow_up", {}) || {}
        if entries.nil?
          payload["question_follow_up"] = previous.deep_dup
          return
        end
        definitions = PrevisitIntake.fields(payload.fetch("form_id")).index_by { |field| field[:id] }
        payload["question_follow_up"] = entries.to_h do |id, entry|
          old = previous[id]
          same = old && %w[reason next_action].all? { |key| old[key] == entry[key] }
          record = if same && !entry["rebind"]
            old.deep_dup
          else
            entry.except("rebind").merge(
              "question" => definitions.fetch(id).deep_stringify_keys,
              "source_answer" => payload.fetch("answers").fetch(id).deep_dup,
              "source_form_id" => payload.fetch("form_id"),
              "source_questionnaire_version" => payload.fetch("questionnaire_version"),
              "source_revision_version" => revision_version,
              "recorded_by_membership_id" => member.id,
              "recorded_at" => Current.business_time.iso8601(6)
            )
          end
          [id, record]
        end
      end

      def render(payload)
        payload.fetch("question_follow_up", {}).map do |id, entry|
          changed = entry["source_answer"] != payload.dig("answers", id)
          "Question follow-up — #{entry.dig('question', 'label') || id}\n" \
            "Reason: #{entry['reason']}\nNext action: #{entry['next_action']}\n" \
            "Recorded by membership #{entry['recorded_by_membership_id']} at #{entry['recorded_at']}; " \
            "source intake version #{entry['source_revision_version']}; " \
            "original answer state #{entry.dig('source_answer', 'state')}." \
            "#{changed ? ' Answer changed since this follow-up context was recorded.' : ''}"
        end
      end
    end
  end
end
