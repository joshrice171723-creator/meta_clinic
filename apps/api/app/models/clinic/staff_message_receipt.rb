module Clinic
  class StaffMessageReceipt < ApplicationRecord
    self.table_name = "clinic_staff_message_receipts"
    include TenantScoped
    include Auditable

    belongs_to :message, class_name: "Clinic::StaffMessage"
    belongs_to :recipient_membership, class_name: "Clinic::Membership"

    validate :related_records_belong_to_practice

    private

    def related_records_belong_to_practice
      { message: message, recipient_membership: recipient_membership }.each do |attribute, record|
        errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
      end
    end
  end
end
