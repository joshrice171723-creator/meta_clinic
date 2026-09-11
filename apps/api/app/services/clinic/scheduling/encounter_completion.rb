module Clinic
  module Scheduling
    module EncounterCompletion
      module_function

      def show(practice:, actor:, encounter:)
        authorize_read!(practice, actor, encounter)
        review = EncounterCompletionReview.find_by(practice_id: practice.id, encounter_id: encounter.id)
        payload = {
          schema_version: "encounter-completion-v1",
          patient_id: encounter.patient_id,
          encounter_id: encounter.id,
          completion_review: review && serialize(review),
          evidence: evidence_snapshot(encounter),
          options: {
            disposition_codes: EncounterCompletionReview::DISPOSITIONS,
            instructions_statuses: EncounterCompletionReview::INSTRUCTIONS_STATUSES,
            education_statuses: EncounterCompletionReview::EDUCATION_STATUSES
          },
          can_complete: encounter.status == "open" && encounter.ended_at.nil? &&
            Ability.new(actor, practice:).allowed_permission?("encounters.write", site: encounter.site)
        }
        AuditRecorder.record!(practice:, actor:, action_code: "encounter_completion.read", outcome: :released,
          resource_version_ref: "encounter/#{encounter.id}:completion/#{review&.id || 'none'}")
        payload
      end

      def create!(encounter:, actor:, request_key:, attributes:)
        practice = encounter.practice
        authorize_read!(practice, actor, encounter)
        Authorization.authorize!(practice:, actor:, action: "encounters.write", site: encounter.site)
        member = practice.memberships.active.find_by(user_id: actor.id) ||
          raise(Idempotency::InvalidRequest, "An active clinic membership is required.")
        input = normalize(attributes)
        snapshot = evidence_snapshot(encounter, lock: true)
        follow_up = snapshot.fetch(:follow_up)
        raise ArgumentError, "Record the follow-up disposition before completing the encounter." unless follow_up
        unless follow_up.fetch(:id) == input.fetch(:follow_up_id) &&
          follow_up.fetch(:version) == input.fetch(:follow_up_version) &&
          follow_up.fetch(:status) == input.fetch(:expected_follow_up_state)
          raise ActiveRecord::StaleObjectError.new(encounter, "completion follow-up")
        end
        compare_ids!(input.fetch(:expected_education_event_ids), snapshot.fetch(:education_events).pluck(:id),
          "Patient education changed. Review the current education evidence before completing the encounter.")
        compare_values!(input.fetch(:expected_open_task_versions),
          snapshot.fetch(:open_tasks).map { |task| "#{task.fetch('id')}:#{task.fetch('version')}" },
          "Open work changed. Review the current task ownership before completing the encounter.")
        raise ArgumentError, "Review the unfinished work before completing the encounter." unless input.fetch(:open_work_reviewed)

        instruction = resolve_instruction!(snapshot.fetch(:signed_instruction), input)
        education_ids = input.fetch(:education_status) == "recorded" ? snapshot.fetch(:education_events).pluck(:id) : []
        if input.fetch(:education_status) == "recorded" && education_ids.empty?
          raise ArgumentError, "No patient education evidence is recorded for this encounter."
        end
        if input.fetch(:education_status) != "recorded" && snapshot.fetch(:education_events).any?
          raise ArgumentError, "Patient education is recorded for this encounter. Select recorded education evidence."
        end

        EncounterCompletionReview.create!(
          practice:, patient_id: encounter.patient_id, encounter:, follow_up_id: follow_up.fetch(:id),
          follow_up_version: follow_up.fetch(:version), follow_up_state: follow_up.fetch(:status),
          instruction_note_id: instruction&.fetch(:note_id),
          instruction_note_revision_id: instruction&.fetch(:revision_id),
          disposition_code: input.fetch(:disposition_code), instructions_status: input.fetch(:instructions_status),
          education_status: input.fetch(:education_status), education_event_ids: education_ids,
          open_work_snapshot: snapshot.fetch(:open_tasks), exception_note: input.fetch(:exception_note),
          recorded_by_membership: member, recorded_at: Current.business_time, request_key:
        )
      end

      def serialize(review)
        {
          id: review.id, patient_id: review.patient_id, encounter_id: review.encounter_id,
          disposition_code: review.disposition_code, instructions_status: review.instructions_status,
          education_status: review.education_status, follow_up_id: review.follow_up_id,
          follow_up_version: review.follow_up_version, follow_up_state: review.follow_up_state,
          instruction_note_revision_id: review.instruction_note_revision_id,
          education_event_ids: review.education_event_ids, open_work_snapshot: review.open_work_snapshot,
          exception_note: review.exception_note, recorded_by_membership_id: review.recorded_by_membership_id,
          recorded_at: review.recorded_at.iso8601(6)
        }
      end

      def evidence_snapshot(encounter, lock: false)
        scope = lock ? EncounterFollowUp.lock : EncounterFollowUp
        follow_up = scope.find_by(practice_id: encounter.practice_id, encounter_id: encounter.id)
        education_scope = Clinic::Care::PatientEducationEvent.where(
          practice_id: encounter.practice_id, patient_id: encounter.patient_id, encounter_id: encounter.id
        ).order(:id)
        education_scope = education_scope.lock if lock
        task_scope = ClinicalTask.where(
          practice_id: encounter.practice_id, patient_id: encounter.patient_id, encounter_id: encounter.id,
          state: %w[open claimed in_progress]
        ).order(:id)
        task_scope = task_scope.lock if lock
        education_events = education_scope.to_a.map do |event|
          {
            id: event.id, topic_title: event.topic_title, teach_back_status: event.teach_back_status,
            follow_up_needed: event.follow_up_needed, recorded_at: event.recorded_at.iso8601(6)
          }
        end
        open_tasks = task_scope.to_a.map { |task| task_snapshot(task) }
        {
          follow_up: follow_up_snapshot(follow_up, lock:),
          signed_instruction: signed_instruction(encounter, lock:),
          education_events: education_events,
          open_tasks: open_tasks,
          checkout: checkout_state(encounter)
        }
      end
      private_class_method :evidence_snapshot

      def follow_up_snapshot(follow_up, lock:)
        return unless follow_up

        appointment = if follow_up.follow_up_appointment_id
          scope = lock ? Clinic::Appointment.lock : Clinic::Appointment
          scope.find_by(practice_id: follow_up.practice_id, id: follow_up.follow_up_appointment_id)
        end
        effective_state = if follow_up.state == "arranged" && !appointment&.status&.in?(%w[scheduled confirmed])
          "needed"
        else
          follow_up.state
        end
        {
          id: follow_up.id, status: effective_state, recorded_status: follow_up.state,
          version: follow_up.lock_version, due_at: follow_up.due_at&.iso8601(6),
          assigned_to_membership_id: follow_up.assigned_to_membership_id
        }
      end
      private_class_method :follow_up_snapshot

      def signed_instruction(encounter, lock:)
        scope = encounter.notes.where(note_kind: "soap")
        scope = scope.lock if lock
        note = scope.first
        return unless note

        note.revisions.joins(:signatures).distinct.order(revision_no: :desc, id: :desc).each do |revision|
          body = Clinic::Care::SoapNotePayload.load!(revision.encrypted_body)
          next if body[:patient_instructions].blank?

          signature = revision.signatures.order(signed_at: :desc, id: :desc).first
          return {
            note_id: note.id, revision_id: revision.id, revision_no: revision.revision_no,
            signed_at: signature&.signed_at&.iso8601(6)
          }
        end
        nil
      end
      private_class_method :signed_instruction

      def checkout_state(encounter)
        invoice = Clinic::Invoice.where(practice_id: encounter.practice_id, encounter_id: encounter.id)
          .where.not(status: "void").order(id: :desc).first
        return { status: "in_progress", invoice_id: invoice.id } if invoice
        return { status: "queued", invoice_id: nil } if encounter.status == "completed" && encounter.ended_at.present?

        { status: "pending_completion", invoice_id: nil }
      end
      private_class_method :checkout_state

      def task_snapshot(task)
        {
          "id" => task.id, "version" => task.lock_version, "task_kind" => task.task_kind, "state" => task.state,
          "pool_code" => task.pool_code, "assigned_to_membership_id" => task.assigned_to_membership_id,
          "due_at" => task.due_at&.iso8601(6)
        }
      end
      private_class_method :task_snapshot

      def resolve_instruction!(available, input)
        if input.fetch(:instructions_status) == "provided"
          unless available && available.fetch(:revision_id) == input.fetch(:instruction_note_revision_id)
            raise ActiveRecord::StaleObjectError.new(Clinic::EncounterNoteRevision.new, "patient instructions")
          end
          available
        elsif input.fetch(:instruction_note_revision_id)
          raise ArgumentError, "Instruction evidence is allowed only when signed instructions were provided."
        end
      end
      private_class_method :resolve_instruction!

      def compare_ids!(submitted, current, message)
        compare_values!(submitted, current, message)
      end
      private_class_method :compare_ids!

      def compare_values!(submitted, current, message)
        raise ActiveRecord::StaleObjectError.new(ClinicalTask.new, message) unless submitted.sort == current.sort
      end
      private_class_method :compare_values!

      def normalize(attributes)
        values = attributes.to_h.symbolize_keys
        disposition = enum!(values[:disposition_code], EncounterCompletionReview::DISPOSITIONS, "disposition")
        instructions = enum!(values[:instructions_status], EncounterCompletionReview::INSTRUCTIONS_STATUSES,
          "instructions status")
        education = enum!(values[:education_status], EncounterCompletionReview::EDUCATION_STATUSES, "education status")
        {
          disposition_code: disposition, instructions_status: instructions, education_status: education,
          follow_up_id: positive_id!(values[:follow_up_id], "follow-up"),
          follow_up_version: nonnegative_integer!(values[:follow_up_version], "follow-up version"),
          expected_follow_up_state: enum!(values[:expected_follow_up_state],
            EncounterCompletionReview::FOLLOW_UP_STATES, "follow-up state"),
          instruction_note_revision_id: optional_id(values[:instruction_note_revision_id], "instruction revision"),
          expected_education_event_ids: id_list(values[:expected_education_event_ids], "education events"),
          expected_open_task_versions: task_version_list(values[:expected_open_task_versions]),
          open_work_reviewed: values[:open_work_reviewed] == true,
          exception_note: optional_text(values[:exception_note], 2_000)
        }
      end
      private_class_method :normalize

      def enum!(value, allowed, label)
        text = value.to_s
        raise ArgumentError, "Choose a supported #{label}." unless allowed.include?(text)
        text
      end
      private_class_method :enum!

      def positive_id!(value, label)
        number = Integer(value, exception: false)
        raise ArgumentError, "Choose a valid #{label}." unless number&.positive?
        number
      end
      private_class_method :positive_id!

      def optional_id(value, label)
        return if value.blank?
        positive_id!(value, label)
      end
      private_class_method :optional_id

      def nonnegative_integer!(value, label)
        number = Integer(value, exception: false)
        raise ArgumentError, "Choose a valid #{label}." unless number && number >= 0
        number
      end
      private_class_method :nonnegative_integer!

      def id_list(value, label)
        values = Array(value).map { |item| positive_id!(item, label) }
        raise ArgumentError, "#{label.capitalize} must not contain duplicates." unless values.uniq.length == values.length
        values
      end
      private_class_method :id_list

      def task_version_list(value)
        values = Array(value).map(&:to_s)
        unless values.all? { |item| item.match?(/\A[1-9]\d*:([0]|[1-9]\d*)\z/) }
          raise ArgumentError, "Open task versions are invalid. Refresh the completion checklist."
        end
        unless values.uniq.length == values.length
          raise ArgumentError, "Open task versions must not contain duplicates."
        end
        values
      end
      private_class_method :task_version_list

      def optional_text(value, maximum)
        text = value.to_s.strip
        return nil if text.blank?
        raise ArgumentError, "The exception note must be at most #{maximum} characters." if text.length > maximum
        text
      end
      private_class_method :optional_text

      def authorize_read!(practice, actor, encounter)
        Authorization.authorize!(practice:, actor:, action: "patients.read", subject: encounter.patient)
        Authorization.authorize!(practice:, actor:, action: "clinical_records.read", site: encounter.site)
      end
      private_class_method :authorize_read!
    end
  end
end
