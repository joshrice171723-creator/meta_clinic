module Development
  class PharmacyStock
    def self.populate!(practice:, actor:)
      raise "Fictional stock is only available in development and test." unless Rails.env.development? || Rails.env.test?

      practice.with_lock do
        Clinic::Inventory::Access.with(practice.id, actor, "receive") do
          products = Clinic::Inventory::PharmacyProduct.where(practice_id: practice.id)
          if products.none?
            [ [ "Example tablets", 6, 10, 14 ], [ "Example capsules", 24, 8, 180 ], [ "Example solution", 4, 2, -2 ] ].each_with_index do |(name, count, reorder, days), index|
              product = products.create!(name: name, sku: "SYNTHETIC-#{index + 1}", source: "synthetic", reorder_point: reorder, package_description: "Fictional sealed package — not a medication")
              batch = product.batches.create!(practice_id: practice.id, lot_number: "DEMO-LOT-#{index + 1}", location: "Test stockroom", supplier: "Fictional supplier", expires_on: Date.current + days)
              batch.move!(kind: "receipt", amount: count, reason: "Synthetic walkthrough opening stock", actor: actor, request_key: SecureRandom.uuid)
            end
          end
        end
      end
    end
  end
end
