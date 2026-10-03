module Clinic
  module Care
    class PsychotherapyNotes
      OPERATION = "psychotherapy_notes.save"

      def self.therapy_visit?(practice, encounter, actor: nil)
        if actor
          member = practice.memberships.active.find_by(user_id: actor.id)
          return true if member && Care::PsychotherapyNote.exists?(practice:, encounter:, originator_membership: member)
        end
        return false unless Configuration::StarterProfile.service_available?(practice:, site: encounter.site,
          service: "individual_therapy")
        visit_id = Configuration::PracticeFeatures.snapshot(practice:, site: encounter.site).dig(
          :starter_profile, "visits", "individual_therapy", "visit_type_id"
        )
        visit_id.present? && encounter.appointment&.visit_type_id == visit_id
      end

      def self.authorize!(practice:, actor:, encounter:)
        raise ArgumentError, "The encounter does not belong to this clinic." unless
          encounter.practice_id == practice.id && encounter.patient.practice_id == practice.id

        membership = Authorization.authorize!(actor:, practice:, action: "notes.sign", site: encounter.site)
        Authorization.authorize!(actor:, practice:, action: "patients.read", subject: encounter.patient)
        return membership if Ability.new(actor, practice:).role_code_allowed?("clinician")

        AuditRecorder.record!(practice:, actor:, action_code: "psychotherapy_notes.access", outcome: :denied)
        raise Authorization::Denied, "Only an authorized clinician may open a protected psychotherapy note."
      end

      def self.read(practice:, actor:, encounter:)
        member = authorize!(practice:, actor:, encounter:)
        note = latest(practice, encounter, member)
        require_therapy_visit!(practice, encounter) unless note
        AuditRecorder.record!(practice:, actor:, action_code: "psychotherapy_notes.read", outcome: :released)
        note
      end

      def self.save(practice:, actor:, encounter:, body:, revision_reason:, expected_version:, request_key:)
        member = authorize!(practice:, actor:, encounter:)
        value = body.to_s
        raise ArgumentError, "Enter note text before saving." if value.strip.empty?
        raise ArgumentError, "The note is too long." if value.length > 50_000
        raise ArgumentError, "The expected version is invalid." unless expected_version.is_a?(Integer) && expected_version >= 0

        reason = revision_reason.to_s.strip
        if expected_version.positive? && (reason.empty? || reason.length > 2_000)
          raise ArgumentError, "Provide a revision reason of 1 to 2,000 characters."
        end

        outcome = Idempotency.execute(
          practice:, actor:, operation_code: OPERATION, request_key:,
          payload: { encounter_id: encounter.id, expected_version:, body: value, revision_reason: reason },
          resource: encounter,
          result_resource: ->(note) { note },
          resource_resolver: ->(practice:, receipt:) {
            Care::PsychotherapyNote.find_by(id: receipt.resource_id, practice_id: practice.id,
              encounter_id: encounter.id, originator_membership_id: member.id)
          },
          authorization: -> { authorize!(practice:, actor:, encounter:) },
          authorization_action: "psychotherapy_notes.save"
        ) do
          practice.lock!
          encounter.with_lock do
            current = latest(practice, encounter, member)
            require_therapy_visit!(practice, encounter) unless current
            unless (current&.version_number || 0) == expected_version
              raise ActiveRecord::StaleObjectError.new(encounter, "psychotherapy note version")
            end

            note = Care::PsychotherapyNote.create!(
              practice:, patient: encounter.patient, encounter:,
              originator_membership: member, previous_revision: current,
              version_number: expected_version + 1,
              request_key:, body: value,
              revision_reason: current ? reason : nil,
              recorded_at: Current.business_time
            )
            AuditRecorder.record!(practice:, actor:, action_code: OPERATION,
              outcome: :committed, resource_version_ref: "Clinic::Care::PsychotherapyNote/#{note.id}")
            note
          end
        end
        raise Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

        outcome.value || raise(Idempotency::InvalidRequest, "The committed note is unavailable.")
      end

      def self.serialize(note)
        return nil unless note

        { id: note.id, encounter_id: note.encounter_id, version: note.version_number,
          previous_revision_id: note.previous_revision_id, body: note.body,
          revision_reason: note.revision_reason, recorded_at: note.recorded_at.iso8601(6) }
      end

      def self.history(practice:, actor:, encounter:)
        member = authorize!(practice:, actor:, encounter:)
        require_therapy_visit!(practice, encounter) unless latest(practice, encounter, member)
        Care::PsychotherapyNote.where(practice:, encounter:, originator_membership: member)
          .order(version_number: :desc).limit(20).map { |note| serialize(note) }
      end

      def self.latest(practice, encounter, member)
        Care::PsychotherapyNote.where(practice:, encounter:, originator_membership: member)
          .order(version_number: :desc).first
      end
      private_class_method :latest

      def self.require_therapy_visit!(practice, encounter)
        return if therapy_visit?(practice, encounter)

        raise ArgumentError, "Protected psychotherapy notes are available only for a configured individual therapy visit."
      end
      private_class_method :require_therapy_visit!
    end
  end
end
