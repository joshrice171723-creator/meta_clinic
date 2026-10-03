require "test_helper"

class OutstandingProjectionTest < ActiveSupport::TestCase
  setup do
    organization = Organization.create!(name: "Synthetic Outstanding Organization")
    @practice = Clinic::Practice.create!(name: "Synthetic Outstanding Practice", organization: organization)
    @patient = @practice.patients.create!(display_name: "Synthetic Outstanding Patient", reference: "SYN-OUTSTANDING")
    @actor = User.create!(email_address: "billing-outstanding@example.invalid", password: SecureRandom.hex(18))
    membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(membership, "billing.invoice_draft", "billing.invoice_post", "billing.payment_record")
    paid = posted_invoice("Paid USD", "100.00", "USD")
    Clinic::Billing::AllocatePayment.call(practice: @practice, actor: @actor, patient: @patient, invoice: paid,
      currency: "USD", amount: "100.00", external_event_reference: "synthetic-outstanding-paid")
    Clinic::Billing::InvoiceAdjustments.credit(invoice: paid, actor: @actor, amount: "60.00",
      reason: "Synthetic paid charge correction", request_key: "synthetic-outstanding-credit")
    posted_invoice("Unpaid USD", "100.00", "USD")
    eur = posted_invoice("Unpaid EUR", "37.01", "EUR")
    Clinic::Billing::InvoiceAdjustments.credit(invoice: eur, actor: @actor, amount: "2.03",
      reason: "Synthetic EUR correction", request_key: "synthetic-outstanding-eur-credit")
  end

  test "patient summaries sum nonnegative invoice balances without netting unrelated credits" do
    ledger = Clinic::Billing::PatientLedger.call(practice: @practice, patient: @patient)
    currencies = ledger.fetch(:currencies).index_by { |row| row.fetch(:currency) }
    assert_equal "200.0", currencies.fetch("USD").fetch(:invoiced_amount)
    assert_equal "100.0", currencies.fetch("USD").fetch(:allocated_amount)
    assert_equal "60.0", currencies.fetch("USD").fetch(:credited_amount)
    assert_equal "100.0", currencies.fetch("USD").fetch(:balance_amount)
    assert_equal "34.98", currencies.fetch("EUR").fetch(:balance_amount)
    assert_equal BigDecimal("134.98"), ledger.fetch(:invoices).sum { |row| row.fetch(:balance_amount).to_d }

    other_patient = @practice.patients.create!(display_name: "Other Synthetic Outstanding Patient", reference: "OTHER-SYN-OUTSTANDING")
    posted_invoice("Other patient USD", "500.00", "USD", patient: other_patient)
    bounded = Clinic::Billing::PatientLedger.call(practice: @practice, patient: @patient, history_limit: 1)
    assert_equal currencies, bounded.fetch(:currencies).index_by { |row| row.fetch(:currency) }
  end

  test "outlook agrees with dashboard and distributes each currency exactly" do
    dashboard = Clinic::Billing::Dashboard.call(practice: @practice).fetch(:metrics).fetch(:currencies)
      .index_by { |row| row.fetch(:currency) }
    [ 3, 6, 12 ].each do |months|
      outlook = Clinic::Billing::IncomeOutlook.call(practice: @practice, now: Current.business_time, months: months)
      rows = outlook.fetch(:currencies).index_by { |row| row.fetch(:currency) }
      assert_equal "100.0", rows.fetch("USD").fetch(:outstanding)
      assert_equal "34.98", rows.fetch("EUR").fetch(:outstanding)
      rows.each do |currency, row|
        assert_equal dashboard.fetch(currency).fetch(:outstanding), row.fetch(:outstanding)
        assert_equal row.fetch(:outstanding).to_d,
          row.fetch(:forecast).sum { |month| month.fetch(:expected_existing_collections).to_d }
      end
    end
  end

  private

  def posted_invoice(description, amount, currency, patient: @patient)
    invoice = Clinic::Billing::DraftInvoice.call(practice: @practice, actor: @actor, patient: patient, currency: currency,
      lines: [ { quantity: "1", unit_amount: amount, description_snapshot: description } ])
    Clinic::Billing::PostInvoice.call(invoice: invoice, actor: @actor)
  end
end
