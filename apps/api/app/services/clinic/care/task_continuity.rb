module Clinic
  module Care
    module TaskContinuity
      module_function

      def source_managed?(task)
        task.source_type.in?(%w[order handoff lab_follow_up])
      end

      def eligible?(membership, task)
        membership&.active? && membership.user&.active? &&
          membership.practice_id == task.practice_id &&
          Ability.new(membership.user, practice: task.practice).allowed_permission?("encounters.write", site: task.site)
      end

      def source_missing?(task)
        model = case task.source_type
        when "order"
          task.source_kind == "medication_request" ? Clinic::Care::MedicationRequestRevision : Clinic::Care::ServiceRequestRevision
        when "handoff" then Clinic::EncounterHandoff
        when "lab_follow_up"
          return false if Clinic::Care::LabReportAction.exists?(practice_id: task.practice_id,
            id: task.source_id, clinical_task_id: task.id, kind: "recollection_requested")
          Clinic::Care::LabResultFollowUpContactAttempt
        end
        if task.source_type == "lab_follow_up"
          !model.exists?(practice_id: task.practice_id, clinical_task_id: task.id, id: task.source_id)
        else
          model && !model.exists?(practice_id: task.practice_id, patient_id: task.patient_id, id: task.source_id)
        end
      end

      def projection(task, eligible_membership_ids: nil)
        dependencies = if task.association(:dependencies).loaded?
          task.dependencies
        else
          task.dependencies.includes(:prerequisite)
        end
        prerequisites = dependencies.map(&:prerequisite)
        waiting = prerequisites.reject { |item| item.state == "completed" && item.resolution_code == "completed" }
        if eligible_membership_ids
          owner_unavailable = task.assigned_to_membership_id.present? && !eligible_membership_ids.include?(task.assigned_to_membership_id)
          candidates_present = eligible_membership_ids.any?
        else
          owner_unavailable = task.assigned_to_membership_id.present? && !eligible?(task.assigned_to_membership, task)
          candidates_present = task.practice.memberships.active.includes(:user).any? { |member| eligible?(member, task) }
        end
        exception = if !candidates_present
          "No eligible coverage is configured. Assign an authorized team to this work."
        elsif owner_unavailable
          "The assigned owner is unavailable. Eligible coverage can claim this work."
        end
        {
          pending_assignee_membership_id: task.pending_assignee_membership_id,
          dependency_ids: prerequisites.map(&:id), waiting_on_task_ids: waiting.map(&:id),
          waiting_reason: source_missing?(task) ? "The source record is unavailable. Reconcile its reference before proceeding." :
            task.state == "on_hold" ? "The source order is on hold. Review it in its workspace." :
            (waiting.any? ? "Waiting for prerequisite work: #{waiting.map(&:id).join(', ')}." : nil),
          assignment_exception: exception, owner_unavailable:,
          source_managed: source_managed?(task),
          history: (task.association(:events).loaded? ? task.events.sort_by(&:id) : task.events.order(:id)).map { |event| {
            id: event.id, action: event.action, actor_membership_id: event.actor_membership_id,
            task_version: event.task_version, recorded_at: event.recorded_at.iso8601(6), snapshot: event.snapshot
          } }
        }
      end

      def ensure_unblocked!(task)
        raise ArgumentError, "The task source is unavailable. Reconcile its reference before proceeding." if source_missing?(task)
        raise ArgumentError, "Resume this work in its source workspace before proceeding." if task.state == "on_hold"
        unresolved = task.dependencies.includes(:prerequisite).any? do |edge|
          edge.prerequisite.state != "completed" || edge.prerequisite.resolution_code != "completed"
        end
        raise ArgumentError, "Resolve the linked prerequisite work before starting or completing this task." if unresolved
      end

      def replace_dependencies!(task, ids, actor:)
        raise ArgumentError, "Provide the complete prerequisite list, including an empty list to clear it." unless ids.is_a?(Array)
        identifiers = Array(ids).map { |id| Integer(id.to_s, 10) }.uniq.sort
        raise ArgumentError, "Select at most 50 prerequisites." if identifiers.length > 50
        records = Clinic::ClinicalTask.where(practice_id: task.practice_id, patient_id: task.patient_id, id: identifiers).to_a
        raise ArgumentError, "Every prerequisite must belong to this patient and clinic." unless records.length == identifiers.length
        records.each do |record|
          Clinic::Authorization.authorize!(practice: task.practice, actor:, action: "encounters.write", site: record.site)
        end
        edges = Clinic::ClinicalTaskDependency.where(practice_id: task.practice_id).pluck(:task_id, :prerequisite_id)
        graph = edges.reject { |from, _to| from == task.id }.group_by(&:first).transform_values { |values| values.map(&:last) }
        graph[task.id] = identifiers
        pending = identifiers.dup
        visited = []
        until pending.empty?
          id = pending.pop
          raise ArgumentError, "This dependency would create a cycle." if id == task.id
          next if visited.include?(id)
          visited << id
          pending.concat(graph.fetch(id, []))
        end
        task.dependencies.where.not(prerequisite_id: identifiers).destroy_all
        identifiers.each do |id|
          task.dependencies.find_or_create_by!(practice_id: task.practice_id, prerequisite_id: id)
        end
        task.touch
      end

      def record!(task, member, action)
        task.events.create!(practice_id: task.practice_id, actor_membership: member, action:,
          task_version: task.lock_version, recorded_at: Current.business_time, snapshot: {
            state: task.state, pool_code: task.pool_code, assigned_to_membership_id: task.assigned_to_membership_id,
            pending_assignee_membership_id: task.pending_assignee_membership_id,
            source_type: task.source_type, source_kind: task.source_kind, source_id: task.source_id,
            dependency_ids: task.dependencies.order(:prerequisite_id).pluck(:prerequisite_id)
          })
      end
    end
  end
end
