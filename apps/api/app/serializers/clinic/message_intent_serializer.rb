module Clinic
  module MessageIntentSerializer
    def self.call(intent, detail: false)
      payload = {
        id: intent.id,
        patient_id: intent.patient_id,
        purpose_code: intent.purpose_code,
        request_key: intent.request_key,
        dispatch_state: intent.outbox&.dispatch_state,
        created_at: intent.created_at
      }
      return payload unless detail

      payload.merge(
        attachment_ids: intent.attachments.order(:id).pluck(:document_id),
        delivery_events: intent.delivery_events.order(:id).map { |event|
          { id: event.id, provider_event_reference: event.provider_event_reference, outcome: event.outcome }
        }
      )
    end
  end
end
