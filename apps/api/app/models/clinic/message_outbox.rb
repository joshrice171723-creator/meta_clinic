module Clinic
  class MessageOutbox < ApplicationRecord
    self.table_name = "clinic_message_outbox"
    include TenantScoped
    include Auditable

    belongs_to :message_intent, class_name: "Clinic::MessageIntent"

    STATES = {
      "pending" => %w[in_flight delivered failed unknown],
      "in_flight" => %w[delivered failed unknown],
      "failed" => %w[in_flight],
      "unknown" => %w[in_flight delivered],
      "delivered" => []
    }.freeze

    validates :dispatch_state, presence: true
    validates :lock_version, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
    validate :intent_belongs_to_practice

    def transition_to!(target)
      target = target.to_s
      allowed = STATES.fetch(dispatch_state) { [] }
      raise ArgumentError, "Message cannot transition from #{dispatch_state}." unless allowed.include?(target)

      update!(dispatch_state: target)
      self
    end

    private

    def intent_belongs_to_practice
      errors.add(:message_intent, "must belong to this practice") if message_intent && message_intent.practice_id != practice_id
    end
  end
end
