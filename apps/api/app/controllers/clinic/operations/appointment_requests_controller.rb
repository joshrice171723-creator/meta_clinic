module Clinic
  module Operations
    class AppointmentRequestsController < Clinic::ApiController
      STATUSES = Clinic::PatientPortal::AppointmentRequest.statuses.keys.freeze
      INCLUDES = [ :patient, :site, :visit_type, :source_site, :source_appointment,
        { appointment: [ :site, :room, :booked_clinician, :visit_type ] } ].freeze

      before_action -> { require_capability("appointments.read", any_site: true) }, only: :index
      before_action -> { require_capability_with_legacy("appointments.book", "appointments.write", any_site: true) },
        only: %i[approve decline]

      def index
        status = enum_param!(params[:status].presence || "pending", field: :status, allowed: STATUSES)
        site_id = params[:site_id].present? ? requested_id!(params[:site_id], :site_id) : nil
        visible = visible_requests(site_id)
        Clinic::PatientPortal::ExpireAppointmentRequests.call(scope: visible, actor: current_user)
        requests = visible.where(status: status).includes(*INCLUDES)
          .order(requested_at: :asc, id: :asc).limit(50)
        render json: {
          appointment_requests: requests.map do |request|
            Clinic::PatientPortal::AppointmentRequestSerializer.call(request, include_patient: true)
          end
        }
      end

      def approve
        request_record = visible_requests(nil).find(requested_id!(params[:id], :id))
        input = parameter_hash!(
          :review,
          %i[request_key starts_at ends_at site_id room_id booked_clinician_id visit_type_id]
        )
        site = find_optional(current_practice.sites, input[:site_id], :site_id)
        visit_type = find_optional(current_practice.visit_types.active, input[:visit_type_id], :visit_type_id)
        result = Clinic::PatientPortal::ReviewAppointmentRequest.approve(
          practice: current_practice,
          actor: current_user,
          request: request_record,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          starts_at: input[:starts_at].present? ? time_param!(input[:starts_at], field: :starts_at) : nil,
          ends_at: input[:ends_at].present? ? time_param!(input[:ends_at], field: :ends_at) : nil,
          site: site,
          room: find_optional(current_practice.rooms, input[:room_id], :room_id),
          booked_clinician: find_optional(current_practice.clinician_profiles, input[:booked_clinician_id], :booked_clinician_id),
          visit_type: visit_type
        )
        render_review(result)
      end

      def decline
        request_record = visible_requests(nil).find(requested_id!(params[:id], :id))
        input = parameter_hash!(:review, %i[request_key reason])
        result = Clinic::PatientPortal::ReviewAppointmentRequest.decline(
          practice: current_practice,
          actor: current_user,
          request: request_record,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          reason: optional_string(input[:reason], field: :reason, maximum: 300)
        )
        render_review(result)
      end

      private

      def visible_requests(site_id)
        requests = current_practice.patient_portal_appointment_requests.left_joins(:appointment)
        if site_id
          site = current_practice.sites.find(site_id)
          Clinic::Authorization.authorize!(
            actor: current_user,
            practice: current_practice,
            action: "appointments.read",
            site: site
          )
          return requests.where(
            "COALESCE(clinic_appointments.site_id, clinic_patient_portal_appointment_requests.source_site_id, " \
              "clinic_patient_portal_appointment_requests.site_id) = ?",
            site.id
          )
        end

        ability = Ability.new(current_user, practice: current_practice)
        return requests if ability.practice_scope_for?("appointments.read")

        allowed_site_ids = ability.accessible_site_ids.select do |candidate_site_id|
          ability.allowed_permission?("appointments.read", site: candidate_site_id)
        end
        requests.where(
          "COALESCE(clinic_appointments.site_id, clinic_patient_portal_appointment_requests.source_site_id, " \
            "clinic_patient_portal_appointment_requests.site_id) IN (?)",
          allowed_site_ids
        )
      end

      def find_optional(scope, value, field)
        value.present? ? scope.find(requested_id!(value, field)) : nil
      end

      def render_review(result)
        request = result.request
        request.reload
        request.association(:patient).load_target
        request.association(:site).load_target
        request.association(:visit_type).load_target
        request.association(:source_site).load_target
        request.association(:appointment).load_target
        render json: {
          appointment_request: Clinic::PatientPortal::AppointmentRequestSerializer.call(request, include_patient: true),
          appointment: Clinic::PatientPortal::AppointmentRequestSerializer.appointment(result.appointment),
          replayed: result.replayed
        }
      end
    end
  end
end
