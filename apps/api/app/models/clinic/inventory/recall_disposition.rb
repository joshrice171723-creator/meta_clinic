module Clinic
  module Inventory
    class RecallDisposition < ApplicationRecord
      self.table_name = "clinic_inventory_recall_dispositions"
      include Clinic::TenantScoped
      include Clinic::AppendOnly
      belongs_to :recall, class_name: "Clinic::Inventory::Recall"
      belongs_to :batch, class_name: "Clinic::Inventory::PharmacyBatch"
      belongs_to :actor, class_name: "User"
      has_many :entries, class_name: "Clinic::Inventory::Entry", dependent: :restrict_with_error

      def self.execute!(recall:, actor:, batch_id:, quantity:, method:, evidence_reference:, reason:, request_key:)
        batch_id = Integer(batch_id.to_s, 10)
        amount = Clinic::Inventory::Quantity.parse(quantity, scale: 6)
        Clinic::Authorization.authorize!(actor: actor, practice: recall.practice, action: "recall.dispose")
        transaction do
          connection = ApplicationRecord.connection
          connection.execute("SELECT set_config('apply.inventory_action', 'recall.dispose', true)")
          existing = find_by(practice_id: recall.practice_id, request_key: request_key)
          if existing
            raise ArgumentError, "This disposition was already used for different data." unless existing.recall_id == recall.id && existing.batch_id == batch_id && existing.quantity == amount && existing.method == method && existing.evidence_reference == evidence_reference && existing.reason == reason && existing.actor_id == actor.id
            return existing
          end
          batch = PharmacyBatch.where(practice_id: recall.practice_id).lock.find(batch_id)
          raise ArgumentError, "The lot is not held for this recall." unless batch.active_holds.where(kind: "recalled").exists?
          raise ArgumentError, "Disposition exceeds held stock." unless amount <= batch.quantity
          record = create!(practice_id: recall.practice_id, recall: recall, batch: batch, actor: actor, quantity: amount, method: method, evidence_reference: evidence_reference, reason: reason, request_key: request_key)
          profile = recall.practice.inventory_profiles.order(version: :desc).first
          batch.movements.create!(practice_id: recall.practice_id, actor: actor, profile: profile, recall_disposition: record, kind: "damaged", quantity: -amount, stock_unit: batch.product.stock_unit, reason: "#{reason} · disposition #{record.id} · evidence #{evidence_reference}", request_key: "#{request_key}:movement", occurred_at: Time.current)
          recall.update!(status: "disposition_complete") if batch.reload.quantity.zero?
          record
        end
      end
    end
  end
end
