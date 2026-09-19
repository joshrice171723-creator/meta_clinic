module Clinic
  module Care
    # Immutable encrypted intake revisions link to work in the existing task
    # system; assignment and completion never become questionnaire booleans.
    module IntakeReview
      module_function

      CATEGORIES = %w[safety symptom medication evidence changed support clinical].freeze
      UNCERTAIN = %w[unknown not_asked declined].freeze

      def attach!(encoded:, previous:, practice:, patient:, encounter:, member:, chunks:, original_answers: {})
        payload = PrevisitIntake.decode(encoded)
        return encoded unless payload

        prior = previous && PrevisitIntake.decode(previous.encrypted_questionnaire)
        now = Current.business_time.iso8601(6)
        fields = PrevisitIntake.fields(payload.fetch("form_id"))
        previous_items = Array(prior&.fetch("review_items", []))
        payload["items"] = fields.to_h do |field|
          id = field.fetch(:id)
          answer = payload.fetch("answers")[id]
          old_answer = prior&.dig("answers", id)
          old_item = prior&.dig("items", id)
          same = old_answer == answer && old_item.is_a?(Hash)
          chunk = chunks.find { |entry| entry[:fields].include?(id) }
          confirmed = chunk && Array(payload["confirmed_chunks"]).include?(chunk[:index]) &&
            NurseWorkflow.field_visible?(field, payload.fetch("answers"), form_id: payload.fetch("form_id")) && answer&.fetch("state", "unanswered") != "unanswered"
          item = same ? old_item.deep_dup : {
            "question" => field.deep_stringify_keys,
            "questionnaire_version" => payload["questionnaire_version"],
            "original_response" => original_answers[id] || original_answers[id.to_sym] || answer,
            "source" => "staff_recorded",
            "recorded_at" => now,
            "recorded_by_membership_id" => member.id,
            "supersedes_revision_id" => old_answer.present? ? previous&.id : nil
          }
          item["confirmation"] = confirmed ? "staff_confirmed" : "unconfirmed"
          item["confirmed_at"] = confirmed ? (same && old_item["confirmed_at"] || now) : nil
          [id, item]
        end

        items = fields.filter_map do |field|
          id = field.fetch(:id)
          answer = payload.fetch("answers")[id]
          next unless NurseWorkflow.field_visible?(field, payload.fetch("answers"), form_id: payload.fetch("form_id"))

          old = previous_items.find { |entry| entry["question_id"] == id }
          changed = prior&.dig("answers", id).present? && prior.dig("answers", id) != answer
          category = review_category(field, answer)
          category ||= "changed" if changed && old
          next unless category

          digest = Digest::SHA256.hexdigest(JSON.generate(answer))
          task = old && Clinic::ClinicalTask.where(practice:, patient:, encounter:,
            id: old["task_id"], source_type: "encounter", source_id: encounter.id, task_kind: "intake").lock.first
          task = nil if task && !task.state.in?(Clinic::ClinicalTask::ACTIVE_STATES) && old["answer_digest"] != digest
          if task && task.state.in?(Clinic::ClinicalTask::ACTIVE_STATES) && old["answer_digest"] != digest
            task.touch
            TaskContinuity.record!(task, member, "intake_response_changed")
          end
          unless task
            task = Clinic::ClinicalTask.create!(practice:, patient:, encounter:, site: encounter.site,
              task_kind: "intake", state: "open", pool_code: category == "support" ? "front_desk" : "clinical",
              source_type: "encounter", source_id: encounter.id, recorded_by_membership: member)
            TaskContinuity.record!(task, member, "intake_review_created")
          end
          { "question_id" => id, "label" => field[:label], "category" => category,
            "task_id" => task.id, "answer_digest" => digest, "source_revision_version" => (previous&.version_number || 0) + 1,
            "reason" => changed ? "Answer changed; review the current response and previous version." : review_reason(category),
            "next_action" => category == "support" ? "Claim the support task and coordinate the requested help." :
              "Claim the review task, clarify the response, and record the outcome.",
            "recorded_at" => now }
        end
        # Hidden/corrected answers never silently close existing responsibility.
        retained = previous_items.reject { |old| items.any? { |item| item["task_id"] == old["task_id"] } }
        payload["review_items"] = (items + retained).uniq { |item| item["task_id"] }
        PrevisitIntake::PREFIX + JSON.generate(payload)
      end

      def review_category(field, answer)
        return if field[:id] == "instrument_status"
        return unless answer.is_a?(Hash) && answer["state"] != "unanswered"
        id = field[:id]
        category = field[:review_category]&.to_s
        category ||= "safety" if field[:chunk_id] == "reproductive_product_safety" ||
          %w[pregnancy_status pregnancy_plans breastfeeding_status product_safety_review].include?(id)
        category ||= "symptom" if field[:history_kind] == "symptom"
        category ||= "medication" if %w[medication allergy].include?(field[:history_kind])
        category = "clinical" if %w[mental_health_support procedures].include?(id)
        category ||= "support" if %w[barrier_support_route nutrition_support mental_health_support support_status].include?(id)
        category ||= "evidence" if %w[outside_records_state lab_context_state].include?(id)
        category ||= "changed" if %w[history family_history].include?(id)
        return unless CATEGORIES.include?(category)
        return category if UNCERTAIN.include?(answer["state"])
        return unless answer["state"] == "answered"
        return category if answer["entries"].present?
        values = Array(answer["values"]).presence || [answer["value"]]
        requested = Array(field[:review_values])
        return category if requested.any? && (values & requested).any?
        return if requested.any?
        clear = %w[no not_pregnant not_applicable none_reported none_requested adequate available reviewed received not_selected not_discussed]
        category unless values.all? { |value| value.blank? || clear.include?(value) }
      end

      def review_reason(category)
        {
          "safety" => "Product or reproductive information needs clinician clarification.",
          "symptom" => "Reported symptoms need the clinic's clinical review pathway.",
          "medication" => "Reconcile reported medication use or reaction details; do not infer doses.",
          "evidence" => "Confirm the source, date and availability of the referenced evidence.",
          "changed" => "Review reported history or a changed fact.",
          "support" => "A support preference or barrier needs coordination.",
          "clinical" => "Reported information needs the clinic's clinical review pathway."
        }.fetch(category)
      end

      def projection(intake, tasks)
        payload = intake && PrevisitIntake.decode(intake.encrypted_questionnaire)
        by_id = tasks.index_by(&:id)
        Array(payload&.fetch("review_items", [])).map do |item|
          task = by_id[item["task_id"]]
          item.merge("state" => task&.state || "unavailable", "pool_code" => task&.pool_code,
            "assigned_to_membership_id" => task&.assigned_to_membership_id,
            "resolution_code" => task&.resolution_code,
            "current_answer" => payload.dig("answers", item["question_id"]),
            "source" => payload.dig("items", item["question_id"]))
        end.sort_by { |item| [CATEGORIES.index(item["category"]) || 99, item["task_id"]] }
      end
    end
  end
end
