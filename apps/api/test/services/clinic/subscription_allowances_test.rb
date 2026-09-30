require "test_helper"

class SubscriptionAllowancesTest < ActiveSupport::TestCase
  POLICY = { "anchor" => "paid_period_start", "timezone" => "UTC", "reset" => "discard_unused",
    "renewal" => "verified_paid_period", "partial_window" => "full_quantity" }.freeze

  setup do
    @practice = Clinic::Practice.create!(name: "Synthetic allowance clinic")
    @actor = User.create!(email_address: "allowance-staff@example.invalid", password: SecureRandom.hex(20))
    membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(membership, "subscription_catalog.write", "subscription_catalog.publish", "billing.read", "billing.payment_record")
    @patient = @practice.patients.create!(display_name: "Synthetic allowance patient", reference: "ALLOWANCE-001")
    @user = User.create!(email_address: "allowance-patient@example.invalid", password: SecureRandom.hex(20))
    @identity = Clinic::PatientPortal::Identity.create!(practice: @practice, patient: @patient, user: @user,
      status: "active", invited_at: Time.current, activated_at: Time.current)
    @family = Clinic::Care::SubscriptionFamily.create!(practice: @practice, name: "Synthetic allowance program")
    Clinic::Care::SubscriptionCatalog.save(practice: @practice, actor: @actor, kind: "family", id: @family.id,
      attributes: { "lock_version" => 0, "publish" => true })
    @service = Clinic::Care::ServiceOption.create!(practice: @practice, name: "Synthetic commercial unit")
    @package = Clinic::Care::SubscriptionPackage.create!(practice: @practice, family: @family, name: "Daily allowance", draft: {
      "amount" => "15.00", "duration" => 1, "duration_unit" => "months", "renewal" => "automatic",
      "cancellation" => "end_of_term", "terms" => "Synthetic allowance terms, no clinical delivery implied.",
      "components" => [ { "service_id" => @service.id, "mode" => "included", "quantity" => 3,
        "frequency" => "day", "allowance" => POLICY } ]
    })
    publish_and_purchase
  end

  test "missing and partial choices never infer allowance policy" do
    assert_nil Clinic::Care::SubscriptionDefinition.allowance(nil)
    assert_raises(ArgumentError) { Clinic::Care::SubscriptionDefinition.allowance(POLICY.except("reset")) }
    assert_raises(ArgumentError) { Clinic::Care::SubscriptionDefinition.allowance(POLICY.merge("reset" => "carryover")) }
    assert_nil balance[:remaining_quantity]
    assert_equal "paid_period_unavailable", balance[:status]
    assert_equal 0, entries.count
    component = @agreement.snapshot.fetch("selected_components").first.except("allowance")
    unconfigured = Clinic::Care::SubscriptionAllowances.project(agreement: @agreement, component: component,
      entries: [], state: "active")
    assert_equal "allowance_unconfigured", unconfigured[:status]
    assert_nil unconfigured[:remaining_quantity]
  end

  test "exact uses exhaust one window and stale new uses cannot consume the next" do
    travel_to(Time.utc(2026, 1, 31, 12)) do
      paid_period(Time.current, Time.current.advance(months: 1))
      token = balance[:allowance_window]
      entry = use(3, "exhaust", token)
      assert_equal entry.id, use(3, "exhaust", token).id
      assert_equal 0, balance[:remaining_quantity]
      assert_raises(ArgumentError) { use(1, "overdraw", token) }
      travel 1.day
      assert_equal 3, balance[:remaining_quantity]
      assert_raises(ArgumentError) { use(1, "stale", token) }
      assert_equal entry.id, use(3, "exhaust", token).id
      assert_raises(ArgumentError) { use(2, "exhaust", token) }
      use(1, "new-window", balance[:allowance_window])
      assert_equal 2, balance[:remaining_quantity]
      assert_equal 2, entries.count
    end
  end

  test "renewal and historic reversal cannot transfer unused or restored units" do
    travel_to(Time.utc(2026, 1, 31, 12)) do
      finish = Time.current.advance(months: 1)
      paid_period(Time.current, finish)
      original = use(2, "first-use", balance[:allowance_window])
      travel_to(finish)
      assert_nil balance[:remaining_quantity]
      assert_not balance[:can_use]
      paid_period(finish, finish.advance(months: 1))
      assert_equal 3, balance[:remaining_quantity]
      reversal = reverse(original, "reverse-historic")
      assert_equal original.window_start, reversal.window_start
      assert_equal original.paid_event_id, reversal.paid_event_id
      assert_equal 3, balance[:remaining_quantity]
      assert_equal reversal.id, reverse(original, "reverse-historic").id
      assert_raises(ArgumentError) { reverse(original, "reverse-twice") }
    end
  end

  test "UTC months retain the anchor day and clamp shorter months without drifting" do
    component = @agreement.snapshot.fetch("selected_components").first.merge("frequency" => "month")
    anchor = Time.utc(2026, 1, 31, 12)
    paid_period(anchor, Time.utc(2026, 5, 31, 12))
    february = Clinic::Care::SubscriptionAllowances.window(@agreement, component, at: Time.utc(2026, 2, 28, 12))
    march = Clinic::Care::SubscriptionAllowances.window(@agreement, component, at: Time.utc(2026, 3, 31, 12))
    assert_equal Time.utc(2026, 2, 28, 12), february[:window_start]
    assert_equal Time.utc(2026, 3, 31, 12), february[:window_end]
    assert_equal Time.utc(2026, 3, 31, 12), march[:window_start]
    assert_equal Time.utc(2026, 4, 30, 12), march[:window_end]
  end

  test "short final window is clipped and receives only the explicitly configured full quantity" do
    anchor = Time.utc(2026, 1, 1, 12)
    paid_period(anchor, anchor + 36.hours)
    travel_to(anchor + 1.day) do
      assert_equal 3, balance[:remaining_quantity]
      assert_equal (anchor + 36.hours).iso8601(6), balance[:window_end]
    end
  end

  test "overlapping paid windows and inactive access fail closed" do
    travel_to(Time.utc(2026, 1, 1, 12)) do
      paid_period(Time.current, Time.current + 10.days)
      @agreement.events.create!(practice: @practice, kind: "canceled", request_key: "canceled-now",
        details: { effective_at: Time.current.iso8601 })
      assert_not balance[:can_use]
      assert_raises(ArgumentError) { use(1, "inactive", balance[:allowance_window]) }
      paid_period(Time.current, Time.current + 20.days)
      assert_nil balance[:allowance_window]
      assert_nil balance[:remaining_quantity]
    end
  end

  test "new publications leave purchased allowance terms and historical uses unchanged" do
    travel_to(Time.utc(2026, 1, 1, 12)) do
      paid_period(Time.current, Time.current + 10.days)
      original = use(1, "historic-use", balance[:allowance_window])
      @package.update!(draft: @package.draft.merge("components" => [ @package.draft.fetch("components").first.merge("quantity" => 9, "allowance" => nil) ]))
      publish("new-policy")
      assert_equal POLICY, @agreement.reload.snapshot.fetch("selected_components").first.fetch("allowance")
      assert_equal 2, balance[:remaining_quantity]
      assert_equal original.id, use(1, "historic-use", balance[:allowance_window]).id
    end
  end

  test "denied actor and direct overdraw or altered reversal cannot write evidence" do
    travel_to(Time.utc(2026, 1, 1, 12)) do
      paid_period(Time.current, Time.current + 10.days)
      assert_raises(Clinic::Authorization::Denied) do
        Clinic::Care::SubscriptionAllowances.record(agreement: @agreement, actor: @user, kind: "use",
          service_id: @service.id, quantity: 1, source_reference: "synthetic denial", request_key: "denied",
          allowance_window: balance[:allowance_window])
      end
      original = use(3, "used", balance[:allowance_window])
      assert_raises(ActiveRecord::StatementInvalid) do
        ApplicationRecord.transaction(requires_new: true) { original.update_columns(quantity: 1) }
      end
      assert_raises(ActiveRecord::StatementInvalid) do
        ApplicationRecord.transaction(requires_new: true) { entries.delete_all }
      end
      assert_raises(ActiveRecord::StatementInvalid) do
        ApplicationRecord.transaction(requires_new: true) do
          entries.create!(original.attributes.except("id", "created_at", "updated_at").merge("request_key" => "bypass"))
        end
      end
      assert_raises(ActiveRecord::StatementInvalid) do
        ApplicationRecord.transaction(requires_new: true) do
          entries.create!(original.attributes.except("id", "created_at", "updated_at").merge(
            "kind" => "reversal", "quantity" => 1, "reversed_entry_id" => original.id, "request_key" => "wrong-reversal"))
        end
      end
      assert_equal 1, entries.count
    end
  end

  private

  def publish(key = "published")
    Clinic::Care::SubscriptionCatalog.publish(practice: @practice, actor: @actor, id: @package.id,
      request_key: key, lock_version: @package.reload.lock_version)
  end

  def publish_and_purchase
    @version = publish
    @agreement = Clinic::Care::SubscriptionPurchase.checkout(identity: @identity, actor: @user,
      version_id: @version.id, selections: [], request_key: "purchased")
  end

  # Synthetic retained activation evidence only; these tests do not invoke a provider.
  def paid_period(start, finish)
    @agreement.events.create!(practice: @practice, kind: "active", request_key: "paid-#{@agreement.events.count}",
      details: { starts_at: start.iso8601, ends_at: finish.iso8601 })
    @agreement.events.reset
  end

  def balance
    Clinic::Care::SubscriptionProjection.agreement(@agreement)[:entitlements].first
  end

  def entries
    Clinic::Care::SubscriptionAllowances.records(@agreement)
  end

  def use(quantity, key, window)
    Clinic::Care::SubscriptionAllowances.record(agreement: @agreement, actor: @actor, kind: "use",
      service_id: @service.id, quantity: quantity, source_reference: "synthetic-source-#{key}", request_key: key,
      allowance_window: window)
  end

  def reverse(original, key)
    Clinic::Care::SubscriptionAllowances.record(agreement: @agreement, actor: @actor, kind: "reversal",
      reversed_entry_id: original.id, source_reference: "synthetic-source-#{key}", request_key: key,
      allowance_window: Clinic::Care::SubscriptionAllowances.token(original.attributes.symbolize_keys))
  end
end
