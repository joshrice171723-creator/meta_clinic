module Clinic
  module Scheduling
    class AppointmentsController < Clinic::ApiController
      before_action -> { require_capability_with_legacy("appointments.read", "patients.read", any_site: true) }, only: :index
      # Mutation services authorize the actual site and action.

      def index
        appointments = atomic_appointment_reads? ? current_practice.appointments.accessible_by(current_ability, :read) : current_practice.appointments
        appointments = appointments.where(patient_id: requested_id!(params[:patient_id], :patient_id)) if params[:patient_id].present?
        site = if params[:site_id].present?
          current_practice.sites.find(requested_id!(params[:site_id], :site_id))
        end
        appointments = appointments.where(site_id: site.id) if site
        if params[:date].present?
          date = date_param!(params[:date], field: :date)
          zone = appointment_timezone(site)
          raise ArgumentError, "The clinic timezone is unavailable." unless zone

          appointments = appointments.where(starts_at: zone.local(date.year, date.month, date.day)...zone.local(date.next_day.year, date.next_day.month, date.next_day.day))
        end
        appointments = appointments.where(booked_clinician_id: requested_id!(params[:booked_clinician_id], :booked_clinician_id)) if params[:booked_clinician_id].present?
        appointments = appointments.where(status: %w[scheduled confirmed]).where("starts_at >= ?", Current.business_time) if params[:upcoming] == "true"
        appointments = appointments.where(status: enum_param!(params[:status], field: :status, allowed: Clinic::Appointment::TRANSITIONS.keys)) if params[:status].present?
        if params.key?(:from_date) || params.key?(:through_date)
          from_date = date_param!(params[:from_date], field: :from_date)
          through_date = date_param!(params[:through_date], field: :through_date)
          if through_date < from_date
            raise Clinic::Api::RequestParameters::Invalid.new("through_date must be on or after from_date.", field: :through_date)
          end
          zone = appointment_timezone(site)
          raise ArgumentError, "The clinic timezone is unavailable." unless zone

          next_date = through_date.next_day
          appointments = appointments.where(starts_at: zone.local(from_date.year, from_date.month, from_date.day)...zone.local(next_date.year, next_date.month, next_date.day))
        end
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
        paginate(appointments.includes(:encounter, :room, { telehealth_visit: [ :policy_version, :current_room_attempt, :participants ] },
          patient: :communication_endpoints), key: :appointments,
          serializer: ->(appointment) { AppointmentSerializer.call(appointment, actor: current_user) }, order: { starts_at: :asc, id: :asc })
      end

      def show
        appointment_scope = atomic_appointment_reads? ? current_practice.appointments.accessible_by(current_ability, :read) : current_practice.appointments
        appointment = appointment_scope.includes(:encounter, :room, :patient,
          telehealth_visit: [ :policy_version, :current_room_attempt, :participants ]).find(requested_id!(params[:id], :id))
        require_capability_with_legacy("appointments.read", "patients.read", site: appointment.site)
        render json: { appointment: AppointmentSerializer.call(appointment, actor: current_user) }
      end

      def create
        input = parameter_hash!(:appointment, %i[patient_id starts_at ends_at site_id room_id booked_clinician_id visit_type_id service_offering_id schedule_hold_id reason request_key visit_modality overbook_reason expected_policy_revision])
        patient = current_practice.patients.find(requested_id!(input[:patient_id], :patient_id))
        site = find_optional(current_practice.sites, input[:site_id], :site_id)
        room = find_optional(current_practice.rooms, input[:room_id], :room_id)
        clinician = find_optional(current_practice.clinician_profiles, input[:booked_clinician_id], :booked_clinician_id)
        visit_type = find_optional(current_practice.visit_types, input[:visit_type_id], :visit_type_id)
        request_key = input[:request_key].presence && required_string!(input[:request_key], field: :request_key, maximum: 160)
        appointment = Clinic::Scheduling::BookAppointment.call(
          practice: current_practice,
          actor: current_user,
          patient: patient,
          site: site,
          room: room,
          booked_clinician: clinician,
          visit_type: visit_type,
          service_offering: find_optional(current_practice.service_offerings, input[:service_offering_id], :service_offering_id),
          schedule_hold: find_optional(Clinic::Scheduling::ScheduleHold.where(practice: current_practice), input[:schedule_hold_id], :schedule_hold_id),
          reason: optional_string(input[:reason], field: :reason, maximum: 500),
          starts_at: time_param!(input[:starts_at], field: :starts_at),
          ends_at: time_param!(input[:ends_at], field: :ends_at),
          request_key: request_key,
          visit_modality: input[:visit_modality].presence || "in_person",
          overbook_reason: optional_string(input[:overbook_reason], field: :overbook_reason, maximum: 500),
          expected_policy_revision: input[:expected_policy_revision].present? ? Integer(input[:expected_policy_revision].to_s, 10) : nil
        )
        render json: { appointment: AppointmentSerializer.call(appointment, actor: current_user), request_key: request_key }, status: :created
      end

      def transition
        input = parameter_hash!(:transition, %i[to expected_status cancellation_message_acknowledged])
        appointment = current_practice.appointments.find(requested_id!(params[:id], :id))
        previous_status = appointment.status
        target = enum_param!(input[:to], field: :to, allowed: Clinic::Appointment::TRANSITIONS.keys)
        if target == "cancelled" && input[:cancellation_message_acknowledged] != true
          raise ArgumentError, "Confirm that no cancellation message will be sent automatically before cancelling this appointment."
        end
        updated = Clinic::Scheduling::TransitionAppointment.call(
          appointment: appointment,
          actor: current_user,
          to: target,
          expected_status: input[:expected_status].presence && enum_param!(input[:expected_status], field: :expected_status, allowed: Clinic::Appointment::TRANSITIONS.keys)
        )
        render json: {
          appointment: AppointmentSerializer.call(updated, actor: current_user),
          transition: { from: previous_status, to: target, changed_at: updated.updated_at.iso8601(6) }
        }
      end

      def update
        input = parameter_hash!(:appointment, %i[starts_at ends_at site_id room_id booked_clinician_id visit_type_id service_offering_id expected_updated_at request_key visit_modality])
        appointment = current_practice.appointments.find(requested_id!(params[:id], :id))
        request_key = required_string!(input[:request_key], field: :request_key, maximum: 160)
        updated = Clinic::Scheduling::RescheduleAppointment.call(
          appointment: appointment, actor: current_user,
          starts_at: time_param!(input[:starts_at], field: :starts_at),
          ends_at: time_param!(input[:ends_at], field: :ends_at),
          expected_updated_at: time_param!(input[:expected_updated_at], field: :expected_updated_at),
          request_key: request_key,
          visit_modality: input[:visit_modality],
          site: input.key?(:site_id) ? find_optional(current_practice.sites, input[:site_id], :site_id) : Clinic::Scheduling::RescheduleAppointment::UNCHANGED,
          room: input.key?(:room_id) ? find_optional(current_practice.rooms, input[:room_id], :room_id) : Clinic::Scheduling::RescheduleAppointment::UNCHANGED,
          booked_clinician: input.key?(:booked_clinician_id) ? find_optional(current_practice.clinician_profiles, input[:booked_clinician_id], :booked_clinician_id) : Clinic::Scheduling::RescheduleAppointment::UNCHANGED,
          visit_type: input.key?(:visit_type_id) ? find_optional(current_practice.visit_types, input[:visit_type_id], :visit_type_id) : Clinic::Scheduling::RescheduleAppointment::UNCHANGED,
          service_offering: input.key?(:service_offering_id) ? find_optional(current_practice.service_offerings, input[:service_offering_id], :service_offering_id) : Clinic::Scheduling::RescheduleAppointment::UNCHANGED
        )
        render json: { appointment: AppointmentSerializer.call(updated, actor: current_user), request_key: request_key }
      end

      private

      def appointment_timezone(site)
        ActiveSupport::TimeZone[site&.timezone_override.presence || current_practice.timezone]
      end

      def find_optional(scope, value, field)
        value.present? ? scope.find(requested_id!(value, field)) : nil
      end

      def atomic_appointment_reads?
        current_ability.allowed_permission?("appointments.read", any_site: true)
      end
    end
  end
end
