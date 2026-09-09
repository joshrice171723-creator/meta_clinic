require "test_helper"

class Clinic::Inventory::ExceptionReviewTest < ActiveSupport::TestCase
  setup do
    @actor = User.create!(email_address: "exception-review@example.invalid", password: SecureRandom.hex(20))
    @membership = Development::TestClinic.create!(@actor)
    @practice = @membership.practice
    grant_permissions!(@membership, "inventory.receive", "inventory.configure")
    @product = @practice.pharmacy_products.create!(name: "Exception review item", sku: "EXCEPTION-REVIEW-1",
      stock_unit: "each", quantity_scale: 0, package_size: 1)
    @location = @practice.inventory_locations.create!(name: "Exception review shelf", kind: "storage")
    Clinic::Inventory::Receiving.call(practice: @practice, actor: @actor, reason: "Exception review receipt",
      request_key: SecureRandom.uuid, lines: [ { product_id: @product.id, lot_number: "EXCEPTION-LOT",
        location_id: @location.id, expires_on: (Date.current + 7).iso8601, amount: "1", input_unit: "package" } ])
    @batch = @product.batches.sole
  end

  test "records a current inventory exception instead of colliding with Active Model normalization" do
    review = Clinic::Inventory::ExceptionReview.record!(practice: @practice, actor: @actor,
      source_kind: "batch", source_id: @batch.id, category: "expiring", assignee_id: nil,
      state: "reviewed", reason: "Review expiring fixture stock", request_key: SecureRandom.uuid)

    assert_equal "reviewed", review.state
    assert_equal @batch.id, review.source_id
    assert_equal "Review expiring fixture stock", review.reason
  end
end
