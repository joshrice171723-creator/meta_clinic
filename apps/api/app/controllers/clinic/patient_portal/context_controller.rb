module Clinic
  module PatientPortal
    class ContextController < BaseController
      def show
        ledger = Clinic::Billing::PatientLedger.call(practice: portal_practice, patient: portal_patient)
        invoice_payments = ledger.fetch(:invoices).filter_map { |invoice| invoice[:online_payment] }
        payment_collection = patient_portal_identity.present? && !development_omni_preview? &&
          invoice_payments.any? { |payment| payment[:eligible] || %w[processing needs_reconciliation].include?(payment[:state]) }
        record_portal_read("patient_portal.context.read")
        payload = {
          schema_version: "patient-portal-context-v1",
          development_only: true,
          practice: { id: portal_practice.id, name: portal_practice.name, timezone: portal_practice.timezone },
          patient: { id: portal_patient.id, display_name: portal_patient.display_name, reference: portal_patient.reference },
          balances: ledger.fetch(:currencies).map { |currency| currency.slice(:currency, :invoiced_amount, :balance_amount, :allocated_amount, :credited_amount, :refunded_amount) },
          billing: { invoices: ledger.fetch(:invoices), payments: ledger.fetch(:payments) },
          capabilities: {
            billing_read: true, payment_collection: payment_collection
          },
          notices: payment_notices(payment_collection)
        }
        if development_omni_preview?
          payload[:development_preview] = {
            selected_patient_id: portal_patient.id,
            patients: development_omni_preview_patients.map do |patient|
              { id: patient.id, display_name: patient.display_name, reference: patient.reference }
            end
          }
        end
        render json: payload
      end

      private

      def payment_notices(payment_collection)
        if payment_collection
          [
            "Online invoice payments use Stripe-hosted checkout in test mode.",
            "Payment status may need reconciliation after returning to APPly. Contact the clinic for payment questions."
          ]
        else
          [
            "Online payment is unavailable for the current invoices.",
            "Invoices and payment history are read-only. Contact the clinic for payment questions or access support."
          ]
        end
      end
    end
  end
end
