module Clinic
  module PatientPortal
    class AppointmentRequestsController < BaseController
      REQUEST_INCLUDES = [ :site, :visit_type, :patient,
        { appointment: [ :site, :room, :booked_clinician, :visit_type ] } ].freeze

      def index
        requests = AppointmentRequest.for_practice(portal_practice)
          .where(patient: portal_patient).includes(*REQUEST_INCLUDES).recent.limit(20)
        record_portal_read("patient_portal.appointment_request.read")
        render json: {
          appointment_requests: requests.map { |request| AppointmentRequestSerializer.call(request) },
          options: request_options
        }
      end

      def create
        input = parameter_hash!(:appointment_request, %i[request_key starts_at ends_at site_id visit_type_id])
        request_key = required_string!(input[:request_key], field: :request_key, maximum: 160)
        starts_at = time_param!(input[:starts_at], field: :starts_at)
        ends_at = time_param!(input[:ends_at], field: :ends_at)
        existing = AppointmentRequest.find_by(practice: portal_practice, request_key: request_key)
        return render_existing(existing, starts_at:, ends_at:, input:) if existing

        raise ArgumentError, "Appointment requests must start in the future." unless starts_at > Current.business_time
        raise ArgumentError, "Choose a time window no longer than four hours." if ends_at - starts_at > 4.hours

        site = input[:site_id].present? ? portal_practice.sites.where(status: "active").find(integer_id!(input[:site_id], field: :site_id)) : nil
        visit_type = input[:visit_type_id].present? ? portal_practice.visit_types.active.find(integer_id!(input[:visit_type_id], field: :visit_type_id)) : nil
        conflict = portal_patient.appointments.where(status: %w[scheduled confirmed])
          .where("starts_at < ? AND ends_at > ?", ends_at, starts_at).exists?
        raise ArgumentError, "That time overlaps an existing appointment." if conflict

        request = AppointmentRequest.new(practice: portal_practice, request_key: request_key, patient: portal_patient,
          identity: patient_portal_identity, starts_at:, ends_at:, site:, visit_type:, requested_at: Current.business_time, status: :pending)
        request.save!
        record_portal_read("patient_portal.appointment_request.create")
        render json: { appointment_request: AppointmentRequestSerializer.call(request) }, status: :created
      rescue ActiveRecord::RecordNotUnique
        retry_existing = AppointmentRequest.find_by!(practice: portal_practice, request_key: request_key)
        render_existing(retry_existing, starts_at:, ends_at:, input:)
      end

      private

      def compatible?(request, starts_at:, ends_at:, input:)
        request.patient_id == portal_patient.id && request.identity_id == patient_portal_identity&.id &&
          request.starts_at == starts_at && request.ends_at == ends_at &&
          request.site_id.to_s == input[:site_id].to_s && request.visit_type_id.to_s == input[:visit_type_id].to_s
      end

      def render_existing(request, starts_at:, ends_at:, input:)
        unless compatible?(request, starts_at:, ends_at:, input:)
          raise ArgumentError, "This request key was already used for different appointment data."
        end

        render json: { appointment_request: AppointmentRequestSerializer.call(request) }, status: :ok
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
