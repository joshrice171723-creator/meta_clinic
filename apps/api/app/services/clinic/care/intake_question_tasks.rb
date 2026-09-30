require "digest"

module Clinic
  module Care
    # Explicitly chosen manual work; ordinary answer states never generate tasks.
    module IntakeQuestionTasks
      EVENT_ACTION = "intake_question_linked".freeze
      module_function

      def index(practice:, actor:, patient:, encounter:)
        authorize_read!(practice, actor, encounter)
        revisions = Clinic::EncounterIntakeRevision.where(practice:, patient:, encounter:)
          .order(version_number: :desc).to_a
        tasks = Clinic::ClinicalTask.where(practice:, patient:, encounter:)
          .includes(:assigned_to_membership, :site, :events, dependencies: :prerequisite).order(:id).to_a
        versions = revisions.index_by(&:id)
        sources = revisions.flat_map do |revision|
          payload = PrevisitIntake.decode(revision.encrypted_questionnaire) || {}
          payload.fetch("question_follow_up", {}).map { |id, entry| source_projection(revision, id, entry:) }
        end
        links = tasks.flat_map do |task|
          task.events.select { |event| event.action == EVENT_ACTION }.map do |event|
            project(event, revision: versions[event.snapshot["intake_revision_id"]])
          end
        end
        continuity = NurseWorkflow.task_projections(practice:, tasks:)
        Clinic::AuditRecorder.record!(practice:, actor:, action_code: "intake_question_tasks.read", outcome: :released,
          resource_version_ref: "patient/#{patient.id}:encounter/#{encounter.id}")
        member = Clinic::Membership.active.find_by!(practice:, user: actor)
        candidates = if NurseWorkflow.allowed?(practice, actor, "encounters.write", encounter)
          Clinic::Operations::EncounterFollowUps.eligible_assignees(encounter)
        else
          []
        end
        { patient_id: patient.id, encounter_id: encounter.id, actor_membership_id: member.id,
          eligible_assignees: candidates, sources:, links:,
          tasks: tasks.map { |task| NurseWorkflow.serialize_task(task, continuity: continuity.fetch(task.id)) } }
      end

      def link(practice:, actor:, patient:, encounter:, request_key:, intake_revision_id:, question_id:,
        task_id: nil, expected_task_version: nil, task_kind: nil, pool_code: nil)
        authorize_read!(practice, actor, encounter)
        authorize_write!(practice, actor, encounter)
        revision = Clinic::EncounterIntakeRevision.where(practice:, patient:, encounter:).find(intake_revision_id)
        source_projection(revision, question_id) # Must already be deliberately recorded, never inferred from an answer.
        if task_id
          raise ArgumentError, "An existing task link must include its expected version." if expected_task_version.nil?
          raise ArgumentError, "Choose either an existing task or a new task definition." if task_kind.present? || pool_code.present?
        else
          raise ArgumentError, "A new task must not include an existing task version." unless expected_task_version.nil?
          unless Clinic::ClinicalTask::KINDS.include?(task_kind) && Clinic::ClinicalTask::POOLS.include?(pool_code)
            raise ArgumentError, "Choose a supported task kind and team."
          end
        end
        payload = { patient_id: patient.id, encounter_id: encounter.id, intake_revision_id: revision.id,
          question_id:, task_id:, expected_task_version:, task_kind:, pool_code: }
        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "operations.intake_question_task.link", request_key:, resource: encounter,
          authorization_action: "encounters.write", authorization: -> {
            authorize_read!(practice, actor, encounter)
            authorize_write!(practice, actor, encounter)
          }, payload:, result_resource: ->(event) { event },
          resource_resolver: ->(practice:, receipt:) {
            Clinic::ClinicalTaskEvent.joins(:task).where(practice:, action: EVENT_ACTION,
              clinic_clinical_tasks: { practice_id: practice.id, patient_id: patient.id, encounter_id: encounter.id })
              .find_by(id: receipt.resource_id)
          }
        ) do
          task = if task_id
            Clinic::ClinicalTask.where(practice:, patient:, encounter:).lock.find(task_id)
          else
            # The idempotency namespace is actor/key-wide: use a distinct deterministic child key.
            NurseWorkflow.create_task(practice:, actor:, patient:, encounter:,
              request_key: "question-task-create:#{Digest::SHA256.hexdigest(request_key)}",
              attributes: { task_kind:, pool_code: })
          end
          raise ArgumentError, "Link only a deliberately created manual encounter task." unless task.source_type == "manual"
          if task_id && task.lock_version != expected_task_version
            raise ActiveRecord::StaleObjectError.new(task, "update")
          end
          member = Clinic::Membership.active.find_by!(practice:, user: actor)
          task.touch
          event = task.events.create!(practice:, actor_membership: member, action: EVENT_ACTION,
            task_version: task.lock_version, recorded_at: Current.business_time,
            snapshot: { "intake_revision_id" => revision.id, "question_id" => question_id, "request_key" => request_key })
          Clinic::AuditRecorder.record!(practice:, actor:, action_code: "intake_question_tasks.link", outcome: :committed,
            resource_version_ref: "Clinic::ClinicalTaskEvent/#{event.id}:intake/#{revision.id}:task/#{task.id}")
          event
        end
        event = outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
        { patient_id: patient.id, encounter_id: encounter.id,
          task: NurseWorkflow.serialize_task(event.task.reload), link: project(event, revision:) }
      end

      def source_projection(revision, question_id, entry: nil)
        unless entry
          payload = PrevisitIntake.decode(revision.encrypted_questionnaire) || {}
          entry = payload.fetch("question_follow_up", {})[question_id]
        end
        unless entry.is_a?(Hash) && entry["reason"].present? && entry["next_action"].present?
          raise ArgumentError, "Save a reason and next action for this question on the selected intake revision first."
        end
        { intake_revision_id: revision.id, intake_version: revision.version_number,
          question_id:, question_label: entry.dig("question", "label") || question_id,
          reason: entry.fetch("reason"), next_action: entry.fetch("next_action"),
          source_revision_version: entry["source_revision_version"],
          source_answer_state: entry.dig("source_answer", "state") || "unavailable", source_available: true,
          source_answer: entry["source_answer"], source_question: entry["question"],
          source_form_id: entry["source_form_id"], source_questionnaire_version: entry["source_questionnaire_version"],
          source_recorded_by_membership_id: entry["recorded_by_membership_id"], source_recorded_at: entry["recorded_at"] }
      end

      def project(event, revision:)
        reference = event.snapshot
        source = if revision
          source_projection(revision, reference.fetch("question_id"))
        else
          { intake_revision_id: reference.fetch("intake_revision_id"), intake_version: nil,
            question_id: reference.fetch("question_id"), question_label: reference.fetch("question_id"),
            reason: "", next_action: "", source_revision_version: nil, source_answer_state: "unavailable", source_available: false,
            source_answer: nil, source_question: nil, source_form_id: nil, source_questionnaire_version: nil,
            source_recorded_by_membership_id: nil, source_recorded_at: nil }
        end
        source.merge(id: event.id, task_id: event.task_id, request_key: reference.fetch("request_key"),
          recorded_by_membership_id: event.actor_membership_id, recorded_at: event.recorded_at.iso8601(6))
      end

      def authorize_read!(practice, actor, encounter)
        Clinic::Authorization.authorize!(practice:, actor:, action: "patients.read", site: encounter.site)
      end

      def authorize_write!(practice, actor, encounter)
        Clinic::Authorization.authorize!(practice:, actor:, action: "encounters.write", site: encounter.site)
      end
    end
  end
end
