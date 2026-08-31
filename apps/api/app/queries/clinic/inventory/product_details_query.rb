module Clinic
  module Inventory
    class ProductDetailsQuery
      Result = Data.define(:product, :batch_page, :batch_count, :batches, :counts, :receipt_lines, :histories)

      def self.call(practice:, product_id:, page: nil)
        product = PharmacyProduct.where(practice_id: practice.id).find(product_id)
        page = page.to_i.clamp(1, 100_000)
        batches = product.batches.includes(:product, :practice).order(:expires_on, :id).limit(10).offset((page - 1) * 10).to_a
        Result.new(product: product, batch_page: page, batch_count: product.batches.count, batches: batches,
          counts: batches.to_h { |batch| [ batch.id, batch.counts.includes(:approval).order(id: :desc).limit(10).to_a ] },
          receipt_lines: batches.to_h { |batch| [ batch.id, ReceiptLine.where(practice_id: practice.id, batch_id: batch.id).includes(receipt: :supplier).order(id: :desc).limit(20).to_a ] },
          histories: batches.to_h { |batch| [ batch.id, (batch.movements.order(id: :desc).limit(30).to_a + batch.events.order(id: :desc).limit(30).to_a).sort_by(&:created_at).reverse ] })
      end
    end
  end
end
