require "test_helper"

class SubscriptionWorkflowTest < ActiveSupport::TestCase
  setup do
    @practice = Clinic::Practice.create!(name: "Dev Seed Catalog Clinic")
    @actor = User.create!(email_address: "catalog-admin@example.invalid", password: SecureRandom.hex(20))
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "subscription_catalog.read", "subscription_catalog.write", "subscription_catalog.publish", "subscriptions.review", "billing.read", "billing.payment_record")
    @patient = @practice.patients.create!(display_name: "Dev Seed Catalog Patient", reference: "CATALOG-001")
    @user = User.create!(email_address: "catalog-patient@example.invalid", password: SecureRandom.hex(20))
    @identity = Clinic::PatientPortal::Identity.create!(practice: @practice, patient: @patient, user: @user, status: "active", invited_at: Time.current, activated_at: Time.current)
    @family = Clinic::Care::SubscriptionFamily.create!(practice: @practice, name: "Trail Services")
    Clinic::Care::SubscriptionCatalog.save(practice: @practice, actor: @actor, kind: "family", id: @family.id, attributes: { "lock_version" => 0, "publish" => true })
    @options = 4.times.map { |index| Clinic::Care::ServiceOption.create!(practice: @practice, name: "Custom service #{index}") }
    @package = Clinic::Care::SubscriptionPackage.create!(practice: @practice, family: @family, name: "Flexible plan", draft: {
      "amount" => "12.30", "currency" => "USD", "duration" => 1, "duration_unit" => "months", "terms" => "One term; optional manual renewal. Refunds require clinic review.",
      "components" => [
        { "service_id" => @options[0].id, "mode" => "included" },
        { "service_id" => @options[1].id, "mode" => "choose_one", "group" => "Choose your service", "price_adjustment" => "0.10" },
        { "service_id" => @options[2].id, "mode" => "choose_one", "group" => "Choose your service" },
        { "service_id" => @options[3].id, "mode" => "optional", "price_adjustment" => "0.20" }
      ]
    })
    @version = publish("publish-1")
  end

  def publish(key)
    Clinic::Care::SubscriptionCatalog.publish(practice: @practice, actor: @actor, id: @package.id, request_key: key, lock_version: @package.reload.lock_version)
  end

  def checkout(key = "purchase-1", selections: [@options[1].id, @options[3].id])
    Clinic::Care::SubscriptionPurchase.checkout(identity: @identity, actor: @user, version_id: @version.id, selections: selections, request_key: key)
  end

  def pay(agreement)
    Clinic::Billing::SubscriptionPayments.start(agreement: agreement, actor: @user, request_key: "payment-1")
  end

  def deliver(agreement, outcome = "succeeded", key = "event-1")
    Clinic::Billing::SubscriptionPayments.deliver_fixture(agreement: agreement, actor: @actor, outcome: outcome, request_key: key)
  end

  test "custom names, exact options, one invoice, immutable history and duplicate payment" do
    agreement = checkout
    assert_equal BigDecimal("12.60"), agreement.amount
    assert_equal agreement.id, checkout.id
    assert_equal 1, @patient.invoices.count
    assert_raises(ArgumentError) { checkout("purchase-1", selections: [@options[2].id]) }
    assert_raises(ArgumentError) { checkout("new-purchase") }
    assert_equal BigDecimal("12.60"), agreement.invoice.lines.sum(:posted_amount)
    intent = pay(agreement)
    assert_equal intent.id, pay(agreement).id
    deliver(agreement)
    deliver(agreement)
    assert_equal "active", agreement.current_state
    assert_equal 1, agreement.invoice.payment_allocations.count
    assert_equal "0.0", Clinic::Care::SubscriptionProjection.agreement(agreement)[:balance]
    assert_equal 1, Clinic::BillingReceipt.where(invoice: agreement.invoice).count
    @package.reload.update!(name: "Replacement name", draft: @package.draft.merge("amount" => "99.99"))
    publish("publish-2")
    assert_equal "Flexible plan", agreement.reload.snapshot["package_name"]
    assert_equal BigDecimal("12.60"), agreement.amount
    assert_raises(ActiveRecord::StatementInvalid) do
      ApplicationRecord.transaction(requires_new: true) { agreement.update_columns(amount: 1) }
    end
    assert_raises(ActiveRecord::StatementInvalid) do
      ApplicationRecord.transaction(requires_new: true) { @version.update_columns(snapshot: {}) }
    end
  end

  test "subscription collection batches list projections without changing each agreement" do
    agreements = [checkout]
    3.times do |index|
      patient = @practice.patients.create!(display_name: "Subscription list patient #{index}", reference: "SUB-LIST-#{index}")
      user = User.create!(email_address: "subscription-list-#{index}@example.invalid", password: SecureRandom.hex(20))
      identity = Clinic::PatientPortal::Identity.create!(practice: @practice, patient: patient, user: user,
        status: "active", invited_at: Time.current, activated_at: Time.current)
      agreements << Clinic::Care::SubscriptionPurchase.checkout(identity: identity, actor: user,
        version_id: @version.id, selections: [@options[1].id, @options[3].id], request_key: "subscription-list-#{index}")
    end

    individual = nil
    individual_queries = select_query_count do
      individual = Clinic::Care::SubscriptionAgreement.where(id: agreements.map(&:id)).order(:id).map do |agreement|
        Clinic::Care::SubscriptionProjection.agreement(agreement)
      end
    end
    collection = nil
    collection_queries = select_query_count do
      collection = Clinic::Care::SubscriptionProjection.collection(
        Clinic::Care::SubscriptionAgreement.where(id: agreements.map(&:id)).order(:id)
      )
    end

    assert_equal individual, collection
    assert_operator collection_queries, :<=, individual_queries - 8,
      "expected collection projection to avoid per-agreement queries (individual=#{individual_queries}, collection=#{collection_queries})"
  end

  test "subscription package definition batches service option lookups" do
    options = @options + 8.times.map do |index|
      Clinic::Care::ServiceOption.create!(practice: @practice, name: "Package batch service #{index}")
    end
    @package.reload.update!(draft: @package.draft.merge("components" => options.map do |option|
      { "service_id" => option.id, "mode" => "included" }
    end))
    option_queries = []
    subscriber = lambda do |_name, _started, _finished, _unique_id, payload|
      sql = payload[:sql].to_s
      option_queries << sql if sql.match?(/\ASELECT.*FROM "clinic_service_options"/mi)
    end
    snapshot = nil

    ActiveRecord::Base.uncached do
      ActiveSupport::Notifications.subscribed(subscriber, "sql.active_record") do
        snapshot = Clinic::Care::SubscriptionDefinition.build(@package)
      end
    end

    assert_equal options.map(&:id), snapshot.fetch("components").map { |component| component.fetch("service_id") }
    assert_equal 1, option_queries.length, option_queries.join("\n")
  end

  test "selection cardinality and foreign options fail closed" do
    assert_raises(ArgumentError) { checkout(selections: []) }
    assert_raises(ArgumentError) { checkout(selections: [@options[1].id, @options[2].id]) }
    assert_raises(ArgumentError) { checkout(selections: [@options[1].id, @options[1].id]) }
    assert_raises(ArgumentError) { checkout(selections: [99999999]) }
    assert_equal 0, @patient.invoices.count
  end

  test "unknown payment cannot retry, then verified recovery activates once" do
    agreement = checkout
    pay(agreement)
    deliver(agreement, "unknown")
    assert_equal "outcome_unknown", agreement.current_state
    assert_raises(ArgumentError) { Clinic::Billing::SubscriptionPayments.start(agreement: agreement, actor: @user, request_key: "blind-retry") }
    assert_raises(ArgumentError) { Clinic::Care::SubscriptionPurchase.cancel(agreement: agreement, actor: @user, request_key: "cancel") }
    deliver(agreement, "succeeded", "recovery-1")
    assert_equal "active", agreement.current_state
    assert_equal 1, agreement.invoice.payment_allocations.count
  end

  test "decline can retry, review is required and revocation blocks purchase" do
    agreement = checkout
    pay(agreement)
    deliver(agreement, "failed")
    assert_equal "payment_failed", agreement.current_state
    Clinic::Billing::SubscriptionPayments.start(agreement: agreement, actor: @user, request_key: "retry-2")
    deliver(agreement, "succeeded", "retry-success")
    assert_equal "active", agreement.current_state
    @identity.update!(status: "revoked", revoked_at: Time.current)
    assert_raises(ActiveRecord::RecordNotFound) { checkout("after-revoke") }
  end

  test "retirement, wrong patient and missing publisher permission are denied" do
    other = User.create!(email_address: "other-catalog@example.invalid", password: SecureRandom.hex(20))
    assert_raises(ActiveRecord::RecordNotFound) do
      Clinic::Care::SubscriptionPurchase.checkout(identity: @identity, actor: other, version_id: @version.id, selections: [], request_key: "other")
    end
    agreement = checkout
    assert_raises(Clinic::Authorization::Denied) { Clinic::Care::SubscriptionPurchase.cancel(agreement: agreement, actor: other, request_key: "other") }
    set_permission!(@membership, "subscription_catalog.publish", false)
    assert_raises(Clinic::Authorization::Denied) { publish("no-permission") }
    @package.update!(retired: true)
    assert_empty Clinic::Care::SubscriptionProjection.catalog(practice: @practice)
  end

  test "refunds compensate the ledger and cannot be duplicated or exceed payment" do
    agreement = checkout
    pay(agreement)
    deliver(agreement)
    2.times { Clinic::Billing::SubscriptionPayments.refund(agreement: agreement, actor: @actor, amount: "12.60", request_key: "refund-1") }
    assert_equal "refunded", agreement.current_state
    payment = agreement.invoice.payment_allocations.first.payment_event
    assert_equal 1, payment.refund_events.count
    assert_equal BigDecimal("12.60"), payment.amount
    assert_raises(ArgumentError) { Clinic::Billing::SubscriptionPayments.refund(agreement: agreement, actor: @actor, amount: "0.01", request_key: "refund-2") }
  end

  test "required audit failure rolls back checkout" do
    original = Clinic::AuditRecorder.method(:record!)
    Clinic::AuditRecorder.define_singleton_method(:record!) { |**| raise Clinic::AuditRecorder::Unavailable }
    begin
      assert_raises(Clinic::AuditRecorder::Unavailable) { checkout }
    ensure
      Clinic::AuditRecorder.define_singleton_method(:record!, original)
    end
    assert_equal 0, @patient.invoices.count
    assert_equal 0, Clinic::Care::SubscriptionAgreement.count
  end

  test "eligibility approval gates payment and unpaid cancellation voids the invoice" do
    @package.reload.update!(draft: @package.draft.merge("eligibility_review" => true))
    @version = publish("review-version")
    agreement = checkout
    assert_equal "pending_review", agreement.current_state
    assert_raises(ArgumentError) { pay(agreement) }
    Clinic::Care::SubscriptionPurchase.review(agreement: agreement, actor: @actor, approved: true, request_key: "approve")
    assert_equal "review_approved", agreement.current_state
    Clinic::Care::SubscriptionPurchase.cancel(agreement: agreement, actor: @user, request_key: "cancel-unpaid")
    assert_equal "canceled", agreement.current_state
    assert_equal "void", agreement.invoice.reload.status
    assert_equal "0.0", Clinic::Care::SubscriptionProjection.agreement(agreement)[:balance]
  end

  test "end of term cancellation preserves access and purchase limits until its effective time" do
    @package.reload.update!(draft: @package.draft.merge("cancellation" => "end_of_term"))
    @version = publish("end-term-version")
    agreement = checkout
    pay(agreement)
    deliver(agreement)
    ending = Time.iso8601(agreement.events.find_by!(kind: "active").details.fetch("ends_at"))
    assert_equal "expired", agreement.current_state(at: ending)
    Clinic::Care::SubscriptionPurchase.cancel(agreement: agreement, actor: @user, request_key: "cancel-term")
    assert_equal "active", agreement.current_state
    assert_equal "canceled", agreement.current_state(at: ending)
    assert_raises(ArgumentError) { checkout("duplicate-active") }
    assert_equal "posted", agreement.invoice.reload.status
  end

  test "manual reconciliation activates an existing exact payment without creating another" do
    agreement = checkout
    Clinic::Billing::AllocatePayment.call(practice: @practice, actor: @actor, patient: @patient, invoice: agreement.invoice,
      external_event_reference: "manual-subscription", currency: "USD", amount: "12.60")
    2.times { Clinic::Billing::SubscriptionPayments.reconcile_ledger(agreement: agreement, actor: @actor, request_key: "ledger") }
    assert_equal "active", agreement.current_state
    assert_equal 1, agreement.invoice.payment_allocations.count
    assert_equal "posted_ledger", agreement.events.find_by!(kind: "active").details.fetch("source")
  end

  def signed_event(agreement, intent, id:, type: "payment_intent.succeeded", **overrides)
    payload = { id: id, type: type, livemode: false, account: "development:#{@practice.id}",
      data: { object: { id: "fixture_intent_#{intent.id}", amount: 1260, currency: "usd", metadata: { apply_collection_intent: intent.reference } } } }.merge(overrides)
    body = JSON.generate(payload)
    secret = "dev-seed-webhook-secret"
    timestamp = Time.current.to_i
    signature = OpenSSL::HMAC.hexdigest("SHA256", secret, "#{timestamp}.#{body}")
    Clinic::Billing::SubscriptionPayments.reconcile(agreement: agreement, actor: @actor, raw_body: body,
      signature_header: "t=#{timestamp},v1=#{signature}", secret: secret, expected_account: "development:#{@practice.id}")
  end

  def select_query_count
    count = 0
    subscriber = lambda do |_name, _started, _finished, _unique_id, payload|
      next if payload[:cached] || payload[:name] == "SCHEMA"

      count += 1 if payload[:sql].to_s.lstrip.start_with?("SELECT")
    end
    ActiveRecord::Base.uncached do
      ActiveSupport::Notifications.subscribed(subscriber, "sql.active_record") { yield }
    end
    count
  end

  test "program publication requires publisher permission and detects stale saves" do
    family = @family.reload
    lock_version = family.lock_version
    set_permission!(@membership, "subscription_catalog.publish", false)
    grant_permissions!(@membership, "subscription_catalog.write")
    assert_raises(Clinic::Authorization::Denied) do
      Clinic::Care::SubscriptionCatalog.save(practice: @practice, actor: @actor, kind: "family", id: family.id,
        attributes: { "lock_version" => lock_version, "publish" => true, "name" => "Denied rename" })
    end
    assert_equal "Trail Services", family.reload.name
    Clinic::Care::SubscriptionCatalog.save(practice: @practice, actor: @actor, kind: "family", id: family.id,
      attributes: { "lock_version" => lock_version, "name" => "Private draft" })
    assert_raises(ActiveRecord::StaleObjectError) do
      Clinic::Care::SubscriptionCatalog.save(practice: @practice, actor: @actor, kind: "family", id: family.id,
        attributes: { "lock_version" => lock_version, "name" => "Stale overwrite" })
    end
    assert_equal "Trail Services", family.reload.published_snapshot.fetch("name")
    # Publishing a tier cannot leak a separate unpublished program rename.
    set_permission!(@membership, "subscription_catalog.publish", true)
    assert_equal "Trail Services", publish("program-draft-isolated").snapshot.fetch("family_name")
  end

  test "program order and tier availability use published values" do
    other = Clinic::Care::SubscriptionFamily.create!(practice: @practice, name: "First program", display_order: 1)
    @family.reload.update!(display_order: 20)
    [other, @family].each do |family|
      Clinic::Care::SubscriptionCatalog.save(practice: @practice, actor: @actor, kind: "family", id: family.id,
        attributes: { "lock_version" => family.lock_version, "publish" => true })
    end
    extra = Clinic::Care::SubscriptionPackage.create!(practice: @practice, family: other, name: "Another tier", draft: @package.draft)
    Clinic::Care::SubscriptionCatalog.publish(practice: @practice, actor: @actor, id: extra.id, request_key: "other-program", lock_version: extra.lock_version)
    catalog = Clinic::Care::SubscriptionProjection.catalog(practice: @practice)
    assert_equal [other.id, @family.id], catalog.map { |row| row[:program]["id"] }
    start = 1.day.from_now.change(usec: 0)
    ending = start + 1.day
    @package.reload.update!(draft: @package.draft.merge("available_from" => start.iso8601, "available_until" => ending.iso8601))
    @version = publish("availability")
    assert_equal [extra.reload.published_version_id], Clinic::Care::SubscriptionProjection.catalog(practice: @practice).map { |row| row[:id] }
    assert_raises(ArgumentError) { checkout }
    travel_to(start) { assert_includes Clinic::Care::SubscriptionProjection.catalog(practice: @practice).map { |row| row[:id] }, @version.id }
    travel_to(ending) do
      assert_not_includes Clinic::Care::SubscriptionProjection.catalog(practice: @practice).map { |row| row[:id] }, @version.id
      assert_raises(ArgumentError) { checkout }
    end
  end

  test "wrong account mode amount and conflicting replay cannot post payment" do
    agreement = checkout
    intent = pay(agreement)
    assert_raises(ArgumentError) { signed_event(agreement, intent, id: "wrong-account", account: "development:other") }
    assert_raises(ArgumentError) { signed_event(agreement, intent, id: "wrong-mode", livemode: true) }
    assert_raises(ArgumentError) { signed_event(agreement, intent, id: "wrong-amount", data: { object: { id: "fixture_intent_#{intent.id}", amount: 1, currency: "usd", metadata: { apply_collection_intent: intent.reference } } }) }
    assert_empty agreement.invoice.payment_allocations
    signed_event(agreement, intent, id: "verified")
    assert_raises(Clinic::Billing::IngestProcessorEvent::ConflictingEvent) { signed_event(agreement, intent, id: "verified", type: "payment_intent.payment_failed") }
    assert_equal "active", agreement.current_state
    assert_equal 1, agreement.invoice.payment_allocations.count
  end

  test "late terminal events do not overwrite the next payment attempt" do
    agreement = checkout
    first = pay(agreement)
    deliver(agreement, "failed")
    second = Clinic::Billing::SubscriptionPayments.start(agreement: agreement, actor: @user, request_key: "second-attempt")
    signed_event(agreement, first, id: "late-first-success")
    assert_equal "processing", agreement.current_state
    assert_empty agreement.invoice.payment_allocations
    signed_event(agreement, second, id: "second-success")
    assert_equal "active", agreement.current_state
    assert_equal 1, agreement.invoice.payment_allocations.count
  end
end
