require "test_helper"

class InventoryPurchaseOrderTest < ActiveSupport::TestCase
  setup do
    @practice = Clinic::Practice.create!(name: "Synthetic versioned purchase order practice")
    @actor = User.create!(email_address: "purchase-order-version@example.invalid", password: SecureRandom.hex(20))
    membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(membership, "procurement.submit")
    @supplier = @practice.inventory_suppliers.create!(name: "Synthetic versioned supplier")
    @order = @practice.inventory_purchase_orders.create!(actor: @actor, supplier: @supplier,
      number: "SYN-VERSION-1", status: "approved", version: 3, destination: "Synthetic destination",
      reason: "Synthetic approved request", request_key: SecureRandom.uuid, payload_digest: "a" * 64)
  end

  test "consecutive audited updates retain the persisted optimistic version and metadata history" do
    PaperTrail.request(whodunnit: @actor.id.to_s) do
      assert_difference "@order.versions.count", 2 do
        @order.update!(destination_address: "100 Synthetic Street")
        assert_equal 3, @order.version
        assert_equal 3, @order.class.where(id: @order.id).pick(:version)
        assert @order.paper_trail.live?
        assert_nil @order.paper_trail_version

        @order.update!(reason: "Synthetic reviewed request")
        assert_equal 3, @order.version
        assert_equal 3, @order.reload.version
      end
    end

    changes = @order.versions.where(event: "update").order(:id).to_a
    assert_equal 2, changes.size
    assert_includes changes.first.changed_fields, "destination_address"
    assert_includes changes.last.changed_fields, "reason"
    changes.each do |history|
      assert_equal @practice.id, history.practice_id
      assert_equal @actor.id.to_s, history.actor_reference
      refute_includes history.changed_fields, "version"
    end
  end

  test "successive allowed transitions increment the optimistic version without losing history or exact replay" do
    sent_key = SecureRandom.uuid
    cancelled_key = SecureRandom.uuid
    sent = nil
    cancelled = nil
    PaperTrail.request(whodunnit: @actor.id.to_s) do
      assert_difference [ "@order.versions.count", "@order.events.count" ], 2 do
        sent = @order.transition!(to: "sent", actor: @actor,
          reason: "Synthetic manually recorded submission", request_key: sent_key)
        assert_equal 4, @order.version
        assert_equal 4, @order.class.where(id: @order.id).pick(:version)
        assert @order.paper_trail.live?

        cancelled = @order.transition!(to: "cancelled", actor: @actor,
          reason: "Synthetic cancelled order", request_key: cancelled_key)
        assert_equal 5, @order.version
        assert_equal 5, @order.class.where(id: @order.id).pick(:version)
        assert @order.paper_trail.live?
      end

      assert_no_difference [ "@order.versions.count", "@order.events.count" ] do
        assert_equal sent, @order.transition!(to: "sent", actor: @actor,
          reason: "Synthetic manually recorded submission", request_key: sent_key)
        assert_equal cancelled, @order.transition!(to: "cancelled", actor: @actor,
          reason: "Synthetic cancelled order", request_key: cancelled_key)
      end
    end

    assert_equal "cancelled", @order.reload.status
    assert_equal 5, @order.version
    @order.versions.where(event: "update").each do |history|
      assert_includes history.changed_fields, "status"
      assert_includes history.changed_fields, "version"
      assert_equal @actor.id.to_s, history.actor_reference
    end
  end
end
