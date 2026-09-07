module Clinic
  module PatientPortal
    class AppointmentRequestsController < BaseController
      REQUEST_INCLUDES = [ :site, :visit_type, :source_site, :patient,
        { appointment: [ :site, :room, :booked_clinician, :visit_type ] } ].freeze
      APPOINTMENT_INCLUDES = [ :site, :room, :booked_clinician, :visit_type ].freeze

      rescue_from ActiveRecord::StaleObjectError do
        render json: {
          error: "This appointment changed. Reload your appointments before requesting a change.",
          code: "stale_record"
        }, status: :conflict
      end
      rescue_from Clinic::Idempotency::Conflict do |error|
        render json: { error: error.message, code: "request_conflict" }, status: :conflict
      end

      def index
        requests = AppointmentRequest.for_practice(portal_practice)
          .where(patient: portal_patient).includes(*REQUEST_INCLUDES).recent.limit(20)
        record_portal_read("patient_portal.appointment_request.read")
        render json: {
          appointment_requests: requests.map { |request| AppointmentRequestSerializer.call(request) },
          upcoming_appointments: upcoming_appointments.map { |appointment| AppointmentRequestSerializer.appointment(appointment) },
          options: request_options
        }
      end

      def create
        input = parameter_hash!(
          :appointment_request,
          %i[request_key request_kind source_appointment_id source_appointment_updated_at starts_at ends_at site_id visit_type_id]
        )
        request_key = required_string!(input[:request_key], field: :request_key, maximum: 160)
        normalized = normalized_request(input)
        existing = AppointmentRequest.find_by(practice: portal_practice, request_key: request_key)
        return render_existing(existing, normalized:) if existing

        request = AppointmentRequest.transaction do
          source_appointment = appointment_change_source!(normalized)
          validate_request!(normalized, source_appointment)
          site = normalized[:site_id] ? portal_practice.sites.where(status: "active").find(normalized[:site_id]) : nil
          visit_type = normalized[:visit_type_id] ? portal_practice.visit_types.active.find(normalized[:visit_type_id]) : nil
          ensure_no_patient_overlap!(normalized, source_appointment) unless normalized[:request_kind] == "cancel"

          AppointmentRequest.create!(
            practice: portal_practice,
            request_key: request_key,
            request_kind: normalized[:request_kind],
            patient: portal_patient,
            identity: patient_portal_identity,
            starts_at: normalized[:starts_at],
            ends_at: normalized[:ends_at],
            site: site,
            visit_type: visit_type,
            source_appointment: source_appointment,
            source_appointment_updated_at: source_appointment&.updated_at,
            source_starts_at: source_appointment&.starts_at,
            source_ends_at: source_appointment&.ends_at,
            source_site: source_appointment&.site,
            source_status: source_appointment&.status,
            requested_at: Current.business_time,
            status: :pending
          )
        end
        record_portal_read("patient_portal.appointment_request.create")
        render json: { appointment_request: AppointmentRequestSerializer.call(request) }, status: :created
      rescue ActiveRecord::RecordNotUnique
        retry_existing = AppointmentRequest.find_by(practice: portal_practice, request_key: request_key)
        raise unless retry_existing

        render_existing(retry_existing, normalized:)
      end

      private

      def normalized_request(input)
        {
          request_kind: enum_param!(
            input[:request_kind].presence || "new_booking",
            field: :request_kind,
            allowed: AppointmentRequest.request_kinds.keys
          ),
          source_appointment_id: input[:source_appointment_id].present? ?
            integer_id!(input[:source_appointment_id], field: :source_appointment_id) : nil,
          source_appointment_updated_at: input[:source_appointment_updated_at].present? ?
            time_param!(input[:source_appointment_updated_at], field: :source_appointment_updated_at) : nil,
          starts_at: input[:starts_at].present? ? time_param!(input[:starts_at], field: :starts_at) : nil,
          ends_at: input[:ends_at].present? ? time_param!(input[:ends_at], field: :ends_at) : nil,
          site_id: input[:site_id].present? ? integer_id!(input[:site_id], field: :site_id) : nil,
          visit_type_id: input[:visit_type_id].present? ? integer_id!(input[:visit_type_id], field: :visit_type_id) : nil
        }
      end

      def compatible?(request, normalized:)
        request.patient_id == portal_patient.id && request.identity_id == patient_portal_identity&.id &&
          request.request_kind == normalized[:request_kind] &&
          request.source_appointment_id == normalized[:source_appointment_id] &&
          request.source_appointment_updated_at == normalized[:source_appointment_updated_at] &&
          request.starts_at == normalized[:starts_at] && request.ends_at == normalized[:ends_at] &&
          request.site_id == normalized[:site_id] && request.visit_type_id == normalized[:visit_type_id]
      end

      def render_existing(request, normalized:)
        unless compatible?(request, normalized:)
          raise Clinic::Idempotency::Conflict, "This request key was already used for different appointment data."
        end

        render json: { appointment_request: AppointmentRequestSerializer.call(request) }, status: :ok
      end

      def appointment_change_source!(normalized)
        return if normalized[:request_kind] == "new_booking"
        raise ArgumentError, "Choose the appointment to change." unless normalized[:source_appointment_id]
        unless normalized[:source_appointment_updated_at]
          raise ArgumentError, "Reload the appointment before requesting a change."
        end

        source = portal_patient.appointments.lock.includes(:encounter).find(normalized[:source_appointment_id])
        unless source.updated_at == normalized[:source_appointment_updated_at]
          raise ActiveRecord::StaleObjectError.new(source, "request appointment change")
        end
        eligible = %w[scheduled confirmed].include?(source.status) && source.starts_at > Current.business_time && source.encounter.nil?
        unless eligible
          raise ArgumentError, "Only an upcoming scheduled or confirmed appointment that has not started can be changed."
        end

        source
      end

      def validate_request!(normalized, source_appointment)
        if normalized[:request_kind] == "new_booking"
          if source_appointment || normalized[:source_appointment_id] || normalized[:source_appointment_updated_at]
            raise ArgumentError, "A new appointment request cannot include an existing appointment."
          end
        elsif normalized[:site_id] || normalized[:visit_type_id]
          raise ArgumentError, "Location and visit type stay with the existing appointment."
        end

        if normalized[:request_kind] == "cancel"
          if normalized[:starts_at] || normalized[:ends_at]
            raise ArgumentError, "A cancellation request cannot include a preferred time window."
          end
          return
        end

        starts_at = normalized[:starts_at]
        ends_at = normalized[:ends_at]
        raise ArgumentError, "Choose a preferred start and end time." unless starts_at && ends_at
        raise ArgumentError, "Choose an end time after the start time." unless ends_at > starts_at
        raise ArgumentError, "Appointment requests must start in the future." unless starts_at > Current.business_time
        raise ArgumentError, "Choose a time window no longer than four hours." if ends_at - starts_at > 4.hours
      end

      def ensure_no_patient_overlap!(normalized, source_appointment)
        appointments = portal_patient.appointments.where(status: %w[scheduled confirmed])
        appointments = appointments.where.not(id: source_appointment.id) if source_appointment
        conflict = appointments.where(
          "starts_at < ? AND ends_at > ?",
          normalized[:ends_at],
          normalized[:starts_at]
        ).exists?
        raise ArgumentError, "That time overlaps an existing appointment." if conflict
      end

      def upcoming_appointments
        portal_patient.appointments.where(status: %w[scheduled confirmed])
          .where("starts_at > ?", Current.business_time)
          .includes(*APPOINTMENT_INCLUDES)
          .order(:starts_at, :id)
      end

      def request_options
        {
          sites: portal_practice.sites.where(status: "active").order(:code, :id).map do |site|
            AppointmentRequestSerializer.site(site)
          end,
          visit_types: portal_practice.visit_types.active.order(:code, :id).map do |visit_type|
            AppointmentRequestSerializer.visit_type(visit_type)
          end
        }
      end
    end
  end
end
