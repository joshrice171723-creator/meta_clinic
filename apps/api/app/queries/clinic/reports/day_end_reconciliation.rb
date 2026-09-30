module Clinic
  module Reports
    # Captures source values for staff comparison, never settles or rewrites a ledger.
    class DayEndReconciliation
      MAX_RECORDS = 500
      class SourceChanged < StandardError; end

      def self.call(practice:, actor:, date:, site:)
        RecordDayEndReview.authorize!(practice:, actor:)
        raise ActiveRecord::RecordNotFound unless site.practice_id == practice.id

        visits = DailyVisitsByState.call(practice:, actor:, date:, site:)
        invoices = DailyInvoices.call(practice:, actor:, date:)
        payments = DailyPaymentActivity.call(practice:, actor:, date:)
        drawers = DailyCashDrawers.call(practice:, actor:, date:)
        financial_interval = Time.iso8601(invoices[:interval_start])...Time.iso8601(invoices[:interval_end])
        visit_interval = Time.iso8601(visits[:interval_start])...Time.iso8601(visits[:interval_end])
        invoice_scope = practice.invoices.where(created_at: financial_interval)
        payment_scope = Clinic::PaymentEvent.where(practice:, created_at: financial_interval)
        refund_scope = Clinic::RefundEvent.where(practice:, created_at: financial_interval)
        drawer_scope = practice.cash_drawer_sessions.where(created_at: financial_interval)
        earlier = practice.cash_drawer_sessions.where("created_at < ?", financial_interval.begin)
        carried_scope = earlier.where(status: "open").or(earlier.where(status: "closed", reconciliation_status: "pending"))
        visit_scope = practice.appointments.where(site:, starts_at: visit_interval)
        sources = {
          "invoices" => rows(invoice_scope, :id, :patient_id, :encounter_id, :currency, :status, :updated_at),
          "invoice_lines" => rows(Clinic::InvoiceLine.where(practice:, invoice_id: invoice_scope.select(:id)), :id, :invoice_id, :posted_amount),
          "credits" => rows(Clinic::CreditNote.where(practice:, invoice_id: invoice_scope.select(:id)),
            :id, :invoice_id, :currency, :amount, :adjustment_type),
          "allocations" => rows(Clinic::PaymentAllocation.where(practice:).where(invoice_id: invoice_scope.select(:id))
            .or(Clinic::PaymentAllocation.where(practice:).where(payment_event_id: payment_scope.select(:id))),
            :id, :invoice_id, :payment_event_id, :amount),
          "payments" => rows(payment_scope, :id, :patient_id, :currency, :amount, :created_at),
          "refunds" => rows(refund_scope, :id, :patient_id, :payment_event_id, :currency, :amount, :created_at),
          "drawers" => drawer_rows(drawer_scope, practice:),
          "carried_drawers" => drawer_rows(carried_scope, practice:),
          "visits" => rows(visit_scope, :id, :site_id, :patient_id, :status, :starts_at, :updated_at)
        }
        snapshot = {
          "invoices" => invoices.slice(:definition, :date, :timezone, :interval_start, :interval_end, :as_of, :currencies),
          "payments" => payments.slice(:definition, :date, :timezone, :interval_start, :interval_end, :as_of, :currencies),
          "drawers" => drawers.slice(:definition, :date, :timezone, :as_of, :open_count,
            :awaiting_reconciliation_count, :variance_count, :carried_count),
          "visits" => visits.slice(:definition, :date, :timezone, :interval_start, :interval_end, :as_of, :counts, :total),
          "reconciliation" => { "version" => 1, "site_id" => site.id, "sources" => sources,
            "scope" => "Practice-date financial cohorts and selected-site local-date visits; no equality between these different cohorts is implied." }
        }.deep_stringify_keys
        digest = Digest::SHA256.hexdigest(JSON.generate(without_capture_times(snapshot)))
        { snapshot:, source_digest: digest }
      end

      def self.rows(scope, *attributes)
        bounded(scope).pluck(*attributes).map do |values|
          attributes.zip(values.map { |value| source_value(value) }).to_h
        end
      end

      def self.source_value(value)
        return value.to_s("F") if value.is_a?(BigDecimal)
        return value.iso8601(6) if value.respond_to?(:iso8601)

        value
      end

      def self.drawer_rows(scope, practice:)
        bounded(scope)
        DailyCashDrawers.drawer_rows(scope.order(:id).limit(MAX_RECORDS), practice:)
      end

      def self.bounded(scope)
        raise ArgumentError, "This source cohort exceeds 500 records. No partial reconciliation can be saved." if scope.limit(MAX_RECORDS + 1).count > MAX_RECORDS

        scope.order(:id).limit(MAX_RECORDS)
      end

      def self.without_capture_times(value)
        case value
        when Hash then value.except("as_of").transform_values { |child| without_capture_times(child) }
        when Array then value.map { |child| without_capture_times(child) }
        else value
        end
      end
      private_class_method :rows, :source_value, :drawer_rows, :bounded, :without_capture_times
    end
  end
end
