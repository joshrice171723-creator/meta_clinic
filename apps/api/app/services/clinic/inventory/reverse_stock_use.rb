module Clinic
  module Inventory
    class ReverseStockUse
      def self.call(practice:, actor:, original_entry_id:, batch:, reason:, request_key:)
        Access.with(practice.id, actor, "adjust") do
          Access.retry_lock(practice.id, request_key)
          original = PharmacyMovement.where(practice_id: practice.id).lock.find(original_entry_id)
          raise ArgumentError, "Only an eligible stock-removal adjustment can be reversed here." unless
            original.kind == "adjustment_out" && original.batch_id == batch.id &&
            original.transfer_id.nil? && original.recall_disposition_id.nil? &&
            original.medication_administration_movement.nil? &&
            !Clinic::Care::MedicationDispense.exists?(practice_id: practice.id, inventory_entry_id: original.id)
          batch.lock!

          existing = PharmacyMovement.find_by(practice_id: practice.id, request_key: request_key)
          if existing
            raise ArgumentError, "This reversal request was used for different data." unless
              existing.reverses_entry_id == original.id && existing.batch_id == batch.id &&
              existing.actor_id == actor.id && existing.reason == reason
            return existing
          end
          raise ArgumentError, "This stock use has already been reversed." if
            PharmacyMovement.exists?(practice_id: practice.id, reverses_entry_id: original.id)
          raise ArgumentError, "The lot is unavailable; resolve its hold or expiry before restoring stock." unless batch.available?

          batch.move!(kind: "adjustment_in", amount: original.quantity.abs, reason: reason,
            actor: actor, request_key: request_key, reverses_entry_id: original.id)
        end
      end
    end
  end
end
