module Clinic
  class StaffConversationMember < ApplicationRecord
    self.table_name = "clinic_staff_conversation_members"
    include TenantScoped
    include Auditable

    STATES = %w[active removed].freeze
    NOTIFICATION_POLICIES = %w[all muted].freeze

    belongs_to :conversation, class_name: "Clinic::StaffConversation"
    belongs_to :membership, class_name: "Clinic::Membership"
    belongs_to :last_read_message, class_name: "Clinic::StaffMessage", optional: true
    belongs_to :removed_by_membership, class_name: "Clinic::Membership", optional: true

    validates :membership_state, inclusion: { in: STATES }
    validates :notification_policy, inclusion: { in: NOTIFICATION_POLICIES }
    validate :related_records_belong_to_practice

    scope :active, -> { where(membership_state: "active") }

    private

    def related_records_belong_to_practice
      { conversation: conversation, membership: membership, removed_by_membership: removed_by_membership }.each do |attribute, record|
        errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
      end
    end
  end
end
