module Clinic
  class MessageAttachment < ApplicationRecord
    self.table_name = "clinic_message_attachments"
    include TenantScoped
    include AppendOnly

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :message_intent, class_name: "Clinic::MessageIntent"
    belongs_to :document, class_name: "Clinic::Document"

    validates :patient_id, :message_intent_id, :document_id, presence: true
    validate :resources_share_patient_and_practice

    private

    def resources_share_patient_and_practice
      { message_intent: message_intent, document: document }.each do |attribute, record|
        errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
        errors.add(attribute, "must belong to this patient") if record && record.patient_id != patient_id
      end
    end
  end
end
