module Clinic
  module Inventory
    class Count < ApplicationRecord
      self.table_name = "clinic_inventory_counts"
      include Clinic::TenantScoped
      include Clinic::AppendOnly
      belongs_to :batch, class_name: "Clinic::Inventory::PharmacyBatch"
      belongs_to :actor, class_name: "User"
      belongs_to :profile, class_name: "Clinic::Inventory::Profile"
      has_one :approval, class_name: "Clinic::Inventory::CountApproval", foreign_key: :count_id
      validates :reason, presence: true, length: { maximum: 200 }

      def self.observe!(batch:, actor:, observed:, reason:, request_key:)
        quantity = Clinic::Inventory::Quantity.parse(observed, scale: batch.product.quantity_scale, zero: true)
        Clinic::Inventory::Access.with(batch.practice_id, actor, "count") do |profile|
          Clinic::Inventory::Access.retry_lock(batch.practice_id, request_key)
          batch.with_lock do
            existing = find_by(practice_id: batch.practice_id, request_key: request_key)
            if existing
              raise ArgumentError, "This count form was already used for different data." unless existing.batch_id == batch.id && existing.observed_quantity == quantity && existing.actor_id == actor.id && existing.reason == reason
              return existing
            end
            create!(practice_id: batch.practice_id, batch: batch, actor_id: actor.id, profile_id: profile.id, expected_quantity: batch.quantity, observed_quantity: quantity, cutoff_entry_id: batch.movements.maximum(:id), reason: reason, request_key: request_key)
          end
        end
      end

      def approve!(actor:, request_key: SecureRandom.uuid)
        Clinic::Inventory::Access.with(practice_id, actor, "adjust") do |profile|
          PharmacyProduct.lock("FOR SHARE").find(batch.product_id)
          batch.with_lock do
            return approval if reload.approval
            raise ArgumentError, "Stock moved after this count. Record a new count; the observation is preserved." unless cutoff_entry_id == batch.movements.maximum(:id) && expected_quantity == batch.quantity
            variance = observed_quantity - expected_quantity
            entry = if variance.nonzero?
              batch.movements.create!(practice_id: practice_id, actor_id: actor.id, profile_id: profile.id, count_id: id, kind: "count_correction", quantity: variance, stock_unit: batch.product.stock_unit, reason: reason, request_key: "#{request_key}:movement", occurred_at: Time.current)
            end
            create_approval!(practice_id: practice_id, actor_id: actor.id, entry_id: entry&.id)
          end
        end
      end
    end
  end
end
