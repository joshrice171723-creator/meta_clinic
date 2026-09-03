module Clinic
  module PatientPortal
    class AppointmentRequestsController < BaseController
      def index
        requests = AppointmentRequest.for_practice(portal_practice)
          .where(patient: portal_patient).recent.limit(20)
        render json: { appointment_requests: requests.map { |request| request_payload(request) } }
      end

      def create
        input = parameter_hash!(:appointment_request, %i[request_key starts_at ends_at site_id visit_type_id])
        starts_at = time_param!(input[:starts_at], field: :starts_at)
        ends_at = time_param!(input[:ends_at], field: :ends_at)
        raise ArgumentError, "Appointment requests must start in the future." unless starts_at > Time.current
        raise ArgumentError, "Choose a time window no longer than four hours." if ends_at - starts_at > 4.hours

        request = AppointmentRequest.find_or_initialize_by(practice: portal_practice, request_key: required_string!(input[:request_key], field: :request_key, maximum: 160))
        if request.persisted?
          return render json: { appointment_request: request_payload(request) }, status: :ok if compatible?(request, starts_at:, ends_at:, input:)

          raise ArgumentError, "This request key was already used for different appointment data."
        end

        site = input[:site_id].present? ? portal_practice.sites.find(requested_id!(input[:site_id], :site_id)) : nil
        visit_type = input[:visit_type_id].present? ? portal_practice.visit_types.find(requested_id!(input[:visit_type_id], :visit_type_id)) : nil
        conflict = portal_patient.appointments.where(status: %w[scheduled confirmed])
          .where("starts_at < ? AND ends_at > ?", ends_at, starts_at).exists?
        raise ArgumentError, "That time overlaps an existing appointment." if conflict

        request.assign_attributes(practice: portal_practice, patient: portal_patient,
          identity: patient_portal_identity, starts_at:, ends_at:, site:, visit_type:, requested_at: Time.current, status: :pending)
        request.save!
        record_portal_read("patient_portal.appointment_request.create")
        render json: { appointment_request: request_payload(request) }, status: :created
      end

      private

      def compatible?(request, starts_at:, ends_at:, input:)
        request.patient_id == portal_patient.id && request.starts_at == starts_at && request.ends_at == ends_at &&
          request.site_id.to_s == input[:site_id].to_s && request.visit_type_id.to_s == input[:visit_type_id].to_s
      end

      def request_payload(request)
        {
          id: request.id, request_key: request.request_key, starts_at: request.starts_at.iso8601(6),
          ends_at: request.ends_at.iso8601(6), status: request.status, site: request.site&.code,
          visit_type: request.visit_type&.code, requested_at: request.requested_at.iso8601(6),
          reviewed_at: request.reviewed_at&.iso8601(6)
        }
      end
    end
  end
end
