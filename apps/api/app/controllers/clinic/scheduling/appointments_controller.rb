module Clinic
  module Scheduling
    class AppointmentsController < Clinic::ApiController
      before_action -> { require_capability_with_legacy("appointments.read", "patients.read", any_site: true) }, only: :index
      # Mutation services authorize the actual site and action.

      def index
        appointments = atomic_appointment_reads? ? current_practice.appointments.accessible_by(current_ability, :read) : current_practice.appointments
        appointments = appointments.where(patient_id: requested_id!(params[:patient_id], :patient_id)) if params[:patient_id].present?
        appointments = appointments.where(site_id: requested_id!(params[:site_id], :site_id)) if params[:site_id].present?
        appointments = appointments.where(booked_clinician_id: requested_id!(params[:booked_clinician_id], :booked_clinician_id)) if params[:booked_clinician_id].present?
        appointments = appointments.where(status: %w[scheduled confirmed]).where("starts_at >= ?", Current.business_time) if params[:upcoming] == "true"
        appointments = appointments.where(status: enum_param!(params[:status], field: :status, allowed: Clinic::Appointment::TRANSITIONS.keys)) if params[:status].present?
        appointments = appointments.where("starts_at >= ?", time_param!(params[:from], field: :from)) if params[:from].present?
        appointments = appointments.where("starts_at < ?", time_param!(params[:to], field: :to)) if params[:to].present?
        if params[:q].present?
          matching_patients = Clinic::Care::PatientNameSearch.search(
            scope: current_practice.patients,
            practice_id: current_practice.id,
            query: query_param
          )
          appointments = appointments.where(patient_id: matching_patients.select(:id))
        end
        paginate(appointments.includes(:encounter, patient: :communication_endpoints), key: :appointments,
          serializer: ->(appointment) { AppointmentSerializer.call(appointment) }, order: { starts_at: :asc, id: :asc })
      end

      def show
        appointment_scope = atomic_appointment_reads? ? current_practice.appointments.accessible_by(current_ability, :read) : current_practice.appointments
        appointment = appointment_scope.includes(:encounter, :patient).find(requested_id!(params[:id], :id))
        require_capability_with_legacy("appointments.read", "patients.read", site: appointment.site)
        render json: { appointment: AppointmentSerializer.call(appointment) }
      end

      def create
        input = parameter_hash!(:appointment, %i[patient_id starts_at ends_at site_id room_id booked_clinician_id visit_type_id])
        patient = current_practice.patients.find(requested_id!(input[:patient_id], :patient_id))
        site = find_optional(current_practice.sites, input[:site_id], :site_id)
        room = find_optional(current_practice.rooms, input[:room_id], :room_id)
        clinician = find_optional(current_practice.clinician_profiles, input[:booked_clinician_id], :booked_clinician_id)
        visit_type = find_optional(current_practice.visit_types, input[:visit_type_id], :visit_type_id)
        appointment = Clinic::Scheduling::BookAppointment.call(
          practice: current_practice,
          actor: current_user,
          patient: patient,
          site: site,
          room: room,
          booked_clinician: clinician,
          visit_type: visit_type,
          starts_at: time_param!(input[:starts_at], field: :starts_at),
          ends_at: time_param!(input[:ends_at], field: :ends_at)
        )
        render json: { appointment: AppointmentSerializer.call(appointment) }, status: :created
      end

      def transition
        input = parameter_hash!(:transition, %i[to])
        appointment = current_practice.appointments.find(requested_id!(params[:id], :id))
        updated = Clinic::Scheduling::TransitionAppointment.call(
          appointment: appointment,
          actor: current_user,
          to: enum_param!(input[:to], field: :to, allowed: Clinic::Appointment::TRANSITIONS.fetch(appointment.status, []))
        )
        render json: { appointment: AppointmentSerializer.call(updated) }
      end

      private

      def find_optional(scope, value, field)
        value.present? ? scope.find(requested_id!(value, field)) : nil
      end

      def atomic_appointment_reads?
        current_ability.allowed_permission?("appointments.read", any_site: true)
      end
    end
  end
end
