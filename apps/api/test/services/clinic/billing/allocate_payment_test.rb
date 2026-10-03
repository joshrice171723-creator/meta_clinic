require "test_helper"

class AllocatePaymentTest < ActiveSupport::TestCase
  setup do
    organization = Organization.create!(name: "Allocation boundary organization")
    @practice = Clinic::Practice.create!(name: "Allocation boundary practice", organization: organization)
    @actor = User.create!(email_address: "allocation-boundary@example.invalid", password: SecureRandom.hex(20))
    membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(membership, "billing.invoice_draft", "billing.invoice_post", "billing.payment_record")
    @patient = @practice.patients.create!(display_name: "Allocation boundary patient", reference: "ALLOCATION-001")
    @first_invoice = posted_invoice("First visit")
    @second_invoice = posted_invoice("Second visit")
  end

  test "does not allocate refunded payment funds while preserving the remaining replay-safe balance" do
    payment = Clinic::PaymentEvent.create!(practice: @practice, patient: @patient, currency: "USD",
      amount: "100.00", external_event_reference: "allocation-refund-boundary")
    payment.allocations.create!(practice: @practice, patient: @patient, invoice: @first_invoice, amount: "50.00")
    payment.refund_events.create!(practice: @practice, patient: @patient, currency: "USD", amount: "30.00", reason: "Fixture refund")

    assert_raises(ArgumentError, match: /cannot be allocated/) do
      allocate(invoice: @second_invoice, amount: "30.00")
    end

    allocation = allocate(invoice: @second_invoice, amount: "20.00")
    assert_equal BigDecimal("20.00"), allocation.amount
    assert_equal allocation, allocate(invoice: @second_invoice, amount: "20.00")
  end

  test "allocations respect credits and write-offs without losing exact replay" do
    %w[credit write_off].each do |adjustment_type|
      invoice = posted_invoice("#{adjustment_type} boundary")
      Clinic::Billing::InvoiceAdjustments.public_send(adjustment_type,
        invoice: invoice, actor: @actor, amount: "100.00", reason: "Synthetic charge correction",
        request_key: "allocation-#{adjustment_type}")
      reference = "allocation-#{adjustment_type}-payment"
      parameters = {
        practice: @practice, actor: @actor, patient: @patient, invoice: invoice,
        external_event_reference: reference, currency: "USD", payment_amount: "100.00"
      }

      assert_no_difference [ "Clinic::PaymentEvent.count", "Clinic::PaymentAllocation.count" ] do
        assert_raises(ArgumentError, match: /remaining balance/) do
          Clinic::Billing::AllocatePayment.call(**parameters, amount: "25.01")
        end
      end
      allocation = Clinic::Billing::AllocatePayment.call(**parameters, amount: "25.00")
      assert_equal BigDecimal("25.00"), allocation.amount
      assert_no_difference "Clinic::PaymentAllocation.count" do
        assert_equal allocation, Clinic::Billing::AllocatePayment.call(**parameters, amount: "25.00")
      end
      assert_raises(ArgumentError, match: /original event/) do
        Clinic::Billing::AllocatePayment.call(**parameters, amount: "24.00")
      end

      Clinic::Billing::InvoiceAdjustments.credit(invoice: invoice, actor: @actor, amount: "1.00",
        reason: "Synthetic later correction", request_key: "later-#{adjustment_type}")
      assert_equal allocation, Clinic::Billing::AllocatePayment.call(**parameters, amount: "25.00")
      assert_equal 0, allocation.payment_event.refund_events.count
    end
  end

  test "posting rejects changed reviewed lines and replays the newly reviewed version" do
    invoice = draft_invoice("Reviewed posting boundary")
    reviewed_at = invoice.updated_at.iso8601(6)
    travel 1.second do
      Clinic::Billing::UpdateDraftInvoice.call(practice: @practice, actor: @actor, invoice: invoice,
        currency: "USD", request_key: "posting-concurrent-edit", expected_updated_at: reviewed_at,
        lines: [ { quantity: "1", unit_amount: "90.00", description_snapshot: "Changed reviewed lines" } ])
    end

    assert_raises(ArgumentError, match: /changed after review/) do
      Clinic::Billing::PostInvoice.call(invoice: invoice, actor: @actor,
        request_key: "stale-reviewed-post", expected_updated_at: reviewed_at)
    end
    assert_equal "draft", invoice.reload.status
    current_review = invoice.updated_at.iso8601(6)
    posted = Clinic::Billing::PostInvoice.call(invoice: invoice, actor: @actor,
      request_key: "current-reviewed-post", expected_updated_at: current_review)
    assert_equal "posted", posted.status
    assert_equal BigDecimal("90.00"), posted.lines.sum(:posted_amount)
    assert_equal posted, Clinic::Billing::PostInvoice.call(invoice: invoice, actor: @actor,
      request_key: "current-reviewed-post", expected_updated_at: current_review)
  end

  private

  def draft_invoice(description)
    Clinic::Billing::DraftInvoice.call(
      practice: @practice, actor: @actor, patient: @patient, currency: "USD",
      lines: [ { quantity: "1", unit_amount: "125.00", description_snapshot: description } ]
    )
  end

  def posted_invoice(description)
    invoice = draft_invoice(description)
    Clinic::Billing::PostInvoice.call(invoice: invoice, actor: @actor)
    invoice
  end

  def allocate(invoice:, amount:)
    Clinic::Billing::AllocatePayment.call(
      practice: @practice, actor: @actor, patient: @patient, invoice: invoice,
      external_event_reference: "allocation-refund-boundary", currency: "USD", amount: amount,
      payment_amount: "100.00"
    )
  end
end
