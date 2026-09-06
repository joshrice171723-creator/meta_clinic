module Clinic
  module Inventory
    class UseMedication
      def self.call(practice:, actor:, product_id:, quantity_requested:, request_key:, reason:, occurred_at: Current.business_time)
        Access.with(practice.id, actor, "adjust") do |profile|
          Access.retry_lock(practice.id, request_key)
          product = PharmacyProduct.where(practice_id: practice.id).lock.find(product_id)
          raise ArgumentError, "Only medication catalog items can be consumed through medication use." unless product.category == "medication"
          quantity = Quantity.parse(quantity_requested, scale: product.quantity_scale)
          raise ArgumentError, "Provide a reason for medication use." if reason.to_s.strip.empty?

          existing = PharmacyMovement.unscoped.where(practice_id: practice.id).where("request_key = ? OR request_key LIKE ?", request_key, "#{request_key}:%").order(:id).to_a
          if existing.any?
            raise ArgumentError, "This medication-use request was already used for different data." unless existing.all? { |movement| movement.kind == "adjustment_out" && movement.batch.product_id == product.id } && existing.sum { |movement| movement.quantity.abs } == quantity
            return { product_id: product.id, quantity: quantity, allocations: existing.map { |movement| { batch_id: movement.batch_id, quantity: movement.quantity.abs } } }
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
            movement = batch.movements.create!(practice_id: practice.id, actor_id: actor.id, profile_id: profile.id, kind: "adjustment_out", quantity: -consumed, stock_unit: product.stock_unit, reason: reason.to_s.strip, request_key: "#{request_key}:#{batch.id}", occurred_at: occurred_at, created_at: occurred_at, updated_at: occurred_at)
            allocations << { batch_id: batch.id, quantity: consumed, movement_id: movement.id }
            remaining -= consumed
          end
          Rails.logger.info("inventory_medication_use practice_id=#{practice.id} product_id=#{product.id} quantity=#{quantity.to_s('F')} lots=#{allocations.length} request_key=#{request_key}")
          { product_id: product.id, quantity: quantity, allocations: allocations }
        end
      end
    end
  end
end
