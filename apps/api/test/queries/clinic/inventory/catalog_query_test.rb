require "test_helper"

class Clinic::Inventory::CatalogQueryTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(email_address: "query@example.invalid", password: SecureRandom.hex(20))
    @practice = Development::TestClinic.create!(@user).practice
    @other = Clinic::Practice.create!(name: "Other synthetic clinic")
    @product = Clinic::Inventory::PharmacyProduct.create!(practice: @practice, name: "Literal %_ example", sku: "QUERY", reorder_point: 2)
    @batch = @product.batches.create!(practice: @practice, lot_number: "QUERY", location: "Shelf", expires_on: Date.current + 10)
    @batch.move!(kind: "receipt", amount: 4, reason: "Synthetic query fixture", actor: @user, request_key: SecureRandom.uuid)
    Clinic::Inventory::PharmacyProduct.create!(practice: @other, name: "Other synthetic product", sku: "OTHER")
  end

  test "catalog keeps tenant scope, exact search escaping and availability semantics" do
    result = Clinic::Inventory::CatalogQuery.call(practice: @practice, query: "%_", filter: "expiring", page: -1)
    assert_equal 1, result.product_count
    assert_equal 1, result.active_count
    assert_equal 0, result.low_count
    assert_equal 1, result.page
    assert_equal [ @product.id ], result.filtered.map(&:id)
    assert_equal [ @batch.id ], result.attention.map(&:id)
    assert_equal [ [ "package", 4, 0 ] ], result.unit_totals
    assert_equal [ @practice.id ], result.movements.map(&:practice_id).uniq

    @batch.change_status!(status: "quarantined", reason: "Synthetic hold", actor: @user, request_key: SecureRandom.uuid)
    result = Clinic::Inventory::CatalogQuery.call(practice: @practice, filter: "held")
    assert_equal 1, result.low_count
    assert_equal 0, result.filtered.sole.available_quantity
    assert_equal [ [ "package", 0, 4 ] ], result.unit_totals
  end

  test "catalog bounds pages and worklists while counts cover the whole clinic" do
    30.times { |n| Clinic::Inventory::PharmacyProduct.create!(practice: @practice, name: "Example #{n}", sku: "PAGE-#{n}") }
    first = Clinic::Inventory::CatalogQuery.call(practice: @practice, filter: "not-a-filter")
    second = Clinic::Inventory::CatalogQuery.call(practice: @practice, page: 2)
    assert_equal "all", first.filter
    assert_equal 31, first.product_count
    assert_equal 31, first.filtered_count
    assert_equal 25, first.filtered.size
    assert_equal 6, second.filtered.size
    assert_empty first.filtered.map(&:id) & second.filtered.map(&:id)
    assert_equal 20, first.low_stock.size
    bounded = Clinic::Inventory::CatalogQuery.call(practice: @practice, query: "x" * 150, page: 1_000_000)
    assert_equal 100, bounded.query.length
    assert_equal 100_000, bounded.page
  end

  test "product details scope all receipt count and history evidence to the selected clinic" do
    Clinic::Inventory::Count.observe!(batch: @batch, actor: @user, observed: "4", reason: "Synthetic count", request_key: SecureRandom.uuid)
    details = Clinic::Inventory::ProductDetailsQuery.call(practice: @practice, product_id: @product.id)
    assert_equal @product, details.product
    assert_equal 1, details.batch_count
    assert_equal [ @batch.id ], details.batches.map(&:id)
    assert_equal 1, details.counts.fetch(@batch.id).size
    assert_equal 1, details.receipt_lines.fetch(@batch.id).size
    assert_equal 1, details.histories.fetch(@batch.id).size
    assert_raises(ActiveRecord::RecordNotFound) { Clinic::Inventory::ProductDetailsQuery.call(practice: @other, product_id: @product.id) }
  end

  test "product details keep a bounded batch page without per-batch query growth" do
    Clinic::Inventory::Count.observe!(
      batch: @batch, actor: @user, observed: "4", reason: "Synthetic baseline count",
      request_key: SecureRandom.uuid
    )
    baseline_queries = product_detail_query_count

    10.times do |index|
      batch = @product.batches.create!(
        practice: @practice,
        lot_number: "QUERY-PAGE-#{index}",
        location: "Shelf #{index}",
        expires_on: Date.current + 20 + index
      )
      batch.move!(
        kind: "receipt", amount: 2, reason: "Synthetic paged receipt", actor: @user,
        request_key: SecureRandom.uuid
      )
      Clinic::Inventory::Count.observe!(
        batch: batch, actor: @user, observed: "2", reason: "Synthetic paged count",
        request_key: SecureRandom.uuid
      )
    end

    expanded_queries = product_detail_query_count
    details = Clinic::Inventory::ProductDetailsQuery.call(practice: @practice, product_id: @product.id)

    assert_equal 11, details.batch_count
    assert_equal 10, details.batches.size
    details.batches.each do |batch|
      assert_equal 1, details.counts.fetch(batch.id).size
      assert_equal 1, details.receipt_lines.fetch(batch.id).size
      assert_equal 1, details.histories.fetch(batch.id).size
    end
    assert_operator expanded_queries, :<=, baseline_queries + 2
  end

  private

  def product_detail_query_count
    queries = []
    subscriber = lambda do |_name, _started, _finished, _unique_id, payload|
      sql = payload[:sql].to_s.lstrip
      queries << sql if sql.match?(/\ASELECT\b/i)
    end
    ActiveSupport::Notifications.subscribed(subscriber, "sql.active_record") do
      Clinic::Inventory::ProductDetailsQuery.call(practice: @practice, product_id: @product.id)
    end
    queries.length
  end
end
