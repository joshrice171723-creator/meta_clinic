require "test_helper"

class DevelopmentInventoryGrantsTest < ActiveSupport::TestCase
  test "inventory fixture grants remain effective during a long setup transaction" do
    actor = User.create!(email_address: "inventory-fixture-clock@example.invalid", password: SecureRandom.hex(24))
    practice = Clinic::Practice.create!(name: "Inventory grant clock fixture")
    membership = practice.memberships.create!(user: actor)
    transaction_time = ApplicationRecord.connection.select_value("SELECT CURRENT_TIMESTAMP")

    travel_to 3.minutes.from_now do
      Development::TestClinic.send(:grant_access!, membership, [ "inventory.adjust" ])
      item = practice.items.create!(name: "Fixture paper", sku: "CLOCK", reorder_level: 0)
      item.adjust!(delta: 3, reason: "Fixture opening stock", actor: actor, request_key: SecureRandom.uuid)

      assert_equal 3, item.reload.quantity
      assert_operator membership.role_grants.sole.effective_from, :<=, transaction_time
      assert_raises(ArgumentError) do
        Clinic::Inventory::Access.with(practice.id, actor, "receive") { flunk "Ungrantable receiving access" }
      end
    end
  end
end
