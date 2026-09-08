module Clinic
  class StaffMessageOutbox < ApplicationRecord
    self.table_name = "clinic_staff_message_outbox"
    include TenantScoped
    include Auditable

    STATES = %w[pending in_flight delivered failed].freeze

    belongs_to :message, class_name: "Clinic::StaffMessage"

    validates :event_type, :delivery_state, :available_at, presence: true
    validates :delivery_state, inclusion: { in: STATES }
    validates :attempts, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
    validate :message_belongs_to_practice

    def transition_to!(target)
      target = target.to_s
      raise ArgumentError, "Outbox event cannot transition to #{target}." unless STATES.include?(target)

      update!(delivery_state: target, delivered_at: target == "delivered" ? Time.current : delivered_at)
      self
    end

    private

    def message_belongs_to_practice
      errors.add(:message, "must belong to this practice") if message && message.practice_id != practice_id
    end
  end
end
