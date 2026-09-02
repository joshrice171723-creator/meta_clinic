module Clinic
  module Inventory
    class TransferStock
      def self.call(practice:, actor:, source_batch_id:, destination_location_id:, amount:, reason:, request_key:)
        Access.with(practice.id, actor, "transfer") do |profile|
          Transfer.transaction do
            Access.retry_lock(practice.id, request_key)
            source = PharmacyBatch.where(practice_id: practice.id).includes(:product, :lot, :location_record).lock.find(source_batch_id)
            destination_location = Location.where(practice_id: practice.id).lock.find(destination_location_id)
            quantity = Quantity.parse(amount, scale: source.product.quantity_scale)
            raise ArgumentError, "Source and destination must differ." if source.location_id == destination_location.id
            raise ArgumentError, "Held, recalled, or quarantined stock cannot transfer." unless source.available?
            raise ArgumentError, "Transfer exceeds available stock." if quantity > source.quantity

            existing = Transfer.find_by(practice_id: practice.id, request_key: request_key)
            if existing
              raise ArgumentError, "This transfer request key was already used for different data." unless existing.source_batch_id == source.id && existing.quantity == quantity
              next existing
            end

            destination = PharmacyBatch.where(practice_id: practice.id).find_or_create_by!(lot_id: source.lot_id, location_id: destination_location.id) do |batch|
              batch.assign_attributes(product_id: source.product_id, lot_number: source.lot_number, location: destination_location.name, expires_on: source.expires_on, supplier: source.supplier, status: "active")
            end
            transfer = Transfer.create!(practice_id: practice.id, source_batch: source, destination_batch: destination, actor: actor, quantity: quantity, reason: reason, request_key: request_key)
            source.movements.create!(practice_id: practice.id, actor: actor, profile: profile, kind: "adjustment_out", quantity: -quantity, stock_unit: source.product.stock_unit, reason: "Transfer to #{destination_location.name}: #{reason}", request_key: "#{request_key}:out", occurred_at: Time.current)
            destination.movements.create!(practice_id: practice.id, actor: actor, profile: profile, kind: "adjustment_in", quantity: quantity, stock_unit: destination.product.stock_unit, reason: "Transfer from #{source.location}: #{reason}", request_key: "#{request_key}:in", occurred_at: Time.current)
            if %w[Quarantine Returns Holding].include?(destination_location.name)
              destination.holds.create!(practice_id: practice.id, actor: actor, kind: "quarantined", reason: "Transfer routed to #{destination_location.name}", request_key: "#{request_key}:hold")
            end
            transfer
          end
        end
      end
    end
  end
end
