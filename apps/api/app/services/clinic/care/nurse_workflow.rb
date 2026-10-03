module Clinic
  module Care
    module NurseWorkflow
      module_function

      INTAKE_FIELDS = %i[status identity_state visit_reason_state history_state vitals_state].freeze
      REQUIRED_HISTORY_TOPICS = %w[allergies medications care_needs].freeze
      INTAKE_CHUNKS = [
        { index: 0, id: "today_visit", label: "Today’s visit",
          description: "Why the patient is here and what they want help with.",
          fields: %w[visit_reason symptoms goals changes].freeze },
        { index: 1, id: "patient_coordination", label: "Patient and coordination",
          description: "Confirm chart context and capture encounter-specific needs.",
          fields: %w[care_needs telehealth_location].freeze },
        { index: 2, id: "safety_history", label: "Safety and history",
          description: "Medicines, allergies, and relevant health history.",
          fields: %w[medications allergies history family_history history_changes change_details].freeze },
        { index: 3, id: "prior_approaches", label: "What has been tried",
          description: "Previous approaches, procedures, and barriers to the plan.",
          fields: %w[prior_approaches procedures barriers].freeze },
        { index: 4, id: "measurements", label: "Measurements and weight",
          description: "Record dated measurements and review calculated BMI.",
          fields: %w[height weight].freeze },
        { index: 5, id: "reproductive_product_safety", label: "Reproductive and product safety",
          description: "Record applicable reproductive context and route product-specific questions for review.",
          fields: %w[treatment_product_class pregnancy_status pregnancy_plans breastfeeding_status contraception_context product_safety_review].freeze },
        { index: 6, id: "nutrition_support", label: "Nutrition and sensitive support",
          description: "Capture food patterns and support context with explicit privacy and decline states.",
          fields: %w[nutrition_pattern beverage_pattern eating_concern nutrition_support mental_health_support substance_use_context instrument_status habits].freeze },
        { index: 7, id: "activity_sleep_barriers", label: "Activity, sleep, and barriers",
          description: "Record function, sleep, access, and support needs without a readiness score.",
          fields: %w[activity_capacity activity_pattern sleep_quality transportation_access food_access caregiving_support social_support barrier_support_route].freeze },
        { index: 8, id: "records_consent_admin", label: "Records, consent, and admin",
          description: "Track evidence sources, consent context, privacy, coverage, and disclosures separately.",
          fields: %w[outside_records_state lab_context_state treatment_consent_state telehealth_consent_state privacy_location_state coverage_context prior_authorization_state disclosure_state].freeze },
        { index: 9, id: "confirmation_clinician_review", label: "Confirmation and clinician review",
          description: "Confirm what was recorded and make unresolved ownership visible without implying clinical approval.",
          fields: %w[patient_confirmation_state unresolved_item_state review_owner].freeze },
        { index: 10, id: "follow_up_change", label: "Follow-up and change",
          description: "Capture longitudinal change, response, access, support, and patient questions.",
          fields: %w[follow_up_context change_since_last_visit treatment_response treatment_tolerability access_status support_status follow_up_plan_state next_contact_window follow_up_questions].freeze }
      ].map(&:freeze).freeze
      HANDOFF_ACTIONS = {
        "accept" => "accepted", "reject" => "rejected", "request_correction" => "correction_requested",
        "complete" => "completed", "cancel" => "cancelled"
      }.freeze
      TASK_ACTIONS = %w[claim assign accept_transfer reject_transfer dependencies start complete cancel reopen].freeze

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
          state: Clinic::ClinicalTask::ACTIVE_STATES)
          .group(:encounter_id).count
        encounters.to_h do |encounter|
          intake = intakes[encounter.id]
          handoff = handoffs[encounter.id]
          stage = if handoff&.state == "accepted"
            "clinician"
          elsif handoff&.state == "pending" && handoff.intake_revision_id == intake&.id
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
          .includes(:assigned_to_membership, :site, :events, dependencies: :prerequisite)
          .order(Arel.sql("CASE WHEN due_at IS NULL THEN 1 ELSE 0 END"), :due_at, :id).to_a
        task_projections = task_projections(practice:, tasks:)
        Clinic::AuditRecorder.record!(practice:, actor:, action_code: "nurse_workspace.read", outcome: :released,
          resource_version_ref: "patient/#{patient.id}:encounter/#{encounter.id}:intake/#{intake&.version_number || 0}")
        {
          schema_version: "nurse-workspace-v1",
          patient_id: patient.id,
          encounter_id: encounter.id,
          intake: intake && serialize_intake(intake),
          intake_comparison: intake_comparison(practice:, actor:, patient:, encounter:, intake:),
          questionnaire_form: { **PrevisitIntake.form_for(practice: practice, appointment: encounter.appointment, recorder: "staff",
            payload: intake && PrevisitIntake.decode(intake.encrypted_questionnaire)),
            chunks: chunks_for(form_id: PrevisitIntake.form_for(practice: practice, appointment: encounter.appointment, recorder: "staff",
              payload: intake && PrevisitIntake.decode(intake.encrypted_questionnaire))[:id]),
            medication_options: PrevisitIntake.medication_options(practice),
            medication_references: PrevisitIntake.medication_reference_options(practice) },
          handoff: handoff && serialize_handoff(handoff),
          tasks: tasks.map { |task| serialize_task(task, continuity: task_projections.fetch(task.id)) },
          review_items: IntakeReview.projection(intake, tasks),
          evidence_options: IntakeEvidence.options(practice:, actor:, patient:, encounter:),
          capabilities: {
            intake_write: allowed?(practice, actor, "intake.write", encounter),
            handoff_request: allowed?(practice, actor, "intake.write", encounter),
            handoff_respond: allowed?(practice, actor, "notes.write", encounter),
            tasks_write: allowed?(practice, actor, "encounters.write", encounter),
            observations_write: allowed?(practice, actor, "observations.write", encounter)
          }
        }
      end

      def revise_intake(practice:, actor:, patient:, encounter:, request_key:, expected_version:, attributes:,
        observation_ids:, history_review_ids:)
        authorize!(practice, actor, "intake.write", encounter)
        member = membership!(practice, actor)
        previous_intake = latest_intake(practice, encounter)
        form = PrevisitIntake.form_for(practice: practice, appointment: encounter.appointment, recorder: "staff",
          payload: previous_intake && PrevisitIntake.decode(previous_intake.encrypted_questionnaire))
        observations = observations_for(practice, patient, encounter, observation_ids)
        input = normalize_intake(attributes, form_id: form[:id], previous_intake: previous_intake, encounter:, observations:)
        PrevisitIntake.validate_medication_references!(input[:encrypted_questionnaire], practice:)
        raw = (attributes[:questionnaire] || attributes["questionnaire"]).to_h.stringify_keys
        question_follow_up = if raw.key?("question_follow_up")
          IntakeQuestionFollowUp.normalize(raw["question_follow_up"], form_id: form[:id])
        end
        prior_follow_up = previous_intake && PrevisitIntake.decode(previous_intake.encrypted_questionnaire)&.fetch("question_follow_up", {})
        if input.key?(:encrypted_questionnaire) && PrevisitIntake.decode(input[:encrypted_questionnaire]).nil? &&
          (question_follow_up.present? || (!raw.key?("question_follow_up") && prior_follow_up.present?))
          raise ArgumentError, "Save question follow-up with a structured intake draft."
        end
        history_reviews = history_reviews_for(practice, patient, encounter, history_review_ids)
        validate_intake_evidence!(input, observations, history_reviews)
        evidence = { observation_ids: observations.map(&:id).sort, history_review_ids: history_reviews.map(&:id).sort }
        payload = { patient_id: patient.id, encounter_id: encounter.id, expected_version:, intake: input, evidence:,
          evidence_keys: raw["evidence_keys"] }
        payload[:question_follow_up] = question_follow_up if raw.key?("question_follow_up")
        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "care.encounter_intake.revise", request_key:, resource: encounter,
          authorization_action: "intake.write", authorization: -> { authorize!(practice, actor, "intake.write", encounter) },
          payload:, result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { Clinic::EncounterIntakeRevision.find_by(practice:, id: receipt.resource_id) }
        ) do
          practice.lock!
          encounter.with_lock do
            current = latest_intake(practice, encounter, lock: true)
            stale!(current&.version_number || 0, expected_version, current || encounter)
            unless current
              portal_note = encounter.appointment && Clinic::PatientPortal::PrevisitNotes.latest(encounter.appointment)
              PrevisitIntake.require_new_form!(practice:, appointment: encounter.appointment, encounter:,
                existing_payload: portal_note && PrevisitIntake.decode(portal_note.encrypted_text))
            end
            saved_input = input.key?(:encrypted_questionnaire) ? input : input.merge(encrypted_questionnaire: current&.encrypted_questionnaire)
            if input.key?(:encrypted_questionnaire)
              questionnaire = PrevisitIntake.decode(input[:encrypted_questionnaire])
              if questionnaire
                prior_payload = current && PrevisitIntake.decode(current.encrypted_questionnaire)
                IntakeQuestionFollowUp.attach!(payload: questionnaire, prior: prior_payload,
                  entries: question_follow_up, member:, revision_version: (current&.version_number || 0) + 1)
                questionnaire["evidence_references"] = if raw.key?("evidence_keys")
                  IntakeEvidence.normalize(raw["evidence_keys"], practice:, actor:, patient:, encounter:)
                else
                  prior_payload&.fetch("evidence_references", []) || []
                end
              end
              encoded = questionnaire ? PrevisitIntake::PREFIX + JSON.generate(questionnaire) : input[:encrypted_questionnaire]
              saved_input = saved_input.merge(encrypted_questionnaire: IntakeReview.attach!(
                encoded:, previous: current, practice:, patient:, encounter:, member:,
                chunks: chunks_for(form_id: form[:id]),
                original_answers: raw.fetch("answers", {})))
            end
            revision = Clinic::EncounterIntakeRevision.create!(saved_input.merge(
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
        if encounter.appointment&.visit_modality != "video" && encounter.room_id.blank?
          raise ArgumentError, "Record the room before requesting clinician handoff."
        end
        raise ArgumentError, "Complete the intake before requesting handoff." unless intake.status == "ready_for_handoff"
        payload = { patient_id: patient.id, encounter_id: encounter.id, intake_revision_id: intake.id }
        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "care.encounter_handoff.request", request_key:, resource: intake,
          authorization_action: "intake.write", authorization: -> { authorize!(practice, actor, "intake.write", encounter) },
          payload:, result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { Clinic::EncounterHandoff.find_by(practice:, id: receipt.resource_id) }
        ) do
          encounter.with_lock do
            if encounter.appointment&.visit_modality != "video" && encounter.room_id.blank?
              raise ArgumentError, "Record the room before requesting clinician handoff."
            end
            if latest_intake(practice, encounter)&.id != intake.id
              raise ArgumentError, "Intake has changed. Request handoff using the latest saved revision."
            end
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
          handoff.encounter.with_lock do
            handoff = Clinic::EncounterHandoff.lock.find(handoff.id)
            stale!(handoff.lock_version, expected_version, handoff)
            valid_handoff_transition!(handoff.state, next_state)
            if next_state.in?(%w[accepted completed]) && latest_intake(practice, handoff.encounter)&.id != handoff.intake_revision_id
              raise ArgumentError, "Intake has changed. Cancel this handoff and request one for the latest saved revision."
            end
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

      def transition_task(practice:, actor:, task:, action:, expected_version:, request_key:, resolution_code: nil,
        assignee_membership_id: nil, dependency_ids: nil)
        authorize!(practice, actor, "encounters.write", task)
        if action.to_s == "complete" && task.source_type == "encounter" && task.task_kind == "intake" && task.pool_code == "clinical"
          authorize!(practice, actor, "notes.write", task)
        end
        member = membership!(practice, actor)
        action = action.to_s
        raise ArgumentError, "The task action is unsupported." unless TASK_ACTIONS.include?(action)
        assignee = action == "assign" ? eligible_assignee!(practice, actor, task, assignee_membership_id) : nil
        payload = { task_id: task.id, action:, expected_version:, resolution_code:, assignee_membership_id: assignee&.id, dependency_ids: }
        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "operations.clinical_task.#{action}", request_key:, resource: task,
          authorization_action: "encounters.write", authorization: -> { authorize!(practice, actor, "encounters.write", task) },
          payload:, result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { Clinic::ClinicalTask.find_by(practice:, id: receipt.resource_id) }
        ) do
          practice.lock! if action == "dependencies"
          task = Clinic::ClinicalTask.where(practice:).lock.find(task.id)
          stale!(task.lock_version, expected_version, task)
          if action == "dependencies"
            raise ArgumentError, "Only active work can change prerequisites." unless task.state.in?(Clinic::ClinicalTask::ACTIVE_STATES)
            TaskContinuity.replace_dependencies!(task, dependency_ids, actor:)
          else
            transition_task!(task, action, member, resolution_code, assignee)
          end
          TaskContinuity.record!(task, member, action)
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
          recorded_by_membership_id: intake.recorded_by_membership_id,
          questionnaire: PrevisitIntake.decode(intake.encrypted_questionnaire),
          questionnaire_text: intake.encrypted_questionnaire.present? ? PrevisitIntake.render(intake.encrypted_questionnaire) : nil,
          questionnaire_form: PrevisitIntake.form_for(practice: intake.practice, recorder: "staff",
            payload: PrevisitIntake.decode(intake.encrypted_questionnaire))
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

      def serialize_task(task, continuity: TaskContinuity.projection(task))
        {
          id: task.id, patient_id: task.patient_id, encounter_id: task.encounter_id, site_id: task.site_id,
          task_kind: task.task_kind, state: task.state, pool_code: task.pool_code,
          assigned_to_membership_id: task.assigned_to_membership_id, due_at: task.due_at&.iso8601(6),
          source_type: task.source_type, source_id: task.source_id, resolution_code: task.resolution_code,
          source_kind: task.source_kind,
          version: task.lock_version, updated_at: task.updated_at.iso8601(6)
        }.merge(continuity)
      end

      def task_projections(practice:, tasks:)
        site_ids = tasks.filter_map(&:site_id).uniq
        members = Clinic::Membership.where(practice:).active.includes(:user).to_a
        abilities = members.to_h { |member| [member.id, Ability.new(member.user, practice:)] }
        eligible_by_site = site_ids.to_h do |site_id|
          [site_id, abilities.filter_map do |membership_id, ability|
            membership_id if ability.allowed_permission?("encounters.write", site: site_id)
          end]
        end
        tasks.to_h do |task|
          [task.id, TaskContinuity.projection(task,
            eligible_membership_ids: eligible_by_site.fetch(task.site_id, []))]
        end
      end

      def latest_intake(practice, encounter, lock: false)
        scope = Clinic::EncounterIntakeRevision.where(practice:, encounter:).includes(:observation_refs, :history_refs)
          .order(version_number: :desc, id: :desc)
        scope = scope.lock if lock
        scope.first
      end

      def prior_readable_intake(practice:, actor:, patient:, encounter:, intake:)
        prior_encounter = Clinic::EncounterIntakeRevision.where(practice:, patient:).where.not(encounter:)
          .includes(:encounter).order(recorded_at: :desc, id: :desc).detect do |candidate|
            allowed?(practice, actor, "patients.read", candidate.encounter)
          end
        return [ prior_encounter, "previous_encounter" ] if prior_encounter

        prior_revision = intake && Clinic::EncounterIntakeRevision.where(practice:, patient:, encounter:)
          .where.not(id: intake.id).order(version_number: :desc, id: :desc).first
        [ prior_revision, prior_revision && "earlier_revision" ]
      end

      def normalize_intake(attributes, form_id: PrevisitIntake::FORM_ID, previous_intake: nil, encounter: nil, observations: [])
        input = attributes.to_h.symbolize_keys.slice(*INTAKE_FIELDS)
        missing = INTAKE_FIELDS - input.keys
        raise ArgumentError, "Missing intake field: #{missing.first}." if missing.any?
        input.transform_values! { |value| value.to_s }
        questionnaire = attributes[:questionnaire] || attributes["questionnaire"]
        if questionnaire
          questionnaire = questionnaire.to_h.stringify_keys
          input[:encrypted_questionnaire] = PrevisitIntake.encode(text: questionnaire.fetch("text", ""),
            answers: questionnaire.fetch("answers", {}), status: questionnaire.fetch("status", "draft"),
            attested: questionnaire["confirmed"] == true, recorder: "staff", form_id: form_id,
            confirmed_chunks: questionnaire.fetch("confirmed_chunks", []))
          normalized = PrevisitIntake.decode(input[:encrypted_questionnaire])
          validate_confirmed_chunks!(questionnaire, form_id:, previous_intake:, encounter:, observations:,
            answers: normalized&.fetch("answers", {}) || {})
        end
        input
      end

      def intake_comparison(practice:, actor:, patient:, encounter:, intake:)
        prior, source_kind = prior_readable_intake(practice:, actor:, patient:, encounter:, intake:)
        return { source: nil, items: [] } unless intake || prior

        current_payload = intake && PrevisitIntake.decode(intake.encrypted_questionnaire) || {}
        prior_payload = prior && PrevisitIntake.decode(prior.encrypted_questionnaire) || {}
        current_form = current_payload["form_id"] || PrevisitIntake::FORM_ID
        prior_form = prior_payload["form_id"] || current_form
        definitions = (PrevisitIntake.fields(current_form) + PrevisitIntake.fields(prior_form)).index_by { |field| field[:id] }
        ids = (current_payload.fetch("answers", {}).keys + prior_payload.fetch("answers", {}).keys).uniq
        items = ids.filter_map do |id|
          field = definitions[id]
          next unless field
          current = current_payload.dig("answers", id)
          previous = prior_payload.dig("answers", id)
          next if current.blank? && previous.blank?
          { id:, label: field[:label], previous: PrevisitIntake.answer_text(previous, field:),
            current: PrevisitIntake.answer_text(current, field:), changed: current != previous }
        end
        { source: prior && { kind: source_kind, encounter_id: prior.encounter_id, version: prior.version_number,
          recorded_at: prior.recorded_at.iso8601(6) }, items: }
      end

      def validate_confirmed_chunks!(questionnaire, form_id:, previous_intake:, encounter:, answers:, observations: [])
        definitions = chunks_for(form_id:)
        chunks = normalize_chunk_indexes(questionnaire.fetch("confirmed_chunks", []))
        if chunks.any? { |index| index >= definitions.length }
          raise ArgumentError, "The intake group is outside the supported workflow."
        end
        previous_questionnaire = previous_intake && PrevisitIntake.decode(previous_intake.encrypted_questionnaire)
        previous_chunks = normalize_chunk_indexes(previous_questionnaire&.fetch("confirmed_chunks", []) || [])
        previous_chunks = [] if previous_questionnaire && previous_questionnaire["questionnaire_version"] != PrevisitIntake::QUESTIONNAIRE_VERSION
        if (chunks - previous_chunks).any? { |index| (0...index).any? { |prior| !previous_chunks.include?(prior) } }
          raise ArgumentError, "Save the previous intake groups before unlocking the next group."
        end
        if (chunks - previous_chunks).length > 1
          raise ArgumentError, "Review one intake section at a time."
        end
        confirmed = questionnaire.fetch("status", "draft") == "submitted" && questionnaire["confirmed"] == true
        if (chunks - previous_chunks).any? && !confirmed
          raise ArgumentError, "Confirm the current question group before opening the next."
        end

        previous_answers = previous_questionnaire&.fetch("answers", {}) || {}
        changed_chunks = previous_chunks.select do |index|
          definitions.fetch(index).fetch(:fields).any? do |id|
            next false unless answers.key?(id)
            field = PrevisitIntake.fields(form_id).find { |item| item[:id] == id }
            old = PrevisitIntake.normalize_answer(previous_answers[id] || "", field, status: "draft")
            old != answers[id]
          end
        end
        if (changed_chunks & chunks).any? && !confirmed
          raise ArgumentError, "Changed answers require reviewing the affected section again. Save a draft to reopen it."
        end
        if ((chunks - previous_chunks) | (changed_chunks & chunks)).length > 1
          raise ArgumentError, "Review one intake section at a time."
        end
        evidence_index = definitions.index { |entry| entry[:id] == "records_consent_admin" }
        previous_evidence = Array(previous_questionnaire&.fetch("evidence_references", [])).map { |item| item["key"] }.sort
        if evidence_index && questionnaire.key?("evidence_keys") &&
            Array(questionnaire["evidence_keys"]).sort != previous_evidence &&
            chunks.include?(evidence_index) && !confirmed
          raise ArgumentError, "Changed evidence requires reviewing the records section again."
        end

        fields = chunks.flat_map { |index| visible_fields(form_id:, chunk_index: index, answers:, encounter:) }
        # Encounter observations supply measurement evidence without asking staff
        # to copy those values into a second questionnaire field.
        fields -= %w[height weight].select do |id|
          observations.any? { |item| item.code == "vital-#{id}" && item.numeric_value.present? }
        end
        fields -= [ "telehealth_location" ] unless encounter&.appointment&.visit_modality == "video"
        unanswered = fields.select { |field_id| answer_state(answers[field_id] || answers[field_id.to_sym]) == "unanswered" }
        if unanswered.any?
          raise ArgumentError, "Answer or explicitly resolve each question in the group before confirming."
        end
      end

      def normalize_chunk_indexes(value)
        Array(value).map { |item| Integer(item.to_s, 10) }.tap do |indexes|
          raise ArgumentError, "Confirmed intake groups must be non-negative integers." if indexes.any?(&:negative?)
          raise ArgumentError, "Confirmed intake groups must not repeat." unless indexes.uniq.length == indexes.length
        end.sort
      rescue ArgumentError, TypeError
        raise ArgumentError, "Confirmed intake groups must be non-negative integers."
      end

      def answer_state(answer)
        return "unanswered" if answer.blank?
        return answer.to_s.strip.present? ? "answered" : "unanswered" unless answer.is_a?(Hash)

        answer.stringify_keys.fetch("state", "unanswered").to_s
      end

      def visible_fields(form_id:, chunk_index:, answers:, encounter:)
        supported = PrevisitIntake.fields_for_recorder(form_id, recorder: "staff").select do |field|
          chunks_for(form_id:).fetch(chunk_index).fetch(:fields).include?(field[:id]) &&
            !%w[extended clinician].include?(field[:requiredness])
        end
        supported.select do |field|
          field_visible?(field, answers, form_id:) &&
            (!%w[telehealth_location telehealth_physical_location].include?(field[:id]) || encounter&.appointment&.visit_modality == "video")
        end.map { |field| field[:id] }
      end

      def chunks_for(form_id:)
        fields = PrevisitIntake.fields(form_id)
        if form_id.start_with?("behavioral-health-")
          return BehavioralHealthQuestionnaire::CHUNKS.map.with_index do |chunk, index|
            shared = INTAKE_CHUNKS.find { |item| item[:id] == chunk[:id] }.fetch(:fields)
            ids = fields.select { |field| field[:chunk_id] == chunk[:id] || shared.include?(field[:id]) }.map { |field| field[:id] }
            chunk.merge(index:, fields: ids)
          end
        end
        definitions = INTAKE_CHUNKS.map do |chunk|
          ids = fields.select { |field| field[:chunk_id] == chunk[:id] || chunk[:fields].include?(field[:id]) }.map { |field| field[:id] }
          chunk.merge(fields: ids)
        end
        definitions = definitions.reject { |chunk| chunk[:fields].empty? } if form_id.include?("follow-up")
        definitions.map.with_index { |chunk, index| chunk.merge(index:) }
      end

      def field_visible?(field, answers, form_id: PrevisitIntake::FORM_ID)
        PrevisitIntake.visible?(field, answers, form_id:)
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
        if assignee_id
          member = Clinic::Membership.active.includes(:user).find_by!(practice:, id: assignee_id)
          unless member.user&.active? && Ability.new(member.user, practice:).allowed_permission?("encounters.write", site: encounter.site)
            raise Clinic::Authorization::Denied
          end
        end
        due_at = value[:due_at].present? ? Time.iso8601(value[:due_at].to_s) : nil
        { task_kind: value.fetch(:task_kind).to_s, pool_code: value.fetch(:pool_code).to_s,
          assigned_to_membership_id: assignee_id, due_at:, source_id: nil }
      rescue KeyError, ArgumentError
        raise ArgumentError, "Task kind, pool, assignee, or due time is invalid for this encounter."
      end

      def transition_task!(task, action, member, resolution_code, assignee = nil)
        if action.in?(%w[start complete])
          TaskContinuity.ensure_unblocked!(task)
        end
        if action.in?(%w[complete cancel reopen]) && TaskContinuity.source_managed?(task)
          raise ArgumentError, "Update this work in its source workspace; a task action cannot complete its source."
        end
        case action
        when "claim"
          available = task.assigned_to_membership_id.nil? || task.assigned_to_membership_id == member.id ||
            !TaskContinuity.eligible?(task.assigned_to_membership, task)
          raise ArgumentError, "This task already has an available owner." unless available && task.state.in?(Clinic::ClinicalTask::ACTIVE_STATES)
          if task.state.in?(%w[claimed in_progress]) && TaskContinuity.eligible?(task.assigned_to_membership, task)
            raise ArgumentError, "This task is already claimed. Continue its current action."
          end
          task.update!(state: task.state == "on_hold" ? "on_hold" : "claimed", assigned_to_membership: member,
            pending_assignee_membership: nil)
        when "start"
          raise ArgumentError, "Claim this task before starting it." unless task.state == "claimed" && task.assigned_to_membership_id == member.id
          task.update!(state: "in_progress")
        when "assign"
          raise ArgumentError, "Only open or active tasks can be assigned." unless task.state.in?(Clinic::ClinicalTask::ACTIVE_STATES)
          raise ArgumentError, "The selected staff member already owns this work." if task.assigned_to_membership_id == assignee.id
          task.update!(pending_assignee_membership: assignee)
        when "accept_transfer", "reject_transfer"
          raise ArgumentError, "This transfer is assigned to another staff member." unless task.pending_assignee_membership_id == member.id
          raise ArgumentError, "Only active work can be transferred." unless task.state.in?(Clinic::ClinicalTask::ACTIVE_STATES)
          raise Clinic::Authorization::Denied unless TaskContinuity.eligible?(member, task)
          attributes = { pending_assignee_membership: nil }
          if action == "accept_transfer"
            attributes.merge!(assigned_to_membership: member, state: task.state == "on_hold" ? "on_hold" : "claimed")
          end
          task.update!(attributes)
        when "complete"
          raise ArgumentError, "Claim this task before completing it." unless task.state.in?(%w[claimed in_progress]) && task.assigned_to_membership_id == member.id
          resolution = resolution_code.to_s
          raise ArgumentError, "Select a supported task resolution." unless Clinic::ClinicalTask::RESOLUTIONS.include?(resolution)
          task.update!(state: "completed", pending_assignee_membership: nil, resolution_code: resolution, completed_by_membership: member,
            completed_at: Current.business_time)
        when "cancel"
          raise ArgumentError, "A completed task cannot be cancelled." if task.state == "completed"
          task.update!(state: "cancelled", assigned_to_membership: nil, pending_assignee_membership: nil)
        when "reopen"
          raise ArgumentError, "Only a cancelled task can be reopened." unless task.state == "cancelled"
          task.update!(state: "open", assigned_to_membership: nil)
        end
      end

      def eligible_assignee!(practice, actor, task, membership_id)
        id = Integer(membership_id.to_s, 10)
        membership = practice.memberships.active.includes(:user).find_by(id: id)
        raise ArgumentError, "The selected assignee is not active in this clinic." unless membership&.user&.active?
        unless Ability.new(membership.user, practice: practice).allowed_permission?("encounters.write", site: task.site)
          raise Clinic::Authorization::Denied
        end
        membership
      rescue ArgumentError
        raise ArgumentError, "Select an active staff member who can work this encounter."
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
