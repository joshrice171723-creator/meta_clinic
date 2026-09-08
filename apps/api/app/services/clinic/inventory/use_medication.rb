module Clinic
  module Inventory
    class UseMedication
      def self.call(practice:, actor:, product_id:, quantity_requested:, request_key:, reason:, occurred_at: Current.business_time)
        Access.with(practice.id, actor, "adjust") do |profile|
          key = request_key.to_s
          normalized_reason = reason.to_s.strip
          Access.retry_lock(practice.id, key)
          product = PharmacyProduct.where(practice_id: practice.id).lock.find(product_id)
          raise ArgumentError, "Only medication catalog items can be consumed through medication use." unless product.category == "medication"
          quantity = Quantity.parse(quantity_requested, scale: product.quantity_scale)
          raise ArgumentError, "Provide a reason for medication use." if normalized_reason.empty?
          raise ArgumentError, "Keep the medication-use reason within 200 characters." if normalized_reason.length > 200

          key_prefix = medication_use_key_prefix(key)
          existing = exact_movements(practice.id, key_prefix)
          existing = exact_movements(practice.id, key) if existing.empty?
          if existing.any?
            same_request = existing.all? do |movement|
              movement.kind == "adjustment_out" && movement.actor_id == actor.id &&
                movement.reason == normalized_reason && movement.batch.product_id == product.id
            end
            same_request &&= existing.sum { |movement| movement.quantity.abs } == quantity
            raise ArgumentError, "This medication-use request was already used for different data." unless same_request

            return { product_id: product.id, quantity: quantity,
              allocations: existing.map { |movement| { batch_id: movement.batch_id, quantity: movement.quantity.abs,
                movement_id: movement.id } } }
          end

          batches = PharmacyBatch.where(practice_id: practice.id, product_id: product.id).usable(practice.inventory_date)
            .where("clinic_pharmacy_batches.on_hand > 0").joins(:lot)
            .order("clinic_inventory_lots.expires_on ASC, clinic_pharmacy_batches.id ASC").lock.to_a
          available = batches.sum { |batch| batch.quantity.to_d }
          raise ArgumentError, "Insufficient available medication stock." if available < quantity

          remaining = quantity
          allocations = []
          batches.each do |batch|
            break if remaining.zero?
            consumed = [ remaining, batch.quantity.to_d ].min
            movement = batch.movements.create!(practice_id: practice.id, actor_id: actor.id, profile_id: profile.id,
              kind: "adjustment_out", quantity: -consumed, stock_unit: product.stock_unit, reason: normalized_reason,
              request_key: "#{key_prefix}:#{batch.id}", occurred_at: occurred_at, created_at: occurred_at,
              updated_at: occurred_at)
            allocations << { batch_id: batch.id, quantity: consumed, movement_id: movement.id }
            remaining -= consumed
          end
          Rails.logger.info("inventory_medication_use practice_id=#{practice.id} product_id=#{product.id} quantity=#{quantity.to_s('F')} lots=#{allocations.length} request_key=#{key}")
          { product_id: product.id, quantity: quantity, allocations: allocations }
        end
      end

      def self.medication_use_key_prefix(request_key)
        "medication-use:#{request_key}"
      end
      private_class_method :medication_use_key_prefix

      def self.exact_movements(practice_id, key_prefix)
        PharmacyMovement.unscoped.where(practice_id: practice_id)
          .where("request_key LIKE ?", "#{key_prefix}:%").order(:id).to_a
          .select { |movement| movement.request_key == "#{key_prefix}:#{movement.batch_id}" }
      end
      private_class_method :exact_movements
    end
  end
end
