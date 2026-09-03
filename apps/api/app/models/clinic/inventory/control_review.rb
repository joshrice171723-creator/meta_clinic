module Clinic
  module Inventory
    class ControlReview < ApplicationRecord
      self.table_name = "clinic_inventory_control_reviews"
      include Clinic::TenantScoped
      include Clinic::AppendOnly
      belongs_to :count, class_name: "Clinic::Inventory::Count"
      belongs_to :actor, class_name: "User"

      def self.record!(count:, actor:, kind:, reason:, request_key:)
        action = kind.to_s == "certification" ? "controlled.certify" : "controlled.count"
        Clinic::Authorization.authorize!(actor: actor, practice: count.practice, action: action)
        transaction do
          existing = find_by(practice_id: count.practice_id, request_key: request_key)
          if existing
            same_intent = existing.count_id == count.id && existing.kind == kind.to_s && existing.actor_id == actor.id && existing.reason == reason
            raise ArgumentError, "This control-review request key was already used for different data." unless same_intent
            return existing
          end
          if kind.to_s == "certification"
            raise ArgumentError, "Resolve the count variance before certification." unless count.reload.approval.present? || count.expected_quantity == count.observed_quantity
            raise ArgumentError, "A separate investigation is required before certification." unless exists?(practice_id: count.practice_id, count_id: count.id, kind: "investigation")
            raise ArgumentError, "Certification requires a separate reviewer." if where(practice_id: count.practice_id, count_id: count.id, kind: "investigation").where(actor_id: actor.id).exists?
          end
          create!(practice_id: count.practice_id, count: count, actor: actor, kind: kind, reason: reason, request_key: request_key)
        end
      end

      def self.investigate!(count:, actor:, reason:, request_key:)
        transaction do
          count.with_lock { count.approve!(actor: actor, request_key: request_key) }
          record!(count: count, actor: actor, kind: "investigation", reason: reason, request_key: request_key)
        end
      end
    end
  end
end
