module Clinic
  module PatientPortal
    class ReviewAppointmentRequest
      APPROVE_OPERATION = "patient_portal.appointment_request.approve"
      DECLINE_OPERATION = "patient_portal.appointment_request.decline"

      Result = Data.define(:request, :appointment, :replayed)

      def self.approve(practice:, actor:, request:, request_key:, starts_at: nil, ends_at: nil, site: nil, room: nil,
        booked_clinician: nil, visit_type: nil)
        authorize_source!(practice: practice, actor: actor, request: request)
        authorize_review!(practice: practice, actor: actor, request: request, site: site)
        ensure_active_identity!(practice, request)
        validate_approval_input!(request, starts_at:, ends_at:, site:, room:, booked_clinician:, visit_type:)

        outcome = Clinic::Idempotency.execute(
          practice: practice,
          actor: actor,
          operation_code: APPROVE_OPERATION,
          request_key: request_key,
          payload: {
            appointment_request_id: request.id,
            request_kind: request.request_kind,
            starts_at: starts_at,
            ends_at: ends_at,
            site_id: site&.id,
            room_id: room&.id,
            booked_clinician_id: booked_clinician&.id,
            visit_type_id: visit_type&.id
          },
          resource: request,
          authorization: -> {
            authorize_source!(practice: practice, actor: actor, request: request)
            authorize_review!(practice: practice, actor: actor, request: request, site: site)
          },
          authorization_action: "appointments.book",
          result_resource: ->(reviewed_request) { reviewed_request },
          resource_resolver: ->(practice:, receipt:) {
            practice.patient_portal_appointment_requests.find_by(id: receipt.resource_id)
          }
        ) do
          practice.lock!
          locked_request = practice.patient_portal_appointment_requests.lock.find(request.id)
          locked_source = lock_source_appointment!(practice, locked_request)
          authorize_source!(practice: practice, actor: actor, request: locked_request)
          reviewer = authorize_review!(
            practice: practice,
            actor: actor,
            request: locked_request,
            site: site,
            source_appointment: locked_source
          )
          ensure_active_identity!(practice, locked_request)
          ExpireAppointmentRequests.call(scope: practice.patient_portal_appointment_requests.where(id: locked_request.id),
            actor: actor)
          locked_request.reload
          ensure_pending!(locked_request)
          validate_approval_input!(
            locked_request,
            starts_at:,
            ends_at:,
            site:,
            room:,
            booked_clinician:,
            visit_type:
          )
          ensure_source_current!(locked_request, locked_source) if locked_source

          appointment = approve_request!(
            practice:,
            actor:,
            request: locked_request,
            source_appointment: locked_source,
            starts_at:,
            ends_at:,
            site:,
            room:,
            booked_clinician:,
            visit_type:
          )
          locked_request.update!(
            status: :approved,
            appointment: appointment,
            reviewed_by_membership: reviewer,
            reviewed_at: Current.business_time,
            review_note: nil
          )
          record_review!(practice: practice, actor: actor, request: locked_request, action: "approve")
          locked_request
        end
        reviewed_request = outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
        ensure_active_identity!(practice, reviewed_request)
        Result.new(request: reviewed_request, appointment: reviewed_request.appointment, replayed: outcome.replayed)
      end

      def self.approve_request!(practice:, actor:, request:, source_appointment:, starts_at:, ends_at:, site:, room:,
        booked_clinician:, visit_type:)
        case request.request_kind
        when "new_booking"
          Clinic::Scheduling::BookAppointment.call(
            practice: practice,
            actor: actor,
            patient: request.patient,
            starts_at: starts_at,
            ends_at: ends_at,
            site: site,
            room: room,
            booked_clinician: booked_clinician,
            visit_type: visit_type,
            visit_modality: request.requested_modality || "in_person"
          )
        when "reschedule"
          conflict = practice.appointments.where(
            patient_id: request.patient_id,
            status: %w[scheduled confirmed]
          ).where.not(id: source_appointment.id).where(
            "starts_at < ? AND ends_at > ?",
            ends_at,
            starts_at
          ).exists?
          raise ArgumentError, "That time overlaps another patient appointment." if conflict

          Clinic::Scheduling::RescheduleAppointment.call(
            appointment: source_appointment,
            actor: actor,
            starts_at: starts_at,
            ends_at: ends_at,
            expected_updated_at: request.source_appointment_updated_at,
            request_key: "appointment-request.#{request.id}.reschedule",
            visit_modality: request.requested_modality || source_appointment.visit_modality
          )
        when "cancel"
          Clinic::Scheduling::TransitionAppointment.call(
            appointment: source_appointment,
            actor: actor,
            to: "cancelled",
            site: source_appointment.site,
            expected_status: request.source_status
          )
        else
          raise ArgumentError, "The appointment request type is not supported."
        end
      end
      private_class_method :approve_request!

      def self.decline(practice:, actor:, request:, request_key:, reason: nil)
        authorize_booking = -> {
          Clinic::Authorization.authorize_with_legacy!(
            actor: actor,
            practice: practice,
            action: "appointments.book",
            legacy_action: "appointments.write",
            site: source_site(request)
          )
        }
        authorize_source!(practice: practice, actor: actor, request: request)
        authorize_booking.call
        ensure_active_identity!(practice, request)
        reason = normalized_reason(reason)

        outcome = Clinic::Idempotency.execute(
          practice: practice,
          actor: actor,
          operation_code: DECLINE_OPERATION,
          request_key: request_key,
          payload: { appointment_request_id: request.id, reason: reason },
          resource: request,
          authorization: -> {
            authorize_source!(practice: practice, actor: actor, request: request)
            authorize_booking.call
          },
          authorization_action: "appointments.book",
          result_resource: ->(reviewed_request) { reviewed_request },
          resource_resolver: ->(practice:, receipt:) {
            practice.patient_portal_appointment_requests.find_by(id: receipt.resource_id)
          }
        ) do
          locked_request = practice.patient_portal_appointment_requests.lock.find(request.id)
          authorize_source!(practice: practice, actor: actor, request: locked_request)
          reviewer = Clinic::Authorization.authorize_with_legacy!(
            actor: actor,
            practice: practice,
            action: "appointments.book",
            legacy_action: "appointments.write",
            site: source_site(locked_request)
          )
          ensure_active_identity!(practice, locked_request)
          ExpireAppointmentRequests.call(scope: practice.patient_portal_appointment_requests.where(id: locked_request.id),
            actor: actor)
          locked_request.reload
          ensure_pending!(locked_request)
          locked_request.update!(
            status: :declined,
            reviewed_by_membership: reviewer,
            reviewed_at: Current.business_time,
            review_note: reason
          )
          record_review!(practice: practice, actor: actor, request: locked_request, action: "decline")
          locked_request
        end
        reviewed_request = outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
        authorize_source!(practice: practice, actor: actor, request: reviewed_request)
        ensure_active_identity!(practice, reviewed_request)
        Result.new(request: reviewed_request, appointment: nil, replayed: outcome.replayed)
      end

      def self.authorize_source!(practice:, actor:, request:)
        Clinic::Authorization.authorize!(
          actor: actor,
          practice: practice,
          action: "appointments.read",
          site: source_site(request)
        )
      end
      private_class_method :authorize_source!

      def self.authorize_review!(practice:, actor:, request:, site:, source_appointment: nil)
        Clinic::Authorization.authorize_with_legacy!(
          actor: actor,
          practice: practice,
          action: "appointments.book",
          legacy_action: "appointments.write",
          site: request.new_booking? ? site : (source_appointment&.site || request.source_site)
        )
      end
      private_class_method :authorize_review!

      def self.source_site(request)
        request.appointment&.site || request.source_site || request.site
      end
      private_class_method :source_site

      def self.lock_source_appointment!(practice, request)
        return if request.new_booking?

        practice.appointments.lock.find(request.source_appointment_id)
      end
      private_class_method :lock_source_appointment!

      def self.ensure_source_current!(request, appointment)
        current = appointment.patient_id == request.patient_id &&
          appointment.updated_at == request.source_appointment_updated_at &&
          appointment.starts_at == request.source_starts_at &&
          appointment.ends_at == request.source_ends_at &&
          appointment.site_id == request.source_site_id &&
          appointment.status == request.source_status &&
          %w[scheduled confirmed].include?(appointment.status) &&
          appointment.starts_at > Current.business_time &&
          appointment.encounter.nil?
        return if current

        raise ActiveRecord::StaleObjectError.new(appointment, "review appointment request")
      end
      private_class_method :ensure_source_current!

      def self.validate_approval_input!(request, starts_at:, ends_at:, site:, room:, booked_clinician:, visit_type:)
        case request.request_kind
        when "new_booking"
          unless starts_at && ends_at && site
            raise ArgumentError, "Choose the appointment time and clinic location before approval."
          end
        when "reschedule"
          unless starts_at && ends_at
            raise ArgumentError, "Choose the new appointment time before approval."
          end
          if site || room || booked_clinician || visit_type
            raise ArgumentError, "Rescheduling keeps the existing location, room, clinician, and visit type."
          end
          unless starts_at > Current.business_time
            raise ArgumentError, "Choose a future appointment time before approval."
          end
        when "cancel"
          if starts_at || ends_at || site || room || booked_clinician || visit_type
            raise ArgumentError, "Cancellation approval does not accept booking details."
          end
        else
          raise ArgumentError, "The appointment request type is not supported."
        end
      end
      private_class_method :validate_approval_input!

      def self.ensure_active_identity!(practice, request)
        active = Clinic::PatientPortal::Identity.available.where(
          practice_id: practice.id,
          patient_id: request.patient_id,
          id: request.identity_id
        ).exists?
        raise Clinic::Idempotency::Conflict, "The patient portal access for this request is no longer active." unless active
      end
      private_class_method :ensure_active_identity!

      def self.ensure_pending!(request)
        unless request.pending? && request.appointment_id.nil?
          raise Clinic::Idempotency::Conflict, "This appointment request has already been reviewed."
        end
      end
      private_class_method :ensure_pending!

      def self.normalized_reason(value)
        reason = value.to_s.strip.presence
        raise ArgumentError, "The decline reason must be at most 300 characters." if reason&.length.to_i > 300

        reason
      end
      private_class_method :normalized_reason

      def self.record_review!(practice:, actor:, request:, action:)
        Clinic::AuditRecorder.record!(
          practice: practice,
          actor: actor,
          action_code: "patient_portal.appointment_request.#{action}",
          outcome: :committed,
          resource_version_ref: "patient_portal_appointment_request:#{request.id}:#{request.updated_at.utc.iso8601(6)}"
        )
      end
      private_class_method :record_review!
    end
  end
end
