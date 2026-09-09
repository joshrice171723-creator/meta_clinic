module Clinic
  module Telehealth
    module WrapUpWorkflow
      module_function

      def authorize_manage!(visit:, actor:)
        membership = AccessPolicy.authorize!(actor_context: { actor: actor, practice: visit.practice }, visit: visit,
          action: :wrap_up)
        Clinic::Authorization.authorize!(actor: actor, practice: visit.practice, action: "encounters.write",
          site: visit.appointment.site)
        Clinic::Authorization.authorize!(actor: actor, practice: visit.practice, action: "notes.write",
          site: visit.appointment.site)
        if visit.scribe_encounter_id
          Clinic::Authorization.authorize!(actor: actor, practice: visit.practice, action: "scribe.read",
            site: visit.appointment.site)
        end
        membership
      end

      def can_read?(visit:, actor:)
        ability = Ability.new(actor, practice: visit.practice)
        ability.allowed_permission?("notes.read", site: visit.appointment.site) &&
          (!visit.scribe_encounter_id || ability.allowed_permission?("scribe.read", site: visit.appointment.site))
      end

      def can_manage?(visit:, actor:, ability: nil)
        ability ||= Ability.new(actor, practice: visit.practice)
        ability.allowed_permission?("telehealth.host", site: visit.appointment.site) &&
          ability.allowed_permission?("encounters.write", site: visit.appointment.site) &&
          ability.allowed_permission?("notes.write", site: visit.appointment.site) &&
          (!visit.scribe_encounter_id || ability.allowed_permission?("scribe.read", site: visit.appointment.site))
      end

      def authorize_finalize!(visit:, actor:)
        membership = authorize_manage!(visit: visit, actor: actor)
        participant = visit.participants.active_record.find_by(membership_id: membership.id, role: "clinician")
        unless membership.clinician_profile && participant && !participant.removed?
          raise Clinic::Authorization::Denied
        end
        membership
      end

      def can_finalize?(visit:, actor:)
        return false unless can_manage?(visit: visit, actor: actor)

        membership = Clinic::Membership.active.find_by(practice_id: visit.practice_id, user_id: actor.id)
        membership&.clinician_profile &&
          visit.participants.active_record.exists?(membership_id: membership.id, role: "clinician")
      end

      def save(visit:, actor:, request_key:, expected_version:, attributes:)
        membership = authorize_manage!(visit: visit, actor: actor)
        input = normalize_input(visit, attributes)
        result = Clinic::Idempotency.execute(practice: visit.practice, actor: actor,
          operation_code: "telehealth.wrap_up.save", request_key: request_key, resource: visit,
          authorization_action: "telehealth.host",
          authorization: -> { authorize_manage!(visit: visit, actor: actor) },
          payload: { visit_id: visit.id, expected_version: expected_version, wrap_up: input },
          result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { WrapUp.find_by(practice_id: practice.id, id: receipt.resource_id) }) do
          visit.appointment.with_lock do
            visit.lock!
            stale!(visit, expected_version)
            ensure_encounter!(visit)
            wrap_up = WrapUp.lock.find_or_initialize_by(practice_id: visit.practice_id, visit_id: visit.id)
            raise Error.new("The finalized wrap-up cannot be changed.", code: "wrap_up_finalized", status: :conflict) if wrap_up.finalized?

            wrap_up.assign_attributes(input.merge(patient_id: visit.patient_id, appointment_id: visit.appointment_id,
              encounter_id: visit.encounter_id, created_by_membership_id: wrap_up.created_by_membership_id || membership.id,
              updated_by_membership_id: membership.id))
            wrap_up.save!
            visit.touch
            audit!(visit, actor, wrap_up, "save")
            wrap_up
          end
        end
        result.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def finalize(visit:, actor:, request_key:, expected_version:)
        membership = authorize_finalize!(visit: visit, actor: actor)
        result = Clinic::Idempotency.execute(practice: visit.practice, actor: actor,
          operation_code: "telehealth.wrap_up.finalize", request_key: request_key, resource: visit,
          authorization_action: "telehealth.host",
          authorization: -> { authorize_finalize!(visit: visit, actor: actor) },
          payload: { visit_id: visit.id, expected_version: expected_version },
          result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { WrapUp.find_by(practice_id: practice.id, id: receipt.resource_id) }) do
          visit.appointment.with_lock do
            visit.lock!
            stale!(visit, expected_version)
            wrap_up = WrapUp.lock.find_by!(practice_id: visit.practice_id, visit_id: visit.id)
            raise Error.new("The wrap-up was already finalized.", code: "wrap_up_finalized", status: :conflict) if wrap_up.finalized?

            issues = blockers(visit, wrap_up)
            if issues.any?
              raise Error.new("The wrap-up is not ready to finalize: #{issues.join(', ')}.",
                code: "wrap_up_not_ready", status: :unprocessable_entity)
            end
            revision, signature, instructions = instruction_evidence!(visit, wrap_up.instruction_note_revision_id)
            snapshot = scribe_snapshot(visit)
            wrap_up.update!(status: "finalized", patient_instructions: instructions,
              instruction_note: revision.note, instruction_note_signature: signature,
              **snapshot_attributes(snapshot), finalized_by_membership_id: membership.id,
              updated_by_membership_id: membership.id, finalized_at: Current.business_time)
            visit.touch
            audit!(visit, actor, wrap_up, "finalize")
            wrap_up
          end
        end
        result.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def options(visit)
        {
          instruction_revisions: instruction_revisions(visit),
          follow_up_appointments: follow_up_appointments(visit).map { |appointment| VisitSerializer.appointment(appointment) },
          blockers: blockers(visit, visit.wrap_up)
        }
      end

      def blockers(visit, wrap_up)
        values = []
        values << "visit_not_ended" unless visit.ended?
        values << "room_end_unconfirmed" if visit.current_room_attempt && !visit.current_room_attempt.ended?
        values << "encounter_required" unless visit.encounter_id
        return values << "wrap_up_required" unless wrap_up
        return values if wrap_up.finalized?

        values << "outcome_required" if wrap_up.outcome.blank?
        values << "patient_instructions_required" if wrap_up.patient_instructions.blank?
        values << "instruction_revision_required" if wrap_up.instruction_note_revision_id.blank?
        values << "follow_up_status_required" if wrap_up.follow_up_status.blank?
        if wrap_up.follow_up_status.in?(%w[needed arranged]) && wrap_up.follow_up_plan.blank?
          values << "follow_up_plan_required"
        end
        values << "follow_up_appointment_required" if wrap_up.follow_up_status == "arranged" && !valid_follow_up?(visit, wrap_up)
        values << "scribe_review_status_required" if wrap_up.scribe_review_status.blank?
        values << "scribe_review_mismatch" unless scribe_disposition_valid?(visit, wrap_up.scribe_review_status)
        begin
          _, _, instructions = instruction_evidence!(visit, wrap_up.instruction_note_revision_id)
          values << "instruction_text_changed" unless instructions == wrap_up.patient_instructions
        rescue ActiveRecord::RecordNotFound, Error
          values << "instruction_revision_invalid" if wrap_up.instruction_note_revision_id.present?
        end
        values.uniq
      end

      def scribe_snapshot(visit)
        encounter = visit.scribe_encounter
        document = encounter&.documents&.where(status: "active")&.includes(current_draft: :exports)&.order(:id)&.last
        draft = document&.current_draft
        export = draft&.exports&.select { |candidate| candidate.status == "exported" && candidate.chart_written? }&.max_by(&:id)
        {
          encounter_id: encounter&.id, encounter_status: encounter&.status,
          draft_id: draft&.id, draft_status: draft&.status,
          export_id: export&.id, export_state: draft&.export_state,
          encounter_note_id: export&.encounter_note_id,
          encounter_note_revision_id: export&.encounter_note_revision_id
        }
      end

      def publication_state(wrap_up)
        return "draft" unless wrap_up.finalized?
        return "awaiting_encounter_close" unless wrap_up.encounter.status == "completed" && wrap_up.encounter.ended_at.present?
        return "released" if instruction_release_current?(wrap_up)

        "release_blocked"
      end

      def instruction_release_current?(wrap_up)
        note = wrap_up.instruction_note
        return false unless note

        current = note.revisions.includes(:signatures).select { |revision| revision.signatures.any? }
          .max_by { |revision| [ revision.revision_no, revision.id ] }
        return false unless current&.id == wrap_up.instruction_note_revision_id

        instructions = Clinic::Care::SoapNotePayload.load!(current.encrypted_body)[:patient_instructions]
        instructions.present? && instructions == wrap_up.patient_instructions
      end

      def instruction_revisions(visit)
        return [] unless visit.encounter_id

        Clinic::EncounterNote.where(practice_id: visit.practice_id, patient_id: visit.patient_id,
          encounter_id: visit.encounter_id, note_kind: "soap").includes(revisions: :signatures).flat_map do |note|
          note.revisions.filter_map do |revision|
            signature = revision.signatures.max_by { |value| [ value.signed_at, value.id ] }
            next unless signature
            instructions = Clinic::Care::SoapNotePayload.load!(revision.encrypted_body)[:patient_instructions]
            next if instructions.blank?

            { id: revision.id, patient_instructions: instructions, signed_at: signature.signed_at.iso8601(6) }
          end
        end.sort_by { |item| item.fetch(:signed_at) }.reverse.first(20)
      end

      def follow_up_appointments(visit)
        Clinic::Appointment.where(practice_id: visit.practice_id, patient_id: visit.patient_id,
          status: %w[scheduled confirmed]).where("starts_at > ?", visit.appointment.ends_at)
          .where.not(id: visit.appointment_id).includes(:practice, :patient, booked_clinician: :membership)
          .order(:starts_at, :id).limit(25)
      end

      def normalize_input(visit, attributes)
        value = attributes.to_h.deep_symbolize_keys
        revision_id = optional_id(value[:instruction_note_revision_id])
        patient_instructions = normalized_text(value[:patient_instructions], maximum: 4_000)
        instruction_note_id = nil
        if revision_id
          revision, _, patient_instructions = instruction_evidence!(visit, revision_id)
          instruction_note_id = revision.note_id
        end
        follow_up_status = optional_enum(value[:follow_up_status], WrapUp::FOLLOW_UP_STATUSES, "follow_up_status")
        follow_up_appointment_id = optional_id(value[:follow_up_appointment_id])
        follow_up_appointment_id = nil unless follow_up_status == "arranged"
        if follow_up_appointment_id
          follow_up_appointments(visit).find { |appointment| appointment.id == follow_up_appointment_id } ||
            raise(Error.new("Choose an available follow-up appointment.", code: "follow_up_appointment_invalid",
              field: "follow_up_appointment_id", status: :unprocessable_entity))
        end
        {
          outcome: optional_enum(value[:outcome], WrapUp::OUTCOMES, "outcome"),
          clinician_notes: normalized_text(value[:clinician_notes], maximum: 8_000),
          patient_instructions: patient_instructions,
          instruction_note_revision_id: revision_id,
          instruction_note_id: instruction_note_id,
          follow_up_status: follow_up_status,
          follow_up_plan: normalized_text(value[:follow_up_plan], maximum: 4_000),
          follow_up_appointment_id: follow_up_appointment_id,
          scribe_review_status: optional_enum(value[:scribe_review_status], WrapUp::SCRIBE_REVIEW_STATUSES,
            "scribe_review_status")
        }
      end

      def instruction_evidence!(visit, revision_id)
        raise Error.new("Choose signed patient instructions.", code: "instruction_revision_required",
          field: "instruction_note_revision_id", status: :unprocessable_entity) unless revision_id

        revision = Clinic::EncounterNoteRevision.includes(:signatures, :note).find_by!(practice_id: visit.practice_id,
          id: revision_id)
        unless revision.note.patient_id == visit.patient_id && revision.note.encounter_id == visit.encounter_id &&
            revision.note.note_kind == "soap"
          raise Error.new("Choose signed instructions from this encounter.", code: "instruction_revision_invalid",
            field: "instruction_note_revision_id", status: :unprocessable_entity)
        end
        signature = revision.signatures.max_by { |value| [ value.signed_at, value.id ] }
        raise Error.new("Choose a signed instruction revision.", code: "instruction_revision_unsigned",
          field: "instruction_note_revision_id", status: :unprocessable_entity) unless signature

        instructions = Clinic::Care::SoapNotePayload.load!(revision.encrypted_body)[:patient_instructions]
        raise Error.new("The signed revision has no patient instructions.", code: "patient_instructions_required",
          field: "instruction_note_revision_id", status: :unprocessable_entity) if instructions.blank?
        [ revision, signature, instructions ]
      end

      def scribe_disposition_valid?(visit, disposition)
        return false if disposition.blank?
        snapshot = scribe_snapshot(visit)
        return true if disposition == "deferred"
        if disposition == "not_used"
          return snapshot[:draft_id].nil?
        end
        return false unless disposition == "reviewed" && snapshot[:draft_id]

        draft = Clinic::Scribe::Draft.find(snapshot[:draft_id])
        draft.status.in?(%w[approved exported]) && Clinic::Scribe::Workflow.fresh?(draft)
      end

      def snapshot_attributes(value)
        value.transform_keys { |key| "scribe_#{key}" }.symbolize_keys
      end

      def valid_follow_up?(visit, wrap_up)
        follow_up_appointments(visit).any? { |appointment| appointment.id == wrap_up.follow_up_appointment_id }
      end

      def ensure_encounter!(visit)
        return if visit.encounter_id

        raise Error.new("Start the clinical encounter before saving a wrap-up.", code: "encounter_required",
          status: :unprocessable_entity)
      end

      def stale!(visit, expected_version)
        raise ActiveRecord::StaleObjectError.new(visit, "update") unless visit.lock_version == expected_version.to_i
      end

      def optional_enum(value, allowed, field)
        normalized = value.to_s.strip.presence
        return unless normalized
        return normalized if allowed.include?(normalized)

        raise Error.new("#{field.humanize} is not supported.", code: "invalid_wrap_up", field: field,
          status: :unprocessable_entity)
      end

      def optional_id(value)
        return if value.blank?

        integer = Integer(value)
        raise ArgumentError unless integer.positive?
        integer
      rescue ArgumentError, TypeError
        raise Error.new("Choose a valid record.", code: "invalid_wrap_up", status: :unprocessable_entity)
      end

      def normalized_text(value, maximum:)
        text = value.to_s.strip
        if text.length > maximum
          raise Error.new("Wrap-up text is too long.", code: "invalid_wrap_up", status: :unprocessable_entity)
        end
        text
      end

      def audit!(visit, actor, wrap_up, action)
        Clinic::AuditRecorder.record!(practice: visit.practice, actor: actor,
          action_code: "telehealth.wrap_up.#{action}", outcome: :committed,
          resource_version_ref: "telehealth_visit/#{visit.id}/wrap_up/#{wrap_up.id}/version/#{wrap_up.lock_version}")
      end
    end
  end
end
