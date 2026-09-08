module Clinic
  class AuditDeliveryReceipt < ApplicationRecord
    self.table_name = "clinic_audit_delivery_receipts"
    include TenantScoped
    include AppendOnly

    belongs_to :audit_event, class_name: "Clinic::AuditEvent"
    validates :sink_receipt_reference, :acknowledged_at, presence: true
    validate :event_belongs_to_practice

    private

    def event_belongs_to_practice
      errors.add(:audit_event, "must belong to this practice") if audit_event && audit_event.practice_id != practice_id
    end
  end
end
