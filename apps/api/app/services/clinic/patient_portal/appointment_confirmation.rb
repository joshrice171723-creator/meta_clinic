require "digest"
require "set"

module Clinic
  module PatientPortal
    class AppointmentConfirmation
      class ReloadRequired < StandardError; end
      class Stale < StandardError; end

      TOKEN_VERSION = "v1"
      PENDING_CHANGE_KINDS = %w[reschedule cancel].freeze

      def self.pending_change_ids(practice:, patient:, appointment_ids:)
        return Set.new if appointment_ids.empty?

        AppointmentRequest.where(
          practice_id: practice.id,
          patient_id: patient.id,
          source_appointment_id: appointment_ids,
          status: "pending",
          request_kind: PENDING_CHANGE_KINDS
        ).pluck(:source_appointment_id).to_set
      end

      def self.portal_appointment(appointment, pending_change:, now: Current.business_time)
        eligible = eligible_context?(appointment, pending_change:, now:, fresh_encounter: false)
        AppointmentRequestSerializer.appointment(appointment).merge(
          can_confirm: eligible && appointment.status == "scheduled",
          confirmation_version: eligible ? material_version(appointment) : nil
        )
      end

      def self.confirm(practice:, patient:, appointment:, actor:, identity:, omni_preview:, version:,
        confirmed_at: Current.business_time)
        ApplicationRecord.transaction do
          appointment.lock!
          authorize_context!(practice:, patient:, appointment:, actor:, identity:, omni_preview:)

          current_version = material_version(appointment)
          unless secure_match?(current_version, version)
            raise ReloadRequired, "This appointment changed. Reload your appointments before confirming."
          end

          pending_change = pending_change?(appointment)
          unless eligible_context?(appointment, pending_change:, now: confirmed_at, fresh_encounter: true)
            raise Stale, "This appointment can no longer be confirmed. Reload your appointments."
          end
          next appointment if appointment.status == "confirmed"

          appointment.transition_to!("confirmed")
          Clinic::Reminders::ReconcileAppointment.call(appointment:, actor:)
          Clinic::AuditRecorder.record!(
            practice: practice,
            actor: actor,
            action_code: "patient_portal.appointment.confirm",
            outcome: :committed,
            resource_version_ref: "Clinic::Appointment/#{appointment.id}"
          )
          appointment
        end
      end

      def self.material_version(appointment)
        payload = AppointmentRequestSerializer.appointment(appointment)
        material = {
          practice_id: appointment.practice_id,
          patient_id: appointment.patient_id,
          id: payload.fetch(:id),
          starts_at: payload.fetch(:starts_at),
          ends_at: payload.fetch(:ends_at),
          visit_modality: payload.fetch(:visit_modality),
          site: payload.fetch(:site),
          room: payload.fetch(:room),
          clinician: payload.fetch(:clinician),
          visit_type: payload.fetch(:visit_type)
        }
        "#{TOKEN_VERSION}:#{Digest::SHA256.hexdigest(JSON.generate(material))}"
      end

      def self.eligible_context?(appointment, pending_change:, now:, fresh_encounter:)
        %w[scheduled confirmed].include?(appointment.status) &&
          appointment.starts_at > now && !appointment_started?(appointment, fresh: fresh_encounter) && !pending_change
      end
      private_class_method :eligible_context?

      def self.appointment_started?(appointment, fresh:)
        if !fresh && appointment.association(:encounter).loaded?
          return appointment.encounter.present?
        end

        Clinic::Encounter.exists?(
          practice_id: appointment.practice_id,
          patient_id: appointment.patient_id,
          appointment_id: appointment.id
        )
      end
      private_class_method :appointment_started?

      def self.pending_change?(appointment)
        AppointmentRequest.exists?(
          practice_id: appointment.practice_id,
          patient_id: appointment.patient_id,
          source_appointment_id: appointment.id,
          status: "pending",
          request_kind: PENDING_CHANGE_KINDS
        )
      end
      private_class_method :pending_change?

      def self.secure_match?(current, supplied)
        supplied = supplied.to_s
        current.bytesize == supplied.bytesize && ActiveSupport::SecurityUtils.secure_compare(current, supplied)
      end
      private_class_method :secure_match?

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
