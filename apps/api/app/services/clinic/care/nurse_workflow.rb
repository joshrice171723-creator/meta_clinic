module Clinic
  module Care
    module NurseWorkflow
      module_function

      INTAKE_FIELDS = %i[status identity_state visit_reason_state history_state vitals_state].freeze
      REQUIRED_HISTORY_TOPICS = %w[allergies medications care_needs].freeze
      HANDOFF_ACTIONS = {
        "accept" => "accepted", "reject" => "rejected", "request_correction" => "correction_requested",
        "complete" => "completed", "cancel" => "cancelled"
      }.freeze
      TASK_ACTIONS = %w[claim start complete cancel reopen].freeze

      def board_snapshot(encounters)
        ids = encounters.map(&:id)
        practice_ids = encounters.map(&:practice_id).uniq
        return {} if ids.empty?
        raise ArgumentError, "Tracking-board workflow rows must belong to one practice." unless practice_ids.one?

        intakes = Clinic::EncounterIntakeRevision.where(practice_id: practice_ids.first, encounter_id: ids)
          .order(encounter_id: :asc, version_number: :desc, id: :desc).each_with_object({}) do |record, latest|
            latest[record.encounter_id] ||= record
          end
        handoffs = Clinic::EncounterHandoff.where(practice_id: practice_ids.first, encounter_id: ids)
          .order(encounter_id: :asc, id: :desc).each_with_object({}) do |record, latest|
            latest[record.encounter_id] ||= record
          end
        task_counts = Clinic::ClinicalTask.where(practice_id: practice_ids.first, encounter_id: ids,
          state: %w[open claimed in_progress])
          .group(:encounter_id).count
        encounters.to_h do |encounter|
          intake = intakes[encounter.id]
          handoff = handoffs[encounter.id]
          stage = if handoff&.state == "accepted"
            "clinician"
          elsif handoff&.state == "pending"
            "ready"
          elsif intake
            "intake"
          else
            "waiting"
          end
          [ encounter.id, { stage:, intake_status: intake&.status || "not_recorded",
            handoff_state: handoff&.state || "not_recorded", open_task_count: task_counts.fetch(encounter.id, 0) } ]
        end
      end

      def workspace(practice:, actor:, patient:, encounter:)
        authorize_read!(practice, actor, encounter)
        intake = latest_intake(practice, encounter)
        handoff = Clinic::EncounterHandoff.where(practice:, patient:, encounter:).includes(:events).order(id: :desc).first
        tasks = Clinic::ClinicalTask.where(practice:, patient:, encounter:)
          .includes(:assigned_to_membership).order(Arel.sql("CASE WHEN due_at IS NULL THEN 1 ELSE 0 END"), :due_at, :id)
        Clinic::AuditRecorder.record!(practice:, actor:, action_code: "nurse_workspace.read", outcome: :released,
          resource_version_ref: "patient/#{patient.id}:encounter/#{encounter.id}:intake/#{intake&.version_number || 0}")
        {
          schema_version: "nurse-workspace-v1",
          patient_id: patient.id,
          encounter_id: encounter.id,
          intake: intake && serialize_intake(intake),
          handoff: handoff && serialize_handoff(handoff),
          tasks: tasks.map { |task| serialize_task(task) },
          capabilities: {
            intake_write: allowed?(practice, actor, "intake.write", encounter),
            handoff_request: allowed?(practice, actor, "intake.write", encounter),
            handoff_respond: allowed?(practice, actor, "notes.write", encounter),
            tasks_write: allowed?(practice, actor, "encounters.write", encounter)
          }
        }
      end

      def revise_intake(practice:, actor:, patient:, encounter:, request_key:, expected_version:, attributes:,
        observation_ids:, history_review_ids:)
        authorize!(practice, actor, "intake.write", encounter)
        member = membership!(practice, actor)
        input = normalize_intake(attributes)
        observations = observations_for(practice, patient, encounter, observation_ids)
        history_reviews = history_reviews_for(practice, patient, encounter, history_review_ids)
        validate_intake_evidence!(input, observations, history_reviews)
        evidence = { observation_ids: observations.map(&:id).sort, history_review_ids: history_reviews.map(&:id).sort }
        payload = { patient_id: patient.id, encounter_id: encounter.id, expected_version:, intake: input, evidence: }
        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "care.encounter_intake.revise", request_key:, resource: encounter,
          authorization_action: "intake.write", authorization: -> { authorize!(practice, actor, "intake.write", encounter) },
          payload:, result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { Clinic::EncounterIntakeRevision.find_by(practice:, id: receipt.resource_id) }
        ) do
          encounter.with_lock do
            current = latest_intake(practice, encounter, lock: true)
            stale!(current&.version_number || 0, expected_version, current || encounter)
            revision = Clinic::EncounterIntakeRevision.create!(input.merge(
              practice:, patient:, encounter:, version_number: (current&.version_number || 0) + 1,
              recorded_by_membership: member, recorded_at: Current.business_time, request_key:,
              content_digest: Digest::SHA256.hexdigest(payload.to_json)
            ))
            observations.each do |observation|
              Clinic::EncounterIntakeObservationRef.create!(practice:, patient:, encounter:, intake_revision: revision, observation:)
            end
            history_reviews.each do |history_review|
              Clinic::EncounterIntakeHistoryRef.create!(practice:, patient:, encounter:, intake_revision: revision, history_review:)
            end
            revision
          end
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def request_handoff(practice:, actor:, patient:, encounter:, intake_revision_id:, request_key:)
        authorize!(practice, actor, "intake.write", encounter)
        member = membership!(practice, actor)
        intake = Clinic::EncounterIntakeRevision.where(practice:, patient:, encounter:).find(intake_revision_id)
        raise ArgumentError, "Complete the intake before requesting handoff." unless intake.status == "ready_for_handoff"
        payload = { patient_id: patient.id, encounter_id: encounter.id, intake_revision_id: intake.id }
        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "care.encounter_handoff.request", request_key:, resource: intake,
          authorization_action: "intake.write", authorization: -> { authorize!(practice, actor, "intake.write", encounter) },
          payload:, result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { Clinic::EncounterHandoff.find_by(practice:, id: receipt.resource_id) }
        ) do
          encounter.with_lock do
            if Clinic::EncounterHandoff.where(practice:, encounter:, state: %w[pending accepted correction_requested]).exists?
              raise ArgumentError, "This encounter already has an active handoff."
            end
            now = Current.business_time
            handoff = Clinic::EncounterHandoff.create!(practice:, patient:, encounter:, intake_revision: intake,
              state: "pending", requested_by_membership: member, requested_at: now)
            append_handoff_event!(handoff:, member:, event_code: "requested", request_key:, version_number: 1)
            Clinic::ClinicalTask.create!(practice:, patient:, encounter:, site: encounter.site, task_kind: "handoff",
              state: "open", pool_code: "clinical", source_type: "handoff", source_id: handoff.id,
              recorded_by_membership: member)
            handoff
          end
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def transition_handoff(practice:, actor:, handoff:, action:, expected_version:, request_key:)
        action = action.to_s
        next_state = HANDOFF_ACTIONS[action] || raise(ArgumentError, "The handoff action is unsupported.")
        permission = action == "cancel" ? "intake.write" : "notes.write"
        authorize!(practice, actor, permission, handoff.encounter)
        member = membership!(practice, actor)
        if action != "cancel" && handoff.requested_by_membership_id == member.id
          raise ArgumentError, "A different authorized clinician must respond to this handoff."
        end
        payload = { handoff_id: handoff.id, action:, expected_version: }
        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "care.encounter_handoff.#{action}", request_key:, resource: handoff,
          authorization_action: permission, authorization: -> { authorize!(practice, actor, permission, handoff.encounter) },
          payload:, result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { Clinic::EncounterHandoff.find_by(practice:, id: receipt.resource_id) }
        ) do
          handoff = Clinic::EncounterHandoff.lock.find(handoff.id)
          stale!(handoff.lock_version, expected_version, handoff)
          valid_handoff_transition!(handoff.state, next_state)
          now = Current.business_time
          attributes = { state: next_state, responded_at: now }
          attributes[:accepted_by_membership] = member if next_state.in?(%w[accepted completed])
          attributes[:accepted_by_membership] = handoff.accepted_by_membership if next_state == "completed"
          handoff.update!(attributes)
          append_handoff_event!(handoff:, member:, event_code: next_state, request_key:,
            version_number: handoff.events.maximum(:version_number).to_i + 1)
          if next_state == "accepted"
            complete_source_tasks!(handoff, member, "completed")
          elsif next_state.in?(%w[rejected correction_requested cancelled])
            complete_source_tasks!(handoff, member, "superseded")
          end
          handoff
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def create_task(practice:, actor:, patient:, encounter:, request_key:, attributes:)
        authorize!(practice, actor, "encounters.write", encounter)
        member = membership!(practice, actor)
        input = normalize_task(attributes, practice, encounter)
        payload = { patient_id: patient.id, encounter_id: encounter.id, task: input }
        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "operations.clinical_task.create", request_key:, resource: encounter,
          authorization_action: "encounters.write", authorization: -> { authorize!(practice, actor, "encounters.write", encounter) },
          payload:, result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { Clinic::ClinicalTask.find_by(practice:, id: receipt.resource_id) }
        ) do
          Clinic::ClinicalTask.create!(input.merge(practice:, patient:, encounter:, site: encounter.site,
            state: "open", source_type: "manual", recorded_by_membership: member))
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def transition_task(practice:, actor:, task:, action:, expected_version:, request_key:, resolution_code: nil)
        authorize!(practice, actor, "encounters.write", task.encounter)
        member = membership!(practice, actor)
        action = action.to_s
        raise ArgumentError, "The task action is unsupported." unless TASK_ACTIONS.include?(action)
        payload = { task_id: task.id, action:, expected_version:, resolution_code: }
        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "operations.clinical_task.#{action}", request_key:, resource: task,
          authorization_action: "encounters.write", authorization: -> { authorize!(practice, actor, "encounters.write", task.encounter) },
          payload:, result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { Clinic::ClinicalTask.find_by(practice:, id: receipt.resource_id) }
        ) do
          task = Clinic::ClinicalTask.lock.find(task.id)
          stale!(task.lock_version, expected_version, task)
          transition_task!(task, action, member, resolution_code)
          task
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def serialize_intake(intake)
        intake.association(:observation_refs).load_target unless intake.association(:observation_refs).loaded?
        intake.association(:history_refs).load_target unless intake.association(:history_refs).loaded?
        {
          id: intake.id, patient_id: intake.patient_id, encounter_id: intake.encounter_id,
          version: intake.version_number, status: intake.status, identity_state: intake.identity_state,
          visit_reason_state: intake.visit_reason_state, history_state: intake.history_state,
          vitals_state: intake.vitals_state, observation_ids: intake.observation_refs.map(&:observation_id),
          history_review_ids: intake.history_refs.map(&:history_review_id), recorded_at: intake.recorded_at.iso8601(6),
          recorded_by_membership_id: intake.recorded_by_membership_id
        }
      end

      def serialize_handoff(handoff)
        {
          id: handoff.id, patient_id: handoff.patient_id, encounter_id: handoff.encounter_id,
          intake_revision_id: handoff.intake_revision_id, state: handoff.state,
          requested_by_membership_id: handoff.requested_by_membership_id,
          accepted_by_membership_id: handoff.accepted_by_membership_id,
          requested_at: handoff.requested_at.iso8601(6), responded_at: handoff.responded_at&.iso8601(6),
          version: handoff.lock_version
        }
      end

      def serialize_task(task)
        {
          id: task.id, patient_id: task.patient_id, encounter_id: task.encounter_id, site_id: task.site_id,
          task_kind: task.task_kind, state: task.state, pool_code: task.pool_code,
          assigned_to_membership_id: task.assigned_to_membership_id, due_at: task.due_at&.iso8601(6),
          source_type: task.source_type, source_id: task.source_id, resolution_code: task.resolution_code,
          source_kind: task.source_kind,
          version: task.lock_version, updated_at: task.updated_at.iso8601(6)
        }
      end

      def latest_intake(practice, encounter, lock: false)
        scope = Clinic::EncounterIntakeRevision.where(practice:, encounter:).includes(:observation_refs, :history_refs)
          .order(version_number: :desc, id: :desc)
        scope = scope.lock if lock
        scope.first
      end

      def normalize_intake(attributes)
        input = attributes.to_h.symbolize_keys.slice(*INTAKE_FIELDS)
        missing = INTAKE_FIELDS - input.keys
        raise ArgumentError, "Missing intake field: #{missing.first}." if missing.any?
        input.transform_values! { |value| value.to_s }
        input
      end

      def validate_intake_evidence!(input, observations, history_reviews)
        if input[:vitals_state] == "recorded" && observations.empty?
          raise ArgumentError, "Recorded vitals must reference observations from this encounter."
        end
        if input[:history_state] == "reviewed" && history_reviews.empty?
          raise ArgumentError, "Reviewed history must reference the reviews used for this intake."
        end
        if input[:history_state] == "reviewed" &&
            (REQUIRED_HISTORY_TOPICS - history_reviews.map(&:topic).uniq).any?
          raise ArgumentError, "Reviewed history must link allergy, medication, and care-needs reviews."
        end
        return unless input[:status] == "ready_for_handoff"

        ready = input[:identity_state] == "confirmed" && input[:visit_reason_state] == "confirmed" &&
          input[:history_state] == "reviewed" && input[:vitals_state].in?(%w[recorded not_applicable])
        raise ArgumentError, "Resolve or explicitly record each intake section before requesting handoff." unless ready
      end

      def observations_for(practice, patient, encounter, ids)
        identifiers = Array(ids).map { |id| Integer(id.to_s, 10) }.uniq
        records = Clinic::Care::Observation.where(practice:, patient:, encounter:, id: identifiers).to_a
        raise ArgumentError, "One or more intake observations do not belong to this encounter." unless records.length == identifiers.length
        records
      rescue ArgumentError
        raise ArgumentError, "Observation identifiers must be positive integers from this encounter."
      end

      def history_reviews_for(practice, patient, encounter, ids)
        identifiers = Array(ids).map { |id| Integer(id.to_s, 10) }.uniq
        records = Clinic::Care::PatientHistoryReview.where(practice:, patient:, encounter:, id: identifiers).to_a
        raise ArgumentError, "One or more history reviews do not belong to this encounter." unless records.length == identifiers.length
        records
      rescue ArgumentError
        raise ArgumentError, "History review identifiers must be positive integers from this encounter."
      end

      def normalize_task(attributes, practice, encounter)
        value = attributes.to_h.symbolize_keys
        assignee_id = value[:assigned_to_membership_id].presence && Integer(value[:assigned_to_membership_id].to_s, 10)
        Clinic::Membership.active.find_by!(practice:, id: assignee_id) if assignee_id
        due_at = value[:due_at].present? ? Time.iso8601(value[:due_at].to_s) : nil
        { task_kind: value.fetch(:task_kind).to_s, pool_code: value.fetch(:pool_code).to_s,
          assigned_to_membership_id: assignee_id, due_at:, source_id: nil }
      rescue KeyError, ArgumentError
        raise ArgumentError, "Task kind, pool, assignee, or due time is invalid for this encounter."
      end

      def transition_task!(task, action, member, resolution_code)
        case action
        when "claim"
          raise ArgumentError, "Only an open task can be claimed." unless task.state == "open"
          task.update!(state: "claimed", assigned_to_membership: member)
        when "start"
          raise ArgumentError, "Claim this task before starting it." unless task.state == "claimed" && task.assigned_to_membership_id == member.id
          task.update!(state: "in_progress")
        when "complete"
          raise ArgumentError, "Claim this task before completing it." unless task.state.in?(%w[claimed in_progress]) && task.assigned_to_membership_id == member.id
          resolution = resolution_code.to_s
          raise ArgumentError, "Select a supported task resolution." unless Clinic::ClinicalTask::RESOLUTIONS.include?(resolution)
          task.update!(state: "completed", resolution_code: resolution, completed_by_membership: member,
            completed_at: Current.business_time)
        when "cancel"
          raise ArgumentError, "A completed task cannot be cancelled." if task.state == "completed"
          task.update!(state: "cancelled", assigned_to_membership: nil)
        when "reopen"
          raise ArgumentError, "Only a cancelled task can be reopened." unless task.state == "cancelled"
          task.update!(state: "open", assigned_to_membership: nil)
        end
      end

      def append_handoff_event!(handoff:, member:, event_code:, request_key:, version_number:)
        payload = { handoff_id: handoff.id, event_code:, version_number: }
        Clinic::EncounterHandoffEvent.create!(practice: handoff.practice, patient_id: handoff.patient_id,
          encounter_id: handoff.encounter_id, handoff:, version_number:, event_code:, actor_membership: member,
          recorded_at: Current.business_time, request_key:, content_digest: Digest::SHA256.hexdigest(payload.to_json))
      end

      def complete_source_tasks!(handoff, member, resolution)
        Clinic::ClinicalTask.where(practice_id: handoff.practice_id, source_type: "handoff", source_id: handoff.id)
          .where.not(state: %w[completed cancelled]).lock.each do |task|
          task.update!(state: "completed", assigned_to_membership: task.assigned_to_membership || member,
            resolution_code: resolution, completed_by_membership: member, completed_at: Current.business_time)
        end
      end

      def valid_handoff_transition!(current, target)
        allowed = {
          "pending" => %w[accepted rejected correction_requested cancelled],
          "accepted" => %w[completed cancelled],
          "correction_requested" => %w[cancelled],
          "rejected" => [], "completed" => [], "cancelled" => []
        }
        raise ArgumentError, "That handoff transition is not allowed." unless allowed.fetch(current).include?(target)
      end

      def stale!(current, expected, record)
        expected = Integer(expected.to_s, 10)
        raise ActiveRecord::StaleObjectError.new(record, "update") unless current == expected
      rescue ArgumentError
        raise ActiveRecord::StaleObjectError.new(record, "update")
      end

      def membership!(practice, actor)
        Clinic::Membership.active.find_by!(practice:, user_id: actor.id)
      end

      def authorize_read!(practice, actor, encounter)
        authorize!(practice, actor, "patients.read", encounter)
      end

      def authorize!(practice, actor, action, encounter)
        Clinic::Authorization.authorize!(actor:, practice:, action:, site: encounter&.site)
      end

      def allowed?(practice, actor, action, encounter)
        Clinic::Authorization.authorize!(actor:, practice:, action:, site: encounter&.site)
        true
      rescue Clinic::Authorization::Denied
        false
      end
    end
  end
end
