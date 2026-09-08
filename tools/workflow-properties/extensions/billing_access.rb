# Real billing services; all fixture writes are rolled back by bridge.rb.
class WorkflowPropertyCase
  def ba_invoice(amount)
    patient = @practice.patients.create!(display_name: "Billing Property", reference: SecureRandom.hex(10))
    invoice = Clinic::Billing::DraftInvoice.call(practice: @practice, actor: @actor, patient: patient, currency: "USD",
      lines: [{ quantity: "1", unit_amount: amount, description_snapshot: "Visit" }], request_key: SecureRandom.uuid)
    [patient, invoice]
  end

  def ba_attempt
    yield
    nil
  rescue ArgumentError, ActiveRecord::RecordInvalid, ActiveRecord::RecordNotDestroyed => e
    e.message
  rescue ActiveRecord::StatementInvalid => e
    raise unless e.message.include?("This record is append-only") && e.message.include?("clinic_invoice_line_editable_draft")
    e.message
  end

  def billing_invoice_contract(input)
    patient, invoice = ba_invoice(input.fetch("amount"))
    mode = input.fetch("mode")
    original = invoice.lines.sole.attributes.slice("id", "quantity", "unit_amount", "description_snapshot")
    if mode == "create"
      before = @practice.invoices.count
      error = ba_attempt { Clinic::Billing::DraftInvoice.call(practice: @practice, actor: @actor, patient: patient,
        currency: "USD", lines: input.fetch("lines"), request_key: SecureRandom.uuid) }
      return { error: error, added: @practice.invoices.count - before }
    end
    Clinic::Billing::PostInvoice.call(invoice: invoice, actor: @actor, request_key: SecureRandom.uuid) if input["posted"]
    if mode == "delete_line"
      error = ba_attempt { invoice.lines.sole.destroy! }
    else
      error = ba_attempt { Clinic::Billing::UpdateDraftInvoice.call(practice: @practice, actor: @actor, invoice: invoice,
        currency: "USD", lines: input.fetch("lines")) }
    end
    { error: error, unchanged: invoice.reload.lines.sole.attributes.slice(*original.keys) == original }
  end

  def billing_adjustment_contract(input)
    _, invoice = ba_invoice(input.fetch("amount"))
    Clinic::Billing::PostInvoice.call(invoice: invoice, actor: @actor, request_key: SecureRandom.uuid)
    if input["paid"]
      Clinic::Billing::AllocatePayment.call(practice: @practice, actor: @actor, patient: invoice.patient, invoice: invoice,
        external_event_reference: SecureRandom.uuid, currency: "USD", amount: input.fetch("amount"))
    end
    key = SecureRandom.uuid
    action = input.fetch("action")
    args = { invoice: invoice, actor: @actor, reason: input.fetch("reason", "Correction"), request_key: key }
    args[:amount] = input.fetch("credit") if action == "credit"
    replayed = nil
    error = ba_attempt do
      Clinic::Billing::InvoiceAdjustments.public_send(action, **args)
      replayed = Clinic::Billing::InvoiceAdjustments.public_send(action, **args).replayed if input["retry"]
    end
    { error: error, status: invoice.reload.status, credits: invoice.credit_notes.count,
      refunded: Clinic::RefundEvent.where(practice: @practice).count, replayed: replayed }
  end

  def billing_cash_contract(input)
    patient, invoice = ba_invoice(input.fetch("amount"))
    Clinic::Billing::PostInvoice.call(invoice: invoice, actor: @actor, request_key: SecureRandom.uuid)
    site = @practice.sites.create!(name: "Cash site", code: SecureRandom.hex(5))
    drawer = @practice.cash_drawer_sessions.create!(site: site, opened_by: @actor, opening_float: "0")
    drawer.update!(status: "closed", closed_by: @actor, closed_at: Time.current) if input["closed"]
    args = { practice: @practice, actor: @actor, patient: patient, invoice: invoice, drawer_session: drawer,
      tendered_amount: input.fetch("tender"), allocation_amount: input.fetch("amount"), request_key: SecureRandom.uuid }
    error = ba_attempt do
      allocation = Clinic::Billing::RecordCashPayment.call(**args)
      Clinic::Billing::RecordCashPayment.call(**args) if input["retry"]
      if input.key?("refund")
        Clinic::Billing::RecordCashRefund.call(practice: @practice, actor: @actor, payment: allocation.payment_event, amount: input["refund"])
      end
    end
    result = Clinic::Billing::CashDrawer.call(drawer.reload)
    { error: error, tenders: drawer.cash_tenders.count, allocations: invoice.payment_allocations.count,
      refunds: Clinic::RefundEvent.where(practice: @practice).count,
      receipts: Clinic::BillingReceipt.where(practice: @practice).count,
      change: drawer.cash_tenders.first&.change_amount&.to_s("F"), expected: result[:expected_cash] }
  end

  def billing_membership_definition(input)
    family = Clinic::Care::SubscriptionFamily.create!(practice: @practice, name: "Property family", display_order: 0)
    option = Clinic::Care::ServiceOption.create!(practice: @practice, name: "Included visit")
    draft = { "amount" => "50.00", "duration" => 1, "duration_unit" => "months", "terms" => "One included visit",
      "components" => [{ "service_id" => option.id, "mode" => "included" }] }
    package = Clinic::Care::SubscriptionPackage.create!(practice: @practice, family: family, name: "Property membership", draft: draft)
    baseline = Clinic::Care::SubscriptionDefinition.build(package)
    raise "Invalid membership baseline" unless baseline.fetch("components").one?
    draft = draft.merge(input.fetch("changes"))
    input.fetch("omit", []).each { |field| draft.delete(field) }
    package.draft = draft
    error = ba_attempt { Clinic::Care::SubscriptionDefinition.build(package) }
    { error: error }
  end
end
