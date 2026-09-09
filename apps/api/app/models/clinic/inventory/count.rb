module Clinic
  module Inventory
    class Count < ApplicationRecord
      self.table_name = "clinic_inventory_counts"
      include Clinic::TenantScoped
      include Clinic::AppendOnly
      belongs_to :batch, class_name: "Clinic::Inventory::PharmacyBatch"
      belongs_to :actor, class_name: "User"
      belongs_to :profile, class_name: "Clinic::Inventory::Profile"
      belongs_to :count_session_line, class_name: "Clinic::Inventory::CountSessionLine", optional: true
      has_one :approval, class_name: "Clinic::Inventory::CountApproval", foreign_key: :count_id
      validates :reason, presence: true, length: { maximum: 200 }

      def self.observe!(batch:, actor:, observed:, reason:, request_key:, session_line: nil)
        quantity = Clinic::Inventory::Quantity.parse(observed, scale: batch.product.quantity_scale, zero: true)
        Clinic::Inventory::Access.with(batch.practice_id, actor, "count") do |profile|
          Clinic::Inventory::Access.retry_lock(batch.practice_id, request_key)
          if session_line
            session_line = CountSessionLine.where(practice_id: batch.practice_id, batch_id: batch.id).find(session_line.id)
          end
          existing = find_by(practice_id: batch.practice_id, request_key: request_key)
          if existing
            same_intent = existing.batch_id == batch.id && existing.count_session_line_id == session_line&.id &&
              existing.observed_quantity == quantity && existing.actor_id == actor.id && existing.reason == reason
            raise ArgumentError, "This count form was already used for different data." unless same_intent
            return existing
          end
          if session_line
            session = CountSession.where(practice_id: batch.practice_id).lock.find(session_line.count_session_id)
            raise ArgumentError, "This count session is no longer open." unless session.status == "open"
            raise ArgumentError, "Only the assigned counter can record this session." unless session.assignee_id == actor.id
            latest = session_line.events.where(kind: %w[observed skipped resumed]).order(id: :desc).first
            raise ArgumentError, "Resume this skipped count line before recording another observation." if latest&.kind == "skipped"
          end
          PharmacyProduct.lock("FOR SHARE").find(batch.product_id)
          batch.with_lock do
            create!(practice_id: batch.practice_id, batch: batch, count_session_line: session_line,
              actor_id: actor.id, profile_id: profile.id, expected_quantity: batch.quantity,
              observed_quantity: quantity, cutoff_entry_id: batch.movements.maximum(:id), reason: reason, request_key: request_key)
          end
        end
      end

      def approve!(actor:, request_key: SecureRandom.uuid, controlled: false)
        Clinic::Inventory::Access.with(practice_id, actor, "count") do |profile|
          Clinic::Inventory::Access.retry_lock(practice_id, request_key)
          return approval if reload.approval
          if count_session_line_id
            line = CountSessionLine.where(practice_id: practice_id, batch_id: batch_id).find(count_session_line_id)
            session = CountSession.where(practice_id: practice_id).lock.find(line.count_session_id)
            can_approve = session.status == "open" ||
              (session.status == "completed" && expected_quantity == observed_quantity)
            raise ArgumentError, "This count session no longer accepts this approval." unless can_approve
            latest_count_id = line.counts.maximum(:id)
            latest_event = line.events.where(kind: %w[observed skipped resumed]).order(id: :desc).first
            unless latest_count_id == id && latest_event&.kind == "observed" && latest_event.count_id == id
              raise ArgumentError, "Approve the latest active observation for this count line."
            end
          end
          PharmacyProduct.lock("FOR SHARE").find(batch.product_id)
          raise ArgumentError, "Controlled review requires controlled inventory." if controlled && batch.product.reload.dea_schedule.blank?
          batch.with_lock do
            return approval if reload.approval
            raise ArgumentError, "A count requires approval from someone other than its counter." if actor_id == actor.id
            raise ArgumentError, "Stock moved after this count. Record a new count; the observation is preserved." unless cutoff_entry_id == batch.movements.maximum(:id) && expected_quantity == batch.quantity
            variance = observed_quantity - expected_quantity
            entry = if variance.nonzero?
              Clinic::Authorization.authorize!(actor: actor, practice: practice, action: "inventory.adjust")
              batch.movements.create!(practice_id: practice_id, actor_id: actor.id, profile_id: profile.id, count_id: id, kind: "count_correction", quantity: variance, stock_unit: batch.product.stock_unit, reason: reason, request_key: "#{request_key}:movement", occurred_at: Time.current)
            end
            create_approval!(practice_id: practice_id, actor_id: actor.id, entry_id: entry&.id)
          end
        end
      end
    end
  end
end
