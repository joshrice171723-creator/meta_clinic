require "test_helper"

class PatientLedgerTest < ActiveSupport::TestCase
  setup do
    @practice = Clinic::Practice.create!(name: "Ledger Query Practice")
    @patient = @practice.patients.create!(display_name: "Ledger Query Patient", reference: "LEDGER-001")
    @invoice = @practice.invoices.create!(patient: @patient, currency: "USD", status: "draft", rounding_policy_version: "v1")
    @invoice.lines.create!(practice: @practice, patient: @patient, quantity: "1", unit_amount: "100.00",
      posted_amount: "100.00", description_snapshot: "Ledger test charge")
    @invoice.transition_to!("posted")
  end

  test "does not report refunded payment value as unapplied credit" do
    applied_and_refunded = payment(reference: "ledger-refunded-allocated", amount: "100.00")
    applied_and_refunded.allocations.create!(practice: @practice, patient: @patient, invoice: @invoice, amount: "25.00")
    applied_and_refunded.refund_events.create!(practice: @practice, patient: @patient, currency: "USD", amount: "30.00")

    fully_consumed = payment(reference: "ledger-refunded-floor", amount: "100.00")
    fully_consumed.allocations.create!(practice: @practice, patient: @patient, invoice: @invoice, amount: "70.00")
    fully_consumed.refund_events.create!(practice: @practice, patient: @patient, currency: "USD", amount: "40.00")

    payments = Clinic::Billing::PatientLedger.call(practice: @practice, patient: @patient).fetch(:payments).index_by { |entry| entry.fetch(:id) }

    assert_equal "45.0", payments.fetch(applied_and_refunded.id).fetch(:unapplied_amount)
    assert_equal "0.0", payments.fetch(fully_consumed.id).fetch(:unapplied_amount)
  end

  private

  def payment(reference:, amount:)
    Clinic::PaymentEvent.create!(practice: @practice, patient: @patient, currency: "USD", amount: amount,
      external_event_reference: reference)
  end
end
