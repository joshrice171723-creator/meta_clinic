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
    payment.refund_events.create!(practice: @practice, patient: @patient, currency: "USD", amount: "30.00")

    assert_raises(ArgumentError, match: /cannot be allocated/) do
      allocate(invoice: @second_invoice, amount: "30.00")
    end

    allocation = allocate(invoice: @second_invoice, amount: "20.00")
    assert_equal BigDecimal("20.00"), allocation.amount
    assert_equal allocation, allocate(invoice: @second_invoice, amount: "20.00")
  end

  private

  def posted_invoice(description)
    invoice = Clinic::Billing::DraftInvoice.call(
      practice: @practice, actor: @actor, patient: @patient, currency: "USD",
      lines: [ { quantity: "1", unit_amount: "125.00", description_snapshot: description } ]
    )
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
