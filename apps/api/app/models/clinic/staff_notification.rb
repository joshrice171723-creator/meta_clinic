module Clinic
  class StaffNotification < ApplicationRecord
    self.table_name = "clinic_staff_notifications"
    include TenantScoped
    include Auditable

    belongs_to :recipient_membership, class_name: "Clinic::Membership"
    belongs_to :conversation, class_name: "Clinic::StaffConversation"
    belongs_to :message, class_name: "Clinic::StaffMessage", optional: true

    validates :category, :title, presence: true
    validate :related_records_belong_to_practice

    scope :unread, -> { where(read_at: nil) }
    scope :recent, -> { order(created_at: :desc, id: :desc) }

    private

    def related_records_belong_to_practice
      { recipient_membership: recipient_membership, conversation: conversation, message: message }.each do |attribute, record|
        errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
      end
    end
  end
end
