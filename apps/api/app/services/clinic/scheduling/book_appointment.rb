module Clinic
  module Scheduling
    class BookAppointment
      def self.call(practice:, actor:, patient:, starts_at:, ends_at:, site: nil, room: nil, booked_clinician: nil, visit_type: nil,
        reason: nil, request_key: nil, visit_modality: "in_person", schedule_hold: nil)
        authorize = -> {
          Authorization.authorize_with_legacy!(actor: actor, practice: practice,
            action: "appointments.book", legacy_action: "appointments.write", site: site)
        }
        authorize.call
        raise ArgumentError, "The patient must belong to the selected practice." unless patient.practice_id == practice.id
        raise ArgumentError, "Choose a site before scheduling this appointment." unless site
        raise ArgumentError, "Choose a clinician before scheduling this appointment." unless booked_clinician
        raise ArgumentError, "Choose a visit type before scheduling this appointment." unless visit_type
        raise ArgumentError, "The site must belong to the selected practice." unless site.practice_id == practice.id
        raise ArgumentError, "The clinician must belong to the selected practice." unless booked_clinician.practice_id == practice.id
        raise ArgumentError, "The visit type must belong to the selected practice." unless visit_type.practice_id == practice.id
        if room && (room.practice_id != practice.id || room.site_id != site.id)
          raise ArgumentError, "The selected room must belong to the appointment site."
        end
        if schedule_hold
          schedule_hold.lock!
          schedule_hold.expire_if_needed!
          unless schedule_hold.active? && schedule_hold.practice_id == practice.id && schedule_hold.patient_id == patient.id &&
            schedule_hold.site_id == site.id && schedule_hold.clinician_id == booked_clinician.id && schedule_hold.room_id == room&.id &&
            schedule_hold.starts_at == starts_at && schedule_hold.ends_at == ends_at
            raise ArgumentError, "The selected hold is no longer available for this appointment."
          end
        end

        visit_modality = visit_modality.to_s.presence || "in_person"
        raise ArgumentError, "Visit format must be in person or video." unless %w[in_person video].include?(visit_modality)
        if visit_modality == "video"
          raise ArgumentError, "A video visit cannot reserve a physical room." if room
          raise ArgumentError, "Choose a clinician for a video visit." unless booked_clinician
        end
        attributes = {
          patient: patient,
          site: site,
          room: room,
          booked_clinician: booked_clinician,
          visit_type: visit_type,
          reason: reason.to_s.strip.presence,
          starts_at: starts_at,
          ends_at: ends_at,
          visit_modality: visit_modality,
          schedule_hold: schedule_hold,
          actor: actor
        }
        return create_appointment(practice: practice, **attributes) if request_key.nil?

        outcome = Clinic::Idempotency.execute(
          practice: practice, actor: actor, operation_code: "appointments.book",
          request_key: request_key, authorization: authorize, authorization_action: "appointments.book",
          result_resource: ->(appointment) { appointment },
          resource_resolver: ->(practice:, receipt:) {
            practice.appointments.find_by(id: receipt.resource_id)
          },
          payload: {
            patient_id: patient.id,
            site_id: site&.id,
            room_id: room&.id,
            booked_clinician_id: booked_clinician&.id,
            visit_type_id: visit_type&.id,
            schedule_hold_id: schedule_hold&.id,
            reason: reason.to_s.strip.presence,
            starts_at: starts_at.utc.iso8601(6),
            ends_at: ends_at.utc.iso8601(6),
            visit_modality: visit_modality
          }
        ) do
          create_appointment(practice: practice, **attributes)
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      rescue ActiveRecord::StatementInvalid => error
        raise unless error.message.match?(/overlap|exclusion|no_provider|no_room/i)

        raise ArgumentError, "The selected room or clinician is already reserved for that interval."
      end

      def self.create_appointment(practice:, patient:, starts_at:, ends_at:, site:, room:, booked_clinician:, visit_type:, reason:,
        visit_modality:, actor:, schedule_hold: nil)
        ApplicationRecord.transaction do
          practice.lock!
          Configuration::StarterProfile.require_service!(practice: practice, service: "telehealth") if visit_modality == "video"
          CapacityGuard.check!(practice: practice, clinician: booked_clinician, site: site, patient: patient,
            starts_at: starts_at, ends_at: ends_at, schedule_hold_id: schedule_hold&.id)
          appointment = practice.appointments.create!(patient: patient, site: site, room: room,
            booked_clinician: booked_clinician, visit_type: visit_type, reason: reason, starts_at: starts_at, ends_at: ends_at,
            status: "scheduled", visit_modality: visit_modality, schedule_hold: schedule_hold)
          schedule_hold.update!(state: "converted") if schedule_hold
          Clinic::Telehealth::ReconcileAppointment.call(appointment: appointment, actor: actor) if visit_modality == "video"
          appointment
        end
      end
      private_class_method :create_appointment
    end
  end
end
