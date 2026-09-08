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
        batch_id = positive_id!(batch_id, "stock position")
        amount = Clinic::Inventory::Quantity.parse(quantity, scale: 6)
        transaction do
          practice = Clinic::Practice.lock("FOR SHARE").find(recall.practice_id)
          user = User.lock("FOR SHARE").find(actor.id)
          Clinic::Authorization.authorize!(actor: user, practice: practice, action: "recall.dispose")
          Clinic::Inventory::Access.retry_lock(practice.id, request_key)
          connection = ApplicationRecord.connection
          connection.execute("SELECT set_config('apply.inventory_action', 'recall.dispose', true)")
          existing = find_by(practice_id: practice.id, request_key: request_key)
          if existing
            raise ArgumentError, "This disposition was already used for different data." unless existing.recall_id == recall.id && existing.batch_id == batch_id && existing.quantity == amount && existing.method == method && existing.evidence_reference == evidence_reference && existing.reason == reason && existing.actor_id == actor.id
            return existing
          end
          PharmacyProduct.where(practice_id: practice.id).lock.find(recall.product_id)
          recall = Recall.where(practice_id: practice.id).lock.find(recall.id)
          raise ArgumentError, "This recall case is closed." if recall.closure.present? || recall.status == "closed"
          batch = PharmacyBatch.where(practice_id: practice.id).lock.find(batch_id)
          raise ArgumentError, "The lot is not held for this recall." unless batch.active_holds.where(kind: "recalled", recall_id: recall.id).exists?
          raise ArgumentError, "Disposition exceeds held stock." unless amount <= batch.quantity
          record = create!(practice_id: practice.id, recall: recall, batch: batch, actor: user, quantity: amount, method: method, evidence_reference: evidence_reference, reason: reason, request_key: request_key)
          profile = practice.inventory_profiles.order(version: :desc).first
          batch.movements.create!(practice_id: practice.id, actor: user, profile: profile, recall_disposition: record, kind: "damaged", quantity: -amount, stock_unit: batch.product.stock_unit, reason: "#{reason} · disposition #{record.id} · evidence #{evidence_reference}", request_key: "#{request_key}:movement", occurred_at: Time.current)
          record
        end
      rescue Clinic::Authorization::Denied => error
        raise ArgumentError, error.message
      end

      def self.positive_id!(value, label)
        text = value.to_s
        unless /\A[1-9][0-9]*\z/.match?(text) && text.to_i <= 9_223_372_036_854_775_807
          raise ArgumentError, "Choose a valid #{label}."
        end
        text.to_i
      end
      private_class_method :positive_id!
    end
  end
end
