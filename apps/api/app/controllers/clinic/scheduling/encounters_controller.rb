module Clinic
  module Scheduling
    class EncountersController < Clinic::ApiController
      before_action -> { require_capability("patients.read") }, only: %i[index show completion]
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
        render json: { encounter: serialize_detail(encounter) }
      end

      def assign_room
        patient_id = requested_id!(params[:patient_id], :patient_id)
        encounter = current_practice.encounters.where(patient_id:).find(requested_id!(params[:encounter_id], :encounter_id))
        input = parameter_hash!(:room, %i[room_id request_key])
        updated = Clinic::Scheduling::AssignEncounterRoom.call(
          practice: current_practice, actor: current_user, encounter:,
          room_id: requested_id!(input[:room_id], :room_id), request_key: request_key!(input[:request_key])
        )
        render json: { encounter: serialize_detail(updated) }
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
          started_at: input[:started_at].present? ? time_param!(input[:started_at], field: :started_at) : Current.business_time
        )
        render json: { encounter: serialize_detail(encounter) }, status: :created
      end

      def close
        input = parameter_hash!(:close, %i[
          patient_id ended_at request_key disposition_code instructions_status education_status follow_up_id
          follow_up_version expected_follow_up_state instruction_note_revision_id open_work_reviewed exception_note
        ], arrays: %i[expected_education_event_ids expected_open_task_versions])
        patient_id = requested_id!(input[:patient_id], :patient_id)
        encounter = current_practice.encounters.where(patient_id: patient_id).find(requested_id!(params[:id], :id))
        completion = {
          disposition_code: input[:disposition_code], instructions_status: input[:instructions_status],
          education_status: input[:education_status], follow_up_id: input[:follow_up_id],
          follow_up_version: input[:follow_up_version],
          expected_follow_up_state: input[:expected_follow_up_state],
          instruction_note_revision_id: input[:instruction_note_revision_id],
          expected_education_event_ids: input[:expected_education_event_ids],
          expected_open_task_versions: input[:expected_open_task_versions],
          open_work_reviewed: boolean_param(input[:open_work_reviewed], field: :open_work_reviewed),
          exception_note: input[:exception_note]
        }
        updated = Clinic::Scheduling::CloseEncounter.call(
          encounter: encounter,
          actor: current_user,
          ended_at: input[:ended_at].present? ? time_param!(input[:ended_at], field: :ended_at) : nil,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          completion:
        )
        render json: {
          encounter: serialize_detail(updated),
          completion_review: Clinic::Scheduling::EncounterCompletion.serialize(updated.completion_review)
        }
      end

      def completion
        patient_id = requested_id!(params[:patient_id], :patient_id)
        encounter = current_practice.encounters.where(patient_id:).find(requested_id!(params[:id], :id))
        render json: Clinic::Scheduling::EncounterCompletion.show(
          practice: current_practice, actor: current_user, encounter:
        )
      end

      private

      def find_optional(scope, value, field)
        value.present? ? scope.find(requested_id!(value, field)) : nil
      end

      def request_key!(value)
        key = required_string!(value, field: :request_key, maximum: 160)
        return key if key.match?(Clinic::Idempotency::KEY_PATTERN)

        raise Clinic::Api::RequestParameters::Invalid.new(
          "request_key must match the clinic idempotency key format.", field: :request_key
        )
      end

      def serialize_detail(encounter)
        EncounterSerializer.call(
          encounter,
          detail: true,
          include_note_metadata: current_ability.allowed_permission?("notes.read", site: encounter.site)
        )
      end
    end
  end
end
