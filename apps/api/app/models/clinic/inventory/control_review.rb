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
        transaction do
          practice = Clinic::Practice.lock("FOR SHARE").find(count.practice_id)
          actor = User.lock("FOR SHARE").find(actor.id)
          Clinic::Authorization.authorize!(actor: actor, practice: practice, action: action)
          Clinic::Inventory::Access.retry_lock(practice.id, request_key)
          existing = find_by(practice_id: count.practice_id, request_key: request_key)
          if existing
            same_intent = existing.count_id == count.id && existing.kind == kind.to_s && existing.actor_id == actor.id && existing.reason == reason
            raise ArgumentError, "This control-review request key was already used for different data." unless same_intent
            return existing
          end
          if kind.to_s == "certification"
            if count.count_session_line_id
              line = CountSessionLine.where(practice_id: count.practice_id, batch_id: count.batch_id).find(count.count_session_line_id)
              session = CountSession.where(practice_id: count.practice_id).lock.find(line.count_session_id)
              raise ArgumentError, "A cancelled count session cannot be certified." if session.status == "cancelled"
              latest_event = line.events.where(kind: %w[observed skipped resumed]).order(id: :desc).first
              unless line.counts.maximum(:id) == count.id && latest_event&.kind == "observed" && latest_event.count_id == count.id
                raise ArgumentError, "Certify the latest active observation for this count line."
              end
            end
            PharmacyProduct.lock("FOR SHARE").find(count.batch.product_id)
            count.batch.lock!
            raise ArgumentError, "Certification requires a reviewer other than the counter." if count.actor_id == actor.id
            raise ArgumentError, "Certification is only available for controlled inventory." if count.batch.product.dea_schedule.blank?
            latest_entry_id = count.batch.movements.maximum(:id)
            reconciled = count.batch.quantity == count.observed_quantity &&
              (count.expected_quantity == count.observed_quantity ? count.cutoff_entry_id == latest_entry_id : count.approval&.entry_id == latest_entry_id)
            raise ArgumentError, "Stock moved after this count. Record a new count before certification." unless reconciled
            raise ArgumentError, "Resolve the count variance before certification." unless count.reload.approval.present? || count.expected_quantity == count.observed_quantity
            raise ArgumentError, "A separate investigation is required before certification." unless exists?(practice_id: count.practice_id, count_id: count.id, kind: "investigation")
            raise ArgumentError, "Certification requires a separate reviewer." if where(practice_id: count.practice_id, count_id: count.id, kind: "investigation").where(actor_id: actor.id).exists?
          end
          create!(practice_id: count.practice_id, count: count, actor: actor, kind: kind, reason: reason, request_key: request_key)
        end
      end

      def self.investigate!(count:, actor:, reason:, request_key:)
        transaction do
          count.with_lock { count.approve!(actor: actor, request_key: request_key, controlled: true) }
          record!(count: count, actor: actor, kind: "investigation", reason: reason, request_key: request_key)
        end
      end
    end
  end
end
