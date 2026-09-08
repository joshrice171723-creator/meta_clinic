module Clinic
  class StaffMessageEscalation < ApplicationRecord
    self.table_name = "clinic_staff_message_escalations"
    include TenantScoped
    include Auditable

    belongs_to :message, class_name: "Clinic::StaffMessage"
    belongs_to :request, class_name: "Clinic::StaffMessageRequest"
    belongs_to :target_membership, class_name: "Clinic::Membership"

    validates :level, numericality: { only_integer: true, greater_than: 0 }
    validates :trigger, :dedupe_key, presence: true
    validate :related_records_belong_to_practice

    private

    def related_records_belong_to_practice
      { message: message, request: request, target_membership: target_membership }.each do |attribute, record|
        errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
      end
    end
  end
end
