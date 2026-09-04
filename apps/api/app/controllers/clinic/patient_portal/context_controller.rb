module Clinic
  module PatientPortal
    class ContextController < BaseController
      def show
        ledger = Clinic::Billing::PatientLedger.call(practice: portal_practice, patient: portal_patient)
        record_portal_read("patient_portal.context.read")
        payload = {
          schema_version: "patient-portal-context-v1",
          development_only: true,
          practice: { id: portal_practice.id, name: portal_practice.name, timezone: portal_practice.timezone },
          patient: { id: portal_patient.id, display_name: portal_patient.display_name, reference: portal_patient.reference },
          balances: ledger.fetch(:currencies).map { |currency| currency.slice(:currency, :invoiced_amount, :balance_amount, :allocated_amount, :credited_amount, :refunded_amount) },
          billing: { invoices: ledger.fetch(:invoices), payments: ledger.fetch(:payments) },
          capabilities: {
            billing_read: true, payment_collection: false
          },
          notices: [
            "Payment collection is disabled until provider, finance, security, and operations approvals are complete.",
            "Invoices and payment history are read-only. Contact the clinic for payment questions or access support."
          ]
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
    end
  end
end
