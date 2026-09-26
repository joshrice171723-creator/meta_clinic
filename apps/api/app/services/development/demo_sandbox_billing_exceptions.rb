module Development
  class DemoSandboxBillingExceptions
    CREDIT_AMOUNT = BigDecimal("5.00")
    REASON = "Courtesy credit for this visit"

    def self.prepare!(run)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? &&
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?

      run.practice.organization.practices.order(:id).each do |practice|
        practice.sites.order(:id).each do |site|
          invoice = eligible_invoices(practice, site).first ||
            raise(ArgumentError, "Billing exception needs an unpaid posted background invoice at #{site.name}")
          amount = [ invoice.lines.sum(:posted_amount), CREDIT_AMOUNT ].min
          raise ArgumentError, "Billing exception needs a positive invoice balance" unless amount.positive?

          Clinic::Billing::InvoiceAdjustments.credit(
            invoice:, actor: run.operator_user, amount:, reason: REASON,
            request_key: "sandbox-billing-credit-#{invoice.id}"
          )
        end
      end
    end

    def self.eligible_invoices(practice, site)
      blocked_states = Clinic::Billing::InvoiceAdjustments::BLOCKING_COLLECTION_STATES
      practice.invoices.joins(:encounter, :patient).where(status: "posted", clinic_encounters: { site_id: site.id })
        .where("clinic_patients.reference LIKE 'SBX-%'")
        .where.not(id: Clinic::PaymentAllocation.where(practice:).select(:invoice_id))
        .where.not(id: Clinic::CreditNote.where(practice:).select(:invoice_id))
        .where.not(id: Clinic::PaymentCollectionIntent.where(practice:, state: blocked_states).select(:invoice_id))
        .includes(:lines).order(:id)
    end
    private_class_method :eligible_invoices
  end
end
