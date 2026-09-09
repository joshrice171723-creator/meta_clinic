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
    applied_and_refunded.refund_events.create!(practice: @practice, patient: @patient, currency: "USD", amount: "30.00", reason: "Fixture refund")

    fully_consumed = payment(reference: "ledger-refunded-floor", amount: "100.00")
    fully_consumed.allocations.create!(practice: @practice, patient: @patient, invoice: @invoice, amount: "70.00")
    fully_consumed.refund_events.create!(practice: @practice, patient: @patient, currency: "USD", amount: "40.00", reason: "Fixture refund")

    payments = Clinic::Billing::PatientLedger.call(practice: @practice, patient: @patient).fetch(:payments).index_by { |entry| entry.fetch(:id) }

    assert_equal "45.0", payments.fetch(applied_and_refunded.id).fetch(:unapplied_amount)
    assert_equal "0.0", payments.fetch(fully_consumed.id).fetch(:unapplied_amount)
  end

  test "bounds history pages without truncating all-history balances" do
    21.times do |index|
      invoice = @practice.invoices.create!(patient: @patient, currency: "USD", status: "draft", rounding_policy_version: "v1")
      invoice.lines.create!(practice: @practice, patient: @patient, quantity: "1", unit_amount: "1.00",
        posted_amount: "1.00", description_snapshot: "Older charge #{index}")
      invoice.transition_to!("posted")
      payment(reference: "ledger-page-#{index}", amount: "1.00")
    end

    ledger = Clinic::Billing::PatientLedger.call(
      practice: @practice, patient: @patient, history_limit: Clinic::Billing::PatientLedger::HISTORY_LIMIT
    )

    assert_equal 20, ledger.fetch(:invoices).length
    assert_equal 20, ledger.fetch(:payments).length
    assert_equal "121.0", ledger.fetch(:currencies).sole.fetch(:invoiced_amount)
    invoice_cursor = ledger.dig(:pagination, :invoices, :next_cursor)
    payment_cursor = ledger.dig(:pagination, :payments, :next_cursor)
    assert invoice_cursor
    assert payment_cursor

    older_invoices = Clinic::Billing::PatientLedger.history_page(
      practice: @practice, patient: @patient, kind: "invoices", before: invoice_cursor
    )
    older_payments = Clinic::Billing::PatientLedger.history_page(
      practice: @practice, patient: @patient, kind: "payments", before: payment_cursor
    )

    assert_equal 2, older_invoices.fetch(:items).length
    assert_nil older_invoices.fetch(:next_cursor)
    assert_equal 1, older_payments.fetch(:items).length
    assert_nil older_payments.fetch(:next_cursor)
    assert_empty ledger.fetch(:invoices).map { |item| item.fetch(:id) } & older_invoices.fetch(:items).map { |item| item.fetch(:id) }
    assert_empty ledger.fetch(:payments).map { |item| item.fetch(:id) } & older_payments.fetch(:items).map { |item| item.fetch(:id) }
  end

  private

  def payment(reference:, amount:)
    Clinic::PaymentEvent.create!(practice: @practice, patient: @patient, currency: "USD", amount: amount,
      external_event_reference: reference)
  end
end
