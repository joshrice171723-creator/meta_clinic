require "test_helper"

class PharmacyInventoryTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(email_address: "ledger@example.invalid", password: SecureRandom.hex(20))
    @practice = Clinic::DemoSetup.create!(@user).practice
    @product = Clinic::PharmacyProduct.create!(practice: @practice, name: "Fictional item", sku: "LEDGER")
    @batch = @product.batches.create!(practice_id: @practice.id, lot_number: "TEST", location: "Test shelf", expires_on: Date.current + 10)
    @movement = @batch.move!(kind: "receipt", amount: 5, reason: "Synthetic opening", actor: @user, request_key: SecureRandom.uuid)
  end

  test "database guards survive schema loading and reject direct history edits and underflow" do
    assert_raises(ActiveRecord::StatementInvalid) { @movement.update_columns(quantity: 50) }
    assert_raises(ActiveRecord::StatementInvalid) { @movement.delete }
    values = @movement.attributes.except("id").merge("quantity" => -6, "kind" => "adjustment_out", "request_key" => SecureRandom.uuid)
    assert_raises(ActiveRecord::StatementInvalid) { Clinic::PharmacyMovement.insert_all!([ values ]) }
    assert_equal 5, @batch.reload.quantity
  end

  test "batch and actor composite references reject cross-clinic inserts" do
    other = Clinic::Practice.create!(name: "Other test clinic")
    assert_raises(ActiveRecord::InvalidForeignKey) do
      Clinic::PharmacyBatch.insert_all!([ @batch.attributes.except("id").merge("practice_id" => other.id, "lot_number" => "INVALID") ])
    end
    stranger = User.create!(email_address: "stranger@example.invalid", password: SecureRandom.hex(20))
    assert_raises(ActiveRecord::InvalidForeignKey) do
      Clinic::PharmacyMovement.insert_all!([ @movement.attributes.except("id").merge("actor_id" => stranger.id, "request_key" => SecureRandom.uuid) ])
    end
  end

  test "status history is append-only and invalid status or reason does not change availability" do
    assert_raises(ActiveRecord::RecordInvalid) { @batch.change_status!(status: "recalled", reason: "", actor: @user, request_key: SecureRandom.uuid) }
    assert_equal "active", @batch.reload.status
    event = @batch.change_status!(status: "recalled", reason: "Fictional recall exercise", actor: @user, request_key: SecureRandom.uuid)
    assert_equal 0, @product.reload.available_quantity
    assert_raises(ActiveRecord::StatementInvalid) { event.delete }
    assert_raises(ActiveRecord::StatementInvalid) { event.update_columns(to_status: "active") }
    assert_equal 5, @batch.reload.quantity
  end

  test "dates determine expiry without inventing an alert completion" do
    travel_to Time.utc(2026, 8, 30, 12) do
      @batch = @product.batches.create!(practice_id: @practice.id, lot_number: "DATED", location: "Test shelf", expires_on: Date.current)
      @batch.move!(kind: "receipt", amount: 1, reason: "Fictional date test", actor: @user, request_key: SecureRandom.uuid)
      assert @batch.expiring?
      travel 1.day
      assert @batch.expired?
      assert_not @batch.available?
    end
  end
end
