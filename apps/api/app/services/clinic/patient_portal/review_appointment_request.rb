module Clinic
  module PatientPortal
    class ReviewAppointmentRequest
      APPROVE_OPERATION = "patient_portal.appointment_request.approve"
      DECLINE_OPERATION = "patient_portal.appointment_request.decline"

      Result = Data.define(:request, :appointment, :replayed)

      def self.approve(practice:, actor:, request:, request_key:, starts_at:, ends_at:, site:, room: nil,
        booked_clinician: nil, visit_type:)
        authorize_booking = -> {
          Clinic::Authorization.authorize_with_legacy!(
            actor: actor,
            practice: practice,
            action: "appointments.book",
            legacy_action: "appointments.write",
            site: site
          )
        }
        authorize_source!(practice: practice, actor: actor, request: request)
        authorize_booking.call
        ensure_active_identity!(practice, request)

        outcome = Clinic::Idempotency.execute(
          practice: practice,
          actor: actor,
          operation_code: APPROVE_OPERATION,
          request_key: request_key,
          payload: {
            appointment_request_id: request.id,
            starts_at: starts_at,
            ends_at: ends_at,
            site_id: site.id,
            room_id: room&.id,
            booked_clinician_id: booked_clinician&.id,
            visit_type_id: visit_type.id
          },
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
          reviewer = authorize_booking.call
          ensure_active_identity!(practice, locked_request)
          ensure_pending!(locked_request)

          appointment = Clinic::Scheduling::BookAppointment.call(
            practice: practice,
            actor: actor,
            patient: locked_request.patient,
            starts_at: starts_at,
            ends_at: ends_at,
            site: site,
            room: room,
            booked_clinician: booked_clinician,
            visit_type: visit_type
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

      def self.decline(practice:, actor:, request:, request_key:, reason: nil)
        authorize_booking = -> {
          Clinic::Authorization.authorize_with_legacy!(
            actor: actor,
            practice: practice,
            action: "appointments.book",
            legacy_action: "appointments.write",
            site: request.site
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

      def self.source_site(request)
        request.appointment&.site || request.site
      end
      private_class_method :source_site

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
