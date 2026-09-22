module Clinic
  module Care
    # Answers are encounter documentation. Only deliberately assigned work
    # belongs in the task queue; retain the history of legacy generated work.
    module IntakeReview
      module_function

      CATEGORIES = %w[safety symptom medication evidence changed support clinical].freeze

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

        retire_unclaimed!(practice:, actor: member.user, patient:, encounter:)
        items = previous_items.filter_map do |old|
          task = Clinic::ClinicalTask.where(practice:, patient:, encounter:,
            id: old["task_id"], source_type: "encounter", source_id: encounter.id,
            task_kind: "intake", state: Clinic::ClinicalTask::ACTIVE_STATES).lock.first
          next unless task

          answer = payload.fetch("answers")[old["question_id"]]
          digest = Digest::SHA256.hexdigest(JSON.generate(answer))
          if old["answer_digest"] != digest
            task.touch
            TaskContinuity.record!(task, member, "intake_response_changed")
          end
          old.merge("answer_digest" => digest,
            "source_revision_version" => (previous&.version_number || 0) + 1,
            "reason" => old["answer_digest"] != digest ? "Answer changed; review the updated intake." : old["reason"])
        end
        payload["review_items"] = items
        PrevisitIntake::PREFIX + JSON.generate(payload)
      end

      def retire_unclaimed!(practice:, actor:, patient:, encounter:)
        NurseWorkflow.authorize!(practice, actor, "intake.write", encounter)
        raise ArgumentError, "Encounter must belong to the patient and practice." unless
          encounter.patient_id == patient.id && patient.practice_id == practice.id && encounter.practice_id == practice.id
        member = NurseWorkflow.membership!(practice, actor)
        retired = []
        encounter.with_lock do
          Clinic::ClinicalTask.where(practice:, patient:, encounter:, task_kind: "intake",
            source_type: "encounter", source_id: encounter.id, state: "open",
            assigned_to_membership_id: nil, pending_assignee_membership_id: nil).lock.each do |task|
            actions = task.events.pluck(:action)
            next unless actions.include?("intake_review_created") &&
              (actions - %w[intake_review_created intake_response_changed]).empty?
            next if task.dependencies.exists? || Clinic::ClinicalTaskDependency.where(practice:, prerequisite_id: task.id).exists?

            task.update!(state: "completed", resolution_code: "superseded",
              completed_by_membership: member, completed_at: Current.business_time)
            TaskContinuity.record!(task, member, "intake_documentation_superseded")
            retired << task.id
          end
        end
        retired
      end

      def projection(intake, tasks)
        payload = intake && PrevisitIntake.decode(intake.encrypted_questionnaire)
        by_id = tasks.index_by(&:id)
        Array(payload&.fetch("review_items", [])).filter_map do |item|
          task = by_id[item["task_id"]]
          next unless task&.state.in?(Clinic::ClinicalTask::ACTIVE_STATES)
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
