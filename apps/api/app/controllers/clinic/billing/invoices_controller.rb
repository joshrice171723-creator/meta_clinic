module Clinic
  module Billing
    class InvoicesController < Clinic::ApiController
      before_action -> { require_capability_with_legacy("billing.read", "patients.read") }, only: %i[index show]
      before_action -> { require_capability_with_legacy("billing.invoice_draft", "billing.write") }, only: :create
      before_action -> { require_capability_with_legacy("billing.invoice_post", "billing.write") }, only: :post
      before_action -> { require_capability_with_legacy("billing.payment_record", "billing.write") }, only: :allocate_payment

      def index
        patient = current_practice.patients.find(requested_id!(params[:patient_id], :patient_id))
        invoices = patient.invoices.includes(:lines, :payment_allocations, :credit_notes)
        invoices = invoices.where(status: enum_param!(params[:status], field: :status, allowed: %w[draft posted void])) if params[:status].present?
        paginate(invoices, key: :invoices, serializer: ->(invoice) { InvoiceSerializer.call(invoice) }, order: { created_at: :desc, id: :desc })
      end

      def show
        invoice = current_practice.invoices.includes(:lines, :payment_allocations, :credit_notes).find(requested_id!(params[:id], :id))
        verify_patient_scope!(invoice) if params[:patient_id].present?
        render json: { invoice: InvoiceSerializer.call(invoice, detail: true) }
      end

      def create
        input = parameter_hash!(:invoice, %i[currency], nested_arrays: { lines: %i[quantity unit_amount description_snapshot] })
        lines = Array(input[:lines])
        raise Clinic::Api::RequestParameters::Invalid.new("lines must contain 1–100 entries.", field: :lines) unless lines.size.between?(1, 100)
        line_attributes = lines.map.with_index do |line, index|
          unless line.is_a?(ActionController::Parameters)
            raise Clinic::Api::RequestParameters::Invalid.new("lines[#{index}] must be an object.", field: "lines[#{index}]")
          end
          allowed = %w[quantity unit_amount description_snapshot]
          unknown = line.keys - allowed
          raise Clinic::Api::RequestParameters::Invalid.new("#{unknown.first} is not a supported field.", field: "lines[#{index}]") if unknown.any?
          {
            quantity: decimal_string!(line[:quantity], field: "lines[#{index}].quantity"),
            unit_amount: decimal_string!(line[:unit_amount], field: "lines[#{index}].unit_amount"),
            description_snapshot: required_string!(line[:description_snapshot], field: "lines[#{index}].description_snapshot", maximum: 500)
          }
        end
        patient = current_practice.patients.find(requested_id!(params[:patient_id], :patient_id))
        invoice = Clinic::Billing::DraftInvoice.call(
          practice: current_practice,
          actor: current_user,
          patient: patient,
          currency: required_string!(input[:currency], field: :currency, maximum: 3),
          lines: line_attributes
        )
        render json: { invoice: InvoiceSerializer.call(invoice, detail: true) }, status: :created
      end

      def post
        invoice = current_practice.invoices.find(requested_id!(params[:id], :id))
        updated = Clinic::Billing::PostInvoice.call(invoice: invoice, actor: current_user)
        render json: { invoice: InvoiceSerializer.call(updated, detail: true) }
      end

      def allocate_payment
        input = parameter_hash!(:payment, %i[external_event_reference currency amount payment_amount])
        invoice = current_practice.invoices.find(requested_id!(params[:id], :id))
        patient = current_practice.patients.find(invoice.patient_id)
        allocation = Clinic::Billing::AllocatePayment.call(
          practice: current_practice,
          actor: current_user,
          patient: patient,
          invoice: invoice,
          external_event_reference: required_string!(input[:external_event_reference], field: :external_event_reference, maximum: 255),
          currency: required_string!(input[:currency], field: :currency, maximum: 3),
          amount: decimal_string!(input[:amount], field: :amount),
          payment_amount: input[:payment_amount].present? ? decimal_string!(input[:payment_amount], field: :payment_amount) : nil
        )
        render json: { payment_allocation: {
          id: allocation.id,
          patient_id: allocation.patient_id,
          payment_event_id: allocation.payment_event_id,
          invoice_id: allocation.invoice_id,
          amount: allocation.amount.to_s("F")
        } }, status: :created
      end

      private

      def verify_patient_scope!(invoice)
        expected = requested_id!(params[:patient_id], :patient_id)
        raise ActiveRecord::RecordNotFound unless invoice.patient_id == expected
      end
    end
  end
end
