module Clinic
  module Scheduling
    class EncountersController < Clinic::ApiController
      before_action -> { require_capability("patients.read") }, only: %i[index show]
      # Mutation services authorize the actual site and action.

      def index
        patient_id = params[:patient_id].present? ? requested_id!(params[:patient_id], :patient_id) : nil
        encounters = current_practice.encounters.where(patient_id: patient_id) if patient_id
        encounters ||= current_practice.encounters
        encounters = encounters.where(status: enum_param!(params[:status], field: :status, allowed: %w[open completed])) if params[:status].present?
        encounters = encounters.where(site_id: requested_id!(params[:site_id], :site_id)) if params[:site_id].present?
        paginate(encounters, key: :encounters, serializer: ->(encounter) { EncounterSerializer.call(encounter) }, order: { started_at: :desc, id: :desc })
      end

      def show
        patient_id = requested_id!(params[:patient_id], :patient_id)
        encounter = current_practice.encounters.where(patient_id: patient_id).find(requested_id!(params[:id], :id))
        render json: { encounter: EncounterSerializer.call(encounter, detail: true) }
      end

      def create
        patient_id = params[:patient_id].presence || parameter_hash!(:encounter, %i[patient_id appointment_id started_at site_id room_id])[:patient_id]
        input = params[:encounter].is_a?(ActionController::Parameters) ? parameter_hash!(:encounter, %i[patient_id appointment_id started_at site_id room_id]) : ActionController::Parameters.new
        patient = current_practice.patients.find(requested_id!(patient_id, :patient_id))
        appointment = find_optional(current_practice.appointments, input[:appointment_id], :appointment_id)
        site = find_optional(current_practice.sites, input[:site_id], :site_id)
        room = find_optional(current_practice.rooms, input[:room_id], :room_id)
        encounter = Clinic::Scheduling::CreateEncounter.call(
          practice: current_practice,
          actor: current_user,
          patient: patient,
          appointment: appointment,
          site: site,
          room: room,
          started_at: input[:started_at].present? ? time_param!(input[:started_at], field: :started_at) : Time.current
        )
        render json: { encounter: EncounterSerializer.call(encounter, detail: true) }, status: :created
      end

      def close
        input = parameter_hash!(:close, %i[patient_id ended_at request_key])
        patient_id = requested_id!(input[:patient_id], :patient_id)
        encounter = current_practice.encounters.where(patient_id: patient_id).find(requested_id!(params[:id], :id))
        updated = Clinic::Scheduling::CloseEncounter.call(
          encounter: encounter,
          actor: current_user,
          ended_at: input[:ended_at].present? ? time_param!(input[:ended_at], field: :ended_at) : nil,
          request_key: input[:request_key]
        )
        render json: { encounter: EncounterSerializer.call(updated, detail: true) }
      end

      private

      def find_optional(scope, value, field)
        value.present? ? scope.find(requested_id!(value, field)) : nil
      end
    end
  end
end
