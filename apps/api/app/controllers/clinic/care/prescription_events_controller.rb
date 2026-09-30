module Clinic
  module Care
    class PrescriptionEventsController < Clinic::ApiController
      def index
        order = readable_order
        render json: { transmission_available: true, order_encounter_id: order.encounter_id,
          events: PrescriptionWorkflow.events(order).map { |event| PrescriptionWorkflow.serialize(event) },
          lifecycle_requests: PrescriptionResponseWorkflow.requests(order, readable_by: current_user).map { |request| PrescriptionResponseWorkflow.serialize_request(request) },
          response_events: PrescriptionResponseWorkflow.response_events(order, readable_by: current_user).map { |response| PrescriptionResponseWorkflow.serialize_response(response) },
          preparations: PrescriptionPreparationWorkflow.preparations(order).map { |preparation| PrescriptionPreparationWorkflow.serialize(preparation, order:) },
          attempts: PrescriptionTransmissionWorkflow.attempts(order).map { |attempt| PrescriptionTransmissionWorkflow.serialize(attempt) },
          dispenses: MedicationDispensing.records(order).map { |event| MedicationDispensing.serialize(event) },
          remaining_quantity: order.prescribed_quantity && order.quantity_unit.present? ? MedicationDispensing.remaining(order).to_s("F") : nil }
      end

      def create
        order = readable_order
        input = parameter_hash!(:prescription_event, %i[kind source request_key prior_event_id note])
        event = PrescriptionWorkflow.record(practice: current_practice, actor: current_user, order:,
          kind: required_string!(input[:kind], field: :kind, maximum: 32),
          source: required_string!(input[:source], field: :source, maximum: 32),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 100),
          prior_event_id: optional_id(input[:prior_event_id], :prior_event_id),
          note: optional_string(input[:note], field: :note, maximum: 2000))
        render json: { event: PrescriptionWorkflow.serialize(event) }, status: :created
      end

      def prepare
        order = readable_order
        input = parameter_hash!(:prescription_preparation, %i[pharmacy_destination_id request_key mode signer_state reviewer_state])
        preparation = PrescriptionPreparationWorkflow.prepare(practice: current_practice, actor: current_user, order:,
          pharmacy_destination_id: requested_id!(input[:pharmacy_destination_id], :pharmacy_destination_id),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 100),
          mode: input[:mode], signer_state: input[:signer_state], reviewer_state: input[:reviewer_state])
        render json: { preparation: PrescriptionPreparationWorkflow.serialize(preparation, order:) }, status: :created
      end

      def submit
        order = readable_order
        input = parameter_hash!(:prescription_submission, %i[preparation_id pharmacy_destination_id scenario request_key mode signer_state reviewer_state])
        attempt = PrescriptionTransmissionWorkflow.submit(practice: current_practice, actor: current_user, order:,
          pharmacy_destination_id: requested_id!(input[:pharmacy_destination_id], :pharmacy_destination_id),
          preparation_id: optional_id(input[:preparation_id], :preparation_id),
          scenario: required_string!(input[:scenario], field: :scenario, maximum: 32),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 100),
          mode: input[:mode], signer_state: input[:signer_state], reviewer_state: input[:reviewer_state])
        render json: { attempt: PrescriptionTransmissionWorkflow.serialize(attempt) }, status: :created
      end

      def lifecycle_request
        order = readable_order
        input = parameter_hash!(:prescription_lifecycle_request, %i[attempt_id action request_key])
        record = PrescriptionResponseWorkflow.request(practice: current_practice, actor: current_user, order:,
          attempt_id: requested_id!(input[:attempt_id], :attempt_id),
          action: required_string!(input[:action], field: :action, maximum: 32),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 100))
        render json: { lifecycle_request: PrescriptionResponseWorkflow.serialize_request(record) }, status: :created
      end

      def simulate_response
        order = readable_order
        input = parameter_hash!(:prescription_response, %i[attempt_id lifecycle_request_id scenario request_key])
        response = PrescriptionResponseWorkflow.receive(practice: current_practice, actor: current_user, order:,
          attempt_id: requested_id!(input[:attempt_id], :attempt_id),
          lifecycle_request_id: optional_id(input[:lifecycle_request_id], :lifecycle_request_id),
          scenario: required_string!(input[:scenario], field: :scenario, maximum: 32),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 100))
        render json: { response_event: PrescriptionResponseWorkflow.serialize_response(response) }, status: :created
      end

      def dispense
        order = readable_order
        input = parameter_hash!(:dispense, %i[status request_key handed_over_at quantity batch_id original_dispense_id reason])
        record = MedicationDispensing.record(practice: current_practice, actor: current_user, order:,
          status: required_string!(input[:status], field: :status, maximum: 24),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 100),
          handed_over_at: required_string!(input[:handed_over_at], field: :handed_over_at, maximum: 80),
          quantity: input[:quantity], batch_id: optional_id(input[:batch_id], :batch_id),
          original_dispense_id: optional_id(input[:original_dispense_id], :original_dispense_id),
          reason: optional_string(input[:reason], field: :reason, maximum: 2000))
        render json: { dispense: MedicationDispensing.serialize(record) }, status: :created
      end

      private

      def readable_order
        patient = current_practice.patients.accessible_by(current_ability, :read).find(requested_id!(params[:patient_id], :patient_id))
        order = MedicationRequestRevision.where(practice: current_practice, patient:).find(requested_id!(params[:medication_request_id], :medication_request_id))
        Clinic::Authorization.authorize!(actor: current_user, practice: current_practice, action: "clinical_records.read", site: order.site)
        order
      end
    end
  end
end
