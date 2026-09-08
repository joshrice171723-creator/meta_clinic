module Clinic
  class StaffMessage < ApplicationRecord
    self.table_name = "clinic_staff_messages"
    include TenantScoped
    include Auditable

    CLASSES = %w[routine time_sensitive urgent safety_critical].freeze
    STATES = %w[active retracted expired].freeze

    belongs_to :conversation, class_name: "Clinic::StaffConversation"
    belongs_to :sender_membership, class_name: "Clinic::Membership"
    belongs_to :reply_to_message, class_name: "Clinic::StaffMessage", optional: true
    belongs_to :acknowledged_by_membership, class_name: "Clinic::Membership", optional: true
    has_many :receipts, class_name: "Clinic::StaffMessageReceipt", foreign_key: :message_id, dependent: :restrict_with_error
    has_one :request, class_name: "Clinic::StaffMessageRequest", foreign_key: :message_id, dependent: :restrict_with_error
    has_many :escalations, class_name: "Clinic::StaffMessageEscalation", foreign_key: :message_id, dependent: :restrict_with_error
    has_many :attachments, class_name: "Clinic::StaffMessageAttachment", foreign_key: :message_id, dependent: :restrict_with_error
    has_many :notifications, class_name: "Clinic::StaffNotification", foreign_key: :message_id, dependent: :restrict_with_error
    has_many :outbox_events, class_name: "Clinic::StaffMessageOutbox", foreign_key: :message_id, dependent: :restrict_with_error

    encrypts :body

    validates :body, presence: true, length: { maximum: 10_000 }
    validates :message_class, inclusion: { in: CLASSES }
    validates :status, inclusion: { in: STATES }
    validates :request_key, presence: true, length: { maximum: 160 }
    validate :related_records_belong_to_practice

    private

    def related_records_belong_to_practice
      { conversation: conversation, sender_membership: sender_membership, reply_to_message: reply_to_message,
        acknowledged_by_membership: acknowledged_by_membership }.each do |attribute, record|
        errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
      end
    end
  end
end
