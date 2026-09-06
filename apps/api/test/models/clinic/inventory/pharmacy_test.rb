require "test_helper"

class Clinic::Inventory::PharmacyTest < ActiveSupport::TestCase
  def assert_database_rejects(error, &block)
    assert_raises(error) { ApplicationRecord.transaction(requires_new: true, &block) }
  end

  setup do
    @user = User.create!(email_address: "ledger@example.invalid", password: SecureRandom.hex(20))
    @practice = Development::TestClinic.create!(@user).practice
    @product = Clinic::Inventory::PharmacyProduct.create!(practice: @practice, name: "Fictional item", sku: "LEDGER")
    @batch = @product.batches.create!(practice_id: @practice.id, lot_number: "TEST", location: "Test shelf", expires_on: Date.current + 10)
    @movement = @batch.move!(kind: "receipt", amount: 5, reason: "Synthetic opening", actor: @user, request_key: SecureRandom.uuid)
  end

  test "database guards survive schema loading and reject direct history edits and underflow" do
    assert_database_rejects(ActiveRecord::StatementInvalid) { @movement.update_columns(quantity: 50) }
    assert_database_rejects(ActiveRecord::StatementInvalid) { @movement.delete }
    values = @movement.attributes.except("id").merge("quantity" => -6, "kind" => "adjustment_out", "request_key" => SecureRandom.uuid)
    assert_database_rejects(ActiveRecord::StatementInvalid) { Clinic::Inventory::PharmacyMovement.insert_all!([ values ]) }
    assert_equal 5, @batch.reload.quantity
  end

  test "batch and actor composite references reject cross-clinic inserts" do
    other = Clinic::Practice.create!(name: "Other test clinic")
    assert_database_rejects(ActiveRecord::StatementInvalid) do
      Clinic::Inventory::PharmacyBatch.insert_all!([ @batch.attributes.except("id").merge("practice_id" => other.id, "lot_number" => "INVALID") ])
    end
    stranger = User.create!(email_address: "stranger@example.invalid", password: SecureRandom.hex(20))
    assert_database_rejects(ActiveRecord::InvalidForeignKey) do
      Clinic::Inventory::PharmacyMovement.insert_all!([ @movement.attributes.except("id").merge("actor_id" => stranger.id, "kind" => "adjustment_in", "receipt_line_id" => nil, "request_key" => SecureRandom.uuid) ])
    end
  end

  test "status history is append-only and invalid status or reason does not change availability" do
    assert_raises(ActiveRecord::RecordInvalid) { @batch.change_status!(status: "recalled", reason: "", actor: @user, request_key: SecureRandom.uuid) }
    assert_equal "active", @batch.reload.status
    event = @batch.change_status!(status: "recalled", reason: "Fictional recall exercise", actor: @user, request_key: SecureRandom.uuid)
    assert_equal 0, @product.reload.available_quantity
    assert_database_rejects(ActiveRecord::StatementInvalid) { event.delete }
    assert_database_rejects(ActiveRecord::StatementInvalid) { event.update_columns(to_status: "active") }
    assert_equal 5, @batch.reload.quantity
  end

  test "dates determine expiry without inventing an alert completion" do
    travel_to Time.current.change(hour: 12) + 1.day do
      @batch = @product.batches.create!(practice_id: @practice.id, lot_number: "DATED", location: "Test shelf", expires_on: Date.current)
      @batch.move!(kind: "receipt", amount: 1, reason: "Fictional date test", actor: @user, request_key: SecureRandom.uuid)
      assert @batch.expiring?
      travel 1.day
      assert @batch.expired?
      assert_not @batch.available?
    end
  end
end
