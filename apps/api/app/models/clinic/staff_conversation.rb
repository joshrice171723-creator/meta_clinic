module Clinic
  class StaffConversation < ApplicationRecord
    self.table_name = "clinic_staff_conversations"
    include TenantScoped
    include Auditable

    KINDS = %w[direct team role].freeze
    STATES = %w[active archived locked].freeze
    RETENTION_CLASSES = %w[routine time_sensitive urgent safety_critical].freeze

    belongs_to :site, class_name: "Clinic::Site", optional: true
    belongs_to :created_by_membership, class_name: "Clinic::Membership"
    has_many :members, class_name: "Clinic::StaffConversationMember", foreign_key: :conversation_id, dependent: :restrict_with_error
    has_many :messages, class_name: "Clinic::StaffMessage", foreign_key: :conversation_id, dependent: :restrict_with_error
    has_many :notifications, class_name: "Clinic::StaffNotification", foreign_key: :conversation_id, dependent: :restrict_with_error

    validates :kind, inclusion: { in: KINDS }
    validates :status, inclusion: { in: STATES }
    validates :retention_class, inclusion: { in: RETENTION_CLASSES }
    validate :related_records_belong_to_practice

    scope :active, -> { where(status: "active") }

    private

    def related_records_belong_to_practice
      { site: site, created_by_membership: created_by_membership }.each do |attribute, record|
        errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
      end
    end
  end
end
