require "test_helper"

class SubscriptionEntitlementsTest < ActiveSupport::TestCase
  setup do
    @practice = Clinic::Practice.create!(name: "Entitlement test clinic")
    @actor = User.create!(email_address: "entitlement-staff@example.invalid", password: SecureRandom.hex(20))
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "subscription_catalog.write", "subscription_catalog.publish", "billing.read", "billing.payment_record")
    @patient = @practice.patients.create!(display_name: "Synthetic package patient", reference: "ENTITLEMENT-001")
    @user = User.create!(email_address: "entitlement-patient@example.invalid", password: SecureRandom.hex(20))
    @identity = Clinic::PatientPortal::Identity.create!(practice: @practice, patient: @patient, user: @user,
      status: "active", invited_at: Time.current, activated_at: Time.current)
    @family = Clinic::Care::SubscriptionFamily.create!(practice: @practice, name: "Synthetic service program")
    Clinic::Care::SubscriptionCatalog.save(practice: @practice, actor: @actor, kind: "family", id: @family.id,
      attributes: { "lock_version" => 0, "publish" => true })
    @service = Clinic::Care::ServiceOption.create!(practice: @practice, name: "Synthetic purchased service")
    @unselected = Clinic::Care::ServiceOption.create!(practice: @practice, name: "Unselected service")
    @package = Clinic::Care::SubscriptionPackage.create!(practice: @practice, family: @family, name: "Three service units", draft: {
      "amount" => "15.00", "currency" => "USD", "duration" => 1, "duration_unit" => "months",
      "terms" => "Synthetic fixed-term commercial units, no clinical delivery implied.",
      "components" => [ { "service_id" => @service.id, "mode" => "included", "quantity" => 3 },
        { "service_id" => @unselected.id, "mode" => "optional" } ]
    })
    @version = publish
    @agreement = checkout
  end

  test "unknown opening stays unknown until reviewed and exact uses exhaust once" do
    pay
    initial = balance
    assert_equal "not_recorded", initial[:status]
    assert_nil initial[:remaining_quantity]
    assert_not initial[:can_use]
    assert_raises(ArgumentError) { record("use", 1, "before-opening") }
    opening = record("opening", 2, "opening")
    assert_equal opening.id, record("opening", 2, "opening").id
    assert_equal 3, balance[:purchased_quantity]
    assert_equal 2, balance[:remaining_quantity]
    entry = record("use", 2, "use")
    assert_equal entry.id, record("use", 2, "use").id
    assert_equal 2, entries.count
    assert_equal 0, balance[:remaining_quantity]
    assert_equal "exhausted", balance[:status]
    assert_raises(ArgumentError) { record("use", 1, "overdraw") }
    assert_raises(ArgumentError) { record("use", 1, "use") }
    assert_raises(ArgumentError) { record("opening", 1, "second-opening") }
    assert_equal 1, @agreement.invoice.payment_allocations.count
    assert_equal "active", @agreement.current_state
    assert_equal 1, @patient.invoices.count
  end

  test "reversal restores exactly one use and retains history even after expiry" do
    pay
    record("opening", 3, "opening")
    original = record("use", 2, "use")
    ending = Time.iso8601(@agreement.events.find_by!(kind: "active").details.fetch("ends_at"))
    travel_to(ending) do
      reversal = reverse(original, "reverse")
      assert_equal reversal.id, reverse(original, "reverse").id
      assert_equal 3, balance[:remaining_quantity]
      assert_equal "inactive", balance[:status]
      assert_not balance[:can_use]
      assert_raises(ArgumentError) { record("use", 1, "after-expiry") }
      assert_raises(ArgumentError) { reverse(original, "second-reversal") }
      assert_equal "expired", @agreement.current_state
    end
    assert_equal %w[opening use reversal], entries.order(:id).pluck(:kind)
    assert_equal original.quantity, entries.find_by!(kind: "reversal").quantity
  end

  test "unpaid and unknown outcomes cannot grant units and verified recovery opens once" do
    assert_raises(ArgumentError) { record("opening", 3, "unpaid") }
    Clinic::Billing::SubscriptionPayments.start(agreement: @agreement, actor: @user, request_key: "payment")
    Clinic::Billing::SubscriptionPayments.deliver_fixture(agreement: @agreement, actor: @actor, outcome: "unknown", request_key: "unknown")
    assert_raises(ArgumentError) { record("opening", 3, "unknown-opening") }
    assert_nil balance[:remaining_quantity]
    assert_empty entries
    Clinic::Billing::SubscriptionPayments.deliver_fixture(agreement: @agreement, actor: @actor, outcome: "succeeded", request_key: "resolved")
    record("opening", 3, "resolved-opening")
    assert_equal 3, balance[:remaining_quantity]
    assert_equal 1, @agreement.invoice.payment_allocations.count
  end

  test "snapshot quantities selected services and frequencies govern allowance" do
    pay
    assert_raises(ArgumentError) { record("opening", 4, "too-many") }
    assert_raises(ArgumentError) { record("opening", 1, "unselected", service_id: @unselected.id) }
    @package.reload.update!(draft: @package.draft.merge("max_per_patient" => 2, "components" => [
      { "service_id" => @service.id, "mode" => "included", "quantity" => 100, "frequency" => "week" }
    ]))
    @version = publish("replacement")
    record("opening", 3, "old-snapshot")
    assert_equal 3, balance[:purchased_quantity]
    other = checkout("other-purchase")
    pay(other)
    assert_equal "allowance_unconfigured", balance(other)[:status]
    assert_nil balance(other)[:remaining_quantity]
    assert_raises(ArgumentError) { record("opening", 1, "weekly", agreement: other) }
  end

  test "zero opening is exhausted and invalid or fractional units are rejected" do
    pay
    [ "1.5", -1, "", nil ].each do |quantity|
      assert_raises(ArgumentError) { record("opening", quantity, "invalid") }
    end
    record("opening", 0, "zero")
    assert_equal "exhausted", balance[:status]
    assert_equal 0, balance[:remaining_quantity]
    assert_raises(ArgumentError) { record("use", 0, "zero-use") }
    assert_raises(ArgumentError) { record("use", 1, "no-units") }
  end

  test "patient read permission and foreign staff cannot mutate balances" do
    pay
    outsider = User.create!(email_address: "entitlement-other-staff@example.invalid", password: SecureRandom.hex(20))
    foreign = Clinic::Practice.create!(name: "Foreign entitlement clinic")
    grant_permissions!(foreign.memberships.create!(user: outsider), "billing.payment_record")
    [ @user, outsider ].each do |actor|
      assert_raises(Clinic::Authorization::Denied) { record("opening", 3, "denied", actor: actor) }
    end
    set_permission!(@membership, "billing.payment_record", false)
    assert_raises(Clinic::Authorization::Denied) { record("opening", 3, "read-only") }
    assert_empty entries
  end

  test "audit failure rolls back entitlement evidence" do
    pay
    original = Clinic::AuditRecorder.method(:record!)
    Clinic::AuditRecorder.define_singleton_method(:record!) { |**| raise Clinic::AuditRecorder::Unavailable }
    begin
      assert_raises(Clinic::AuditRecorder::Unavailable) { record("opening", 3, "audit-failure") }
    ensure
      Clinic::AuditRecorder.define_singleton_method(:record!, original)
    end
    assert_empty entries
    assert_nil balance[:remaining_quantity]
  end

  test "database preserves immutable quantities and prevents bypass overdraw or mismatched reversal" do
    pay
    opening = record("opening", 3, "opening")
    use = record("use", 2, "use")
    assert_raises(ActiveRecord::StatementInvalid) do
      ApplicationRecord.transaction(requires_new: true) { use.update_columns(quantity: 1) }
    end
    assert_raises(ActiveRecord::StatementInvalid) do
      ApplicationRecord.transaction(requires_new: true) { entries.where(id: opening.id).delete_all }
    end
    assert_raises(ActiveRecord::StatementInvalid) do
      ApplicationRecord.transaction(requires_new: true) do
        entries.create!(actor: @actor, service_id: @service.id, kind: "use", quantity: 2,
          request_key: "raw-overdraw", source_reference: "synthetic-source")
      end
    end
    assert_raises(ActiveRecord::StatementInvalid) do
      ApplicationRecord.transaction(requires_new: true) do
        entries.create!(actor: @actor, service_id: @service.id, kind: "reversal", quantity: 1,
          reversed_entry: use, request_key: "raw-mismatch", source_reference: "synthetic-source")
      end
    end
    assert_raises(ActiveRecord::RecordNotFound) { reverse(opening, "reverse-opening") }
    assert_equal 1, balance[:remaining_quantity]
  end

  test "single and batch projections agree on package balances" do
    pay
    record("opening", 3, "opening")
    record("use", 1, "use")
    single = Clinic::Care::SubscriptionProjection.agreement(@agreement)
    batch = Clinic::Care::SubscriptionProjection.collection(Clinic::Care::SubscriptionAgreement.where(id: @agreement.id))
    assert_equal single, batch.first
    assert_equal 2, single[:entitlements].first[:remaining_quantity]
    assert_equal "staff_recorded_package_ledger", single[:entitlements].first[:source]
  end

  private

  def publish(key = "published")
    Clinic::Care::SubscriptionCatalog.publish(practice: @practice, actor: @actor, id: @package.id,
      request_key: key, lock_version: @package.reload.lock_version)
  end

  def checkout(key = "purchased")
    Clinic::Care::SubscriptionPurchase.checkout(identity: @identity, actor: @user, version_id: @version.id,
      selections: [], request_key: key)
  end

  def pay(agreement = @agreement)
    Clinic::Billing::AllocatePayment.call(practice: @practice, actor: @actor, patient: @patient, invoice: agreement.invoice,
      external_event_reference: "entitlement-payment-#{agreement.id}", currency: "USD", amount: "15.00")
    Clinic::Billing::SubscriptionPayments.reconcile_ledger(agreement: agreement, actor: @actor, request_key: "ledger-paid")
  end

  def record(kind, quantity, key, agreement: @agreement, actor: @actor, service_id: @service.id)
    Clinic::Care::SubscriptionEntitlements.record(agreement: agreement, actor: actor, kind: kind,
      service_id: service_id, quantity: quantity, source_reference: "synthetic-source-#{key}", request_key: key)
  end

  def reverse(entry, key)
    Clinic::Care::SubscriptionEntitlements.record(agreement: @agreement, actor: @actor, kind: "reversal",
      reversed_entry_id: entry.id, source_reference: "synthetic-source-#{key}", request_key: key)
  end

  def entries
    Clinic::Care::SubscriptionEntitlements.records(@agreement)
  end

  def balance(agreement = @agreement)
    Clinic::Care::SubscriptionProjection.agreement(agreement)[:entitlements].first
  end
end
