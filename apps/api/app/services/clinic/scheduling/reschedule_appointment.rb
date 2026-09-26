module Clinic
  module Scheduling
    class RescheduleAppointment
      UNCHANGED = Object.new.freeze

      def self.call(appointment:, actor:, starts_at:, ends_at:, expected_updated_at:, request_key:, visit_modality: nil,
        site: UNCHANGED, room: UNCHANGED, booked_clinician: UNCHANGED, visit_type: UNCHANGED, service_offering: UNCHANGED)
        next_site = site.equal?(UNCHANGED) ? appointment.site : site
        next_clinician = booked_clinician.equal?(UNCHANGED) ? appointment.booked_clinician : booked_clinician
        next_visit_type = visit_type.equal?(UNCHANGED) ? appointment.visit_type : visit_type
        next_offering = service_offering.equal?(UNCHANGED) ? appointment.service_offering : service_offering
        next_room = room.equal?(UNCHANGED) ? appointment.room : room
        next_room = nil if room.equal?(UNCHANGED) && next_room&.site_id != next_site&.id
        next_modality = visit_modality.to_s.presence || appointment.visit_modality
        next_room = nil if next_modality == "video" && room.equal?(UNCHANGED)
        authorize = -> {
          Authorization.authorize_with_legacy!(actor: actor, practice: appointment.practice,
            action: "appointments.book", legacy_action: "appointments.write", site: appointment.site)
          if next_site && next_site.id != appointment.site_id
            Authorization.authorize_with_legacy!(actor: actor, practice: appointment.practice,
              action: "appointments.book", legacy_action: "appointments.write", site: next_site)
          end
        }
        authorize.call
        raise ArgumentError, "Choose a future end time after the start time and within 24 hours." unless starts_at > Current.business_time && ends_at > starts_at && ends_at - starts_at <= 24.hours
        setup_supplied = [ site, booked_clinician, visit_type, service_offering ].any? { |value| !value.equal?(UNCHANGED) }
        if setup_supplied && [ next_site, next_clinician, next_visit_type ].any?(&:nil?)
          raise ArgumentError, "Choose a site, clinician, and visit type before saving this appointment."
        end
        if next_site && next_site.practice_id != appointment.practice_id
          raise ArgumentError, "The site must belong to the appointment practice."
        end
        if next_clinician && next_clinician.practice_id != appointment.practice_id
          raise ArgumentError, "The clinician must belong to the appointment practice."
        end
        if next_visit_type && next_visit_type.practice_id != appointment.practice_id
          raise ArgumentError, "The visit type must belong to the appointment practice."
        end
        if next_room && (next_room.practice_id != appointment.practice_id || next_room.site_id != next_site&.id)
          raise ArgumentError, "The room must belong to the selected site."
        end
        raise ArgumentError, "A video visit cannot use a physical room." if next_modality == "video" && next_room

        outcome = Clinic::Idempotency.execute(
          practice: appointment.practice, actor: actor, operation_code: "appointments.reschedule",
          request_key: request_key, resource: appointment, authorization: authorize,
          authorization_action: "appointments.book", result_resource: ->(record) { record },
          resource_resolver: ->(practice:, receipt:) { practice.appointments.find_by(id: receipt.resource_id) },
          payload: { appointment_id: appointment.id, starts_at: starts_at.iso8601(6), ends_at: ends_at.iso8601(6),
            expected_updated_at: expected_updated_at.iso8601(6), visit_modality: next_modality,
            site_id: next_site&.id, booked_clinician_id: next_clinician&.id, visit_type_id: next_visit_type&.id,
            service_offering_id: next_offering&.id, room_id: next_room&.id }
        ) do
          appointment.practice.lock!
          next_clinician&.lock!
          appointment.with_lock do
            authorize.call
            raise ActiveRecord::StaleObjectError.new(appointment, "reschedule") unless appointment.updated_at == expected_updated_at
            unless %w[scheduled confirmed].include?(appointment.status) && appointment.encounter.nil? && appointment.starts_at > Current.business_time
              raise ArgumentError, "Only an upcoming visit that has not started can be rescheduled."
            end

            modality = visit_modality.to_s.presence || appointment.visit_modality
            if modality == "video" && appointment.visit_modality != "video"
              Configuration::StarterProfile.require_service!(practice: appointment.practice, site: appointment.site, service: "telehealth")
            end
            raise ArgumentError, "Visit format must be in person or video." unless %w[in_person video].include?(modality)
            if modality == "video" && next_clinician.nil?
              raise ArgumentError, "Choose a clinician for a video visit."
            end
            snapshot = next_offering && BookAppointment.offering_snapshot!(offering: next_offering,
              practice: appointment.practice, site: next_site, clinician: next_clinician, room: next_room, visit_type: next_visit_type,
              visit_modality: modality, starts_at: starts_at, ends_at: ends_at)
            CapacityGuard.check!(practice: appointment.practice, clinician: next_clinician, site: next_site, room: next_room,
              patient: appointment.patient, starts_at: starts_at, ends_at: ends_at, appointment_id: appointment.id)
            appointment.update!(starts_at: starts_at, ends_at: ends_at, visit_modality: modality,
              site: next_site, booked_clinician: next_clinician, visit_type: next_visit_type, room: next_room,
              clinician_allocation: 1,
              service_offering: next_offering, service_offering_snapshot: snapshot)
            Clinic::Telehealth::ReconcileAppointment.call(appointment: appointment, actor: actor, event: :rescheduled)
            Clinic::Reminders::ReconcileAppointment.call(appointment: appointment, actor: actor)
            AuditRecorder.record!(practice: appointment.practice, actor: actor, action_code: "appointments.reschedule",
              outcome: :committed, resource_version_ref: "appointment:#{appointment.id}:#{appointment.updated_at.utc.iso8601(6)}")
            appointment
          end
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      rescue ActiveRecord::StatementInvalid => error
        raise unless error.message.match?(/overlap|exclusion|no_provider|no_room/i)

        raise ArgumentError, "The selected room or clinician is already reserved for that interval."
      end
    end
  end
end
