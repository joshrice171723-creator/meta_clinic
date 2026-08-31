module Clinic
  module Messaging
    class MessageIntentsController < Clinic::ApiController
      before_action -> { require_capability("patients.read") }, only: %i[index show]
      before_action -> { require_capability("messages.write") }, only: %i[create record_delivery]

      def index
        patient = current_practice.patients.find(requested_id!(params[:patient_id], :patient_id))
        intents = patient.message_intents.includes(:outbox)
        intents = intents.where(purpose_code: required_string!(params[:purpose_code], field: :purpose_code, maximum: 160)) if params[:purpose_code].present?
        paginate(intents, key: :messages, serializer: ->(intent) { MessageIntentSerializer.call(intent) }, order: { created_at: :desc, id: :desc })
      end

      def show
        intent = current_practice.message_intents.includes(:outbox, :attachments, :delivery_events).find(requested_id!(params[:id], :id))
        verify_patient_scope!(intent) if params[:patient_id].present?
        render json: { message: MessageIntentSerializer.call(intent, detail: true) }
      end

      def create
        input = parameter_hash!(:message_intent,
          %i[request_key purpose_code encrypted_recipient_snapshot encrypted_content], arrays: %i[document_ids])
        patient = current_practice.patients.find(requested_id!(params[:patient_id], :patient_id))
        document_ids = Array(input[:document_ids]).map.with_index { |value, index| requested_id!(value, "document_ids[#{index}]") }
        raise Clinic::Api::RequestParameters::Invalid.new("document_ids may contain at most 20 documents.", field: :document_ids) if document_ids.size > 20

        intent = Clinic::Messaging::CreateIntent.call(
          practice: current_practice,
          actor: current_user,
          patient: patient,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 100),
          purpose_code: required_string!(input[:purpose_code], field: :purpose_code, maximum: 160),
          encrypted_recipient_snapshot: required_string!(input[:encrypted_recipient_snapshot], field: :encrypted_recipient_snapshot, maximum: 20_000),
          encrypted_content: required_string!(input[:encrypted_content], field: :encrypted_content, maximum: 100_000),
          document_ids: document_ids
        )
        render json: { message: MessageIntentSerializer.call(intent, detail: true) }, status: :created
      end

      def record_delivery
        input = parameter_hash!(:delivery, %i[provider_event_reference outcome])
        intent = current_practice.message_intents.find(requested_id!(params[:id], :id))
        event = Clinic::Messaging::RecordDelivery.call(
          intent: intent,
          actor: current_user,
          provider_event_reference: required_string!(input[:provider_event_reference], field: :provider_event_reference, maximum: 255),
          outcome: enum_param!(input[:outcome], field: :outcome, allowed: Clinic::Messaging::RecordDelivery::OUTCOMES)
        )
        render json: { delivery_event: {
          id: event.id,
          message_intent_id: event.message_intent_id,
          provider_event_reference: event.provider_event_reference,
          outcome: event.outcome
        } }
      end

      private

      def verify_patient_scope!(intent)
        expected = requested_id!(params[:patient_id], :patient_id)
        raise ActiveRecord::RecordNotFound unless intent.patient_id == expected
      end
    end
  end
end
