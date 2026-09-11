module Clinic
  module PatientPortal
    class PrevisitNotes
      class Conflict < StandardError; end
      class Stale < StandardError; end
      class Ineligible < StandardError; end

      Result = Data.define(:note, :replayed)

      def self.latest(appointment)
        Clinic::Care::PrevisitNote.where(
          practice_id: appointment.practice_id,
          patient_id: appointment.patient_id,
          appointment_id: appointment.id
        ).latest_first.first
      end

      def self.editable?(appointment, now: Current.business_time)
        %w[scheduled confirmed].include?(appointment.status) &&
          appointment.starts_at > now &&
          !Clinic::Encounter.exists?(
            practice_id: appointment.practice_id,
            patient_id: appointment.patient_id,
            appointment_id: appointment.id
          )
      end

      def self.submit(practice:, patient:, appointment:, actor:, identity:, omni_preview:, text:,
        expected_version:, request_key:, submitted_at: Current.business_time)
        normalized_text = text.to_s.strip
        result = ApplicationRecord.transaction do
          appointment.lock!
          authorize_context!(practice:, patient:, appointment:, actor:, identity:, omni_preview:)

          existing = request_record(practice:, actor:, request_key:)
          next replay(existing, patient:, appointment:, text: normalized_text, expected_version:) if existing

          raise Ineligible, "Only an upcoming scheduled or confirmed appointment that has not started can be edited." unless editable?(appointment, now: submitted_at)

          latest = latest(appointment)
          actual_version = latest&.version_number || 0
          raise Stale, "This pre-visit note changed. Reload it before saving." unless actual_version == expected_version

          note = Clinic::Care::PrevisitNote.create!(
            practice: practice,
            patient: patient,
            appointment: appointment,
            version_number: actual_version + 1,
            encrypted_text: normalized_text,
            submitted_by_user: actor,
            submitted_at: submitted_at,
            request_key: request_key
          )
          Clinic::AuditRecorder.record!(
            practice: practice,
            actor: actor,
            action_code: "patient_portal.previsit_note.write",
            outcome: :committed,
            resource_version_ref: "Clinic::Care::PrevisitNote/#{note.id}"
          )
          Result.new(note: note, replayed: false)
        end
        result
      rescue ActiveRecord::RecordNotUnique
        existing = request_record(practice:, actor:, request_key:)
        raise unless existing

        replay(existing, patient:, appointment:, text: normalized_text, expected_version:)
      end

      def self.request_record(practice:, actor:, request_key:)
        Clinic::Care::PrevisitNote.find_by(
          practice_id: practice.id,
          submitted_by_user_id: actor.id,
          request_key: request_key
        )
      end
      private_class_method :request_record

      def self.replay(note, patient:, appointment:, text:, expected_version:)
        compatible = note.patient_id == patient.id && note.appointment_id == appointment.id &&
          note.version_number == expected_version + 1 && note.encrypted_text == text
        raise Conflict, "This request key was already used for different pre-visit note data." unless compatible

        Result.new(note: note, replayed: true)
      end
      private_class_method :replay

      def self.authorize_context!(practice:, patient:, appointment:, actor:, identity:, omni_preview:)
        valid = actor&.active? && patient.practice_id == practice.id &&
          appointment.practice_id == practice.id && appointment.patient_id == patient.id
        if identity
          identity.lock!
          valid &&= identity.active? && identity.user_id == actor.id &&
            identity.practice_id == practice.id && identity.patient_id == patient.id
        else
          valid &&= omni_preview && Development::TestAccounts.omni?(actor)
        end
        raise Clinic::Authorization::Denied unless valid
      end
      private_class_method :authorize_context!
    end
  end
end
