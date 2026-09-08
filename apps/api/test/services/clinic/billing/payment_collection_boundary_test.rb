require "test_helper"

class PaymentCollectionBoundaryTest < ActiveSupport::TestCase
  setup do
    @organization = Organization.create!(name: "Synthetic Processor Organization")
    @practice = Clinic::Practice.create!(name: "Synthetic Processor Practice", organization: @organization)
    @actor = User.create!(email_address: "processor-actor@example.invalid", password: SecureRandom.hex(20))
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "billing.invoice_draft", "billing.invoice_post", "billing.payment_record")
    @patient = @practice.patients.create!(display_name: "SYN_Processor, Patient", reference: "SYN-PROCESSOR-001")
    @invoice = Clinic::Billing::DraftInvoice.call(
      practice: @practice, actor: @actor, patient: @patient, currency: "USD",
      lines: [ { quantity: "1", unit_amount: "125.00", description_snapshot: "Synthetic consultation" } ]
    )
    Clinic::Billing::PostInvoice.call(invoice: @invoice, actor: @actor)
    @now = Time.utc(2026, 9, 3, 18, 0, 0)
  end

  def signed(body, secret: "synthetic-webhook-secret", timestamp: @now.to_i)
    signature = OpenSSL::HMAC.hexdigest(OpenSSL::Digest.new("SHA256"), secret, "#{timestamp}.#{body}")
    [ "t=#{timestamp}", "v1=#{signature}" ].join(",")
  end

  def event_body(event_id: "evt_synthetic_001", intent_reference: nil, type: "payment_intent.succeeded", object_id: "pi_synthetic_001")
    JSON.generate(
      id: event_id, type: type, api_version: "2026-01-28.basil",
      data: { object: {
        id: object_id, amount: 12_500, currency: "usd", status: "succeeded",
        metadata: intent_reference ? { apply_collection_intent: intent_reference } : {}
      }, sensitive_card_data: "must-not-persist" },
      request: { id: "req_sensitive_fixture" }
    )
  end

  test "creates a test-only collection intent and reuses its request key" do
    first = Clinic::Billing::CreateCollectionIntent.call(
      practice: @practice, actor: @actor, patient: @patient, invoice: @invoice,
      amount: "50.00", request_key: "collection-retry-001"
    )
    replay = Clinic::Billing::CreateCollectionIntent.call(
      practice: @practice, actor: @actor, patient: @patient, invoice: @invoice,
      amount: "50.00", request_key: "collection-retry-001"
    )

    assert_equal first, replay
    assert_match(/\Aci_[a-f0-9]{32}\z/, first.reference)
    assert_equal "stripe", first.processor
    assert_equal "test", first.mode
    assert_equal "pending", first.state
    assert_equal 1, @practice.payment_collection_intents.count
  end

  test "rejects changed details under a reused collection request key" do
    Clinic::Billing::CreateCollectionIntent.call(
      practice: @practice, actor: @actor, patient: @patient, invoice: @invoice,
      amount: "50.00", request_key: "collection-retry-002"
    )

    assert_raises(Clinic::Billing::CreateCollectionIntent::IdempotencyConflict) do
      Clinic::Billing::CreateCollectionIntent.call(
        practice: @practice, actor: @actor, patient: @patient, invoice: @invoice,
        amount: "51.00", request_key: "collection-retry-002"
      )
    end
  end

  test "allows only explicit collection intent state transitions" do
    intent = Clinic::Billing::CreateCollectionIntent.call(
      practice: @practice, actor: @actor, patient: @patient, invoice: @invoice,
      amount: "50.00", request_key: "collection-state-001"
    )

    intent.transition_to!("processing")
    intent.transition_to!("succeeded")
    assert_equal "succeeded", intent.reload.state
    assert_raises(ArgumentError, match: /cannot transition/) { intent.transition_to!("failed") }
  end

  test "fails closed for live collection mode" do
    assert_raises(ArgumentError, match: /Live card collection is not enabled/) do
      Clinic::Billing::CreateCollectionIntent.call(
        practice: @practice, actor: @actor, patient: @patient, invoice: @invoice,
        amount: "50.00", request_key: "collection-live-001", mode: "live"
      )
    end
    assert_empty @practice.payment_collection_intents
  end

  test "verifies the unmodified signed body and stores only redacted event evidence" do
    intent = Clinic::Billing::CreateCollectionIntent.call(
      practice: @practice, actor: @actor, patient: @patient, invoice: @invoice,
      amount: "50.00", request_key: "collection-webhook-001"
    )
    body = event_body(intent_reference: intent.reference)
    result = Clinic::Billing::IngestProcessorEvent.call(
      practice: @practice, raw_body: body, signature_header: signed(body),
      secret: "synthetic-webhook-secret", now: @now
    )

    assert_not result.duplicate
    assert_equal "normalized", result.event.processing_state
    assert_equal intent, result.event.payment_collection_intent
    assert_equal @patient, result.event.patient
    assert_equal "succeeded", result.event.normalized_outcome
    assert_equal Digest::SHA256.hexdigest(body), result.event.raw_payload_digest
    refute_includes result.event.redacted_payload.to_json, "must-not-persist"
    refute_includes result.event.redacted_payload.to_json, "sensitive_card_data"
    assert_equal intent.reference, result.event.redacted_payload.fetch("collection_intent_reference")
    assert_equal "pending", intent.reload.state
  end

  test "deduplicates an identical processor event and rejects a changed replay" do
    body = event_body
    first = Clinic::Billing::IngestProcessorEvent.call(
      practice: @practice, raw_body: body, signature_header: signed(body),
      secret: "synthetic-webhook-secret", now: @now
    )
    duplicate = Clinic::Billing::IngestProcessorEvent.call(
      practice: @practice, raw_body: body, signature_header: signed(body),
      secret: "synthetic-webhook-secret", now: @now
    )

    assert duplicate.duplicate
    assert_equal first.event.id, duplicate.event.id
    assert_equal 1, @practice.payment_processor_events.count

    changed = event_body(type: "payment_intent.payment_failed")
    assert_raises(Clinic::Billing::IngestProcessorEvent::ConflictingEvent) do
      Clinic::Billing::IngestProcessorEvent.call(
        practice: @practice, raw_body: changed, signature_header: signed(changed),
        secret: "synthetic-webhook-secret", now: @now
      )
    end
    assert_equal 1, @practice.payment_processor_events.count
  end

  test "keeps unmatched verified events pending reconciliation" do
    body = event_body
    result = Clinic::Billing::IngestProcessorEvent.call(
      practice: @practice, raw_body: body, signature_header: signed(body),
      secret: "synthetic-webhook-secret", now: @now
    )

    assert_equal "needs_reconciliation", result.event.processing_state
    assert_nil result.event.payment_collection_intent
    assert_nil result.event.patient
  end

  test "rejects stale or tampered signatures before persistence" do
    body = event_body(event_id: "evt_synthetic_rejected")
    assert_raises(Clinic::Billing::ProcessorWebhookVerifier::InvalidSignature) do
      Clinic::Billing::IngestProcessorEvent.call(
        practice: @practice, raw_body: body, signature_header: signed(body, timestamp: @now.to_i - 301),
        secret: "synthetic-webhook-secret", now: @now
      )
    end
    assert_raises(Clinic::Billing::ProcessorWebhookVerifier::InvalidSignature) do
      Clinic::Billing::IngestProcessorEvent.call(
        practice: @practice, raw_body: body + " ", signature_header: signed(body),
        secret: "synthetic-webhook-secret", now: @now
      )
    end
    assert_empty @practice.payment_processor_events
  end
end
