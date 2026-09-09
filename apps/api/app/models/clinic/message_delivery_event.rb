module Clinic
  class MessageDeliveryEvent < ApplicationRecord
    self.table_name = "clinic_message_delivery_events"
    include TenantScoped
    include AppendOnly

    belongs_to :message_intent, class_name: "Clinic::MessageIntent"

    validates :provider_event_reference, :outcome, presence: true
    validates :provider_event_reference, uniqueness: { scope: [ :practice_id, :message_intent_id ] }
    validate :intent_belongs_to_practice

    private

    def intent_belongs_to_practice
      errors.add(:message_intent, "must belong to this practice") if message_intent && message_intent.practice_id != practice_id
    end
  end
end
