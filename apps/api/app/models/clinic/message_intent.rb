module Clinic
  class MessageIntent < ApplicationRecord
    self.table_name = "clinic_message_intents"
    include TenantScoped
    include AppendOnly

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    has_one :outbox, class_name: "Clinic::MessageOutbox", dependent: :restrict_with_error
    has_many :attachments, class_name: "Clinic::MessageAttachment", foreign_key: :message_intent_id, dependent: :restrict_with_error
    has_many :delivery_events, class_name: "Clinic::MessageDeliveryEvent", dependent: :restrict_with_error

    validates :request_key, :purpose_code, :encrypted_recipient_snapshot, :encrypted_content, presence: true
    validates :request_key, uniqueness: { scope: :practice_id }
  end
end
