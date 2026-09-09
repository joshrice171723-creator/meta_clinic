module Clinic
  module Billing
    class InvoicesController < Clinic::ApiController
      before_action -> { require_capability_with_legacy("billing.read", "billing.write") }, only: %i[index show]
      before_action -> { require_capability_with_legacy("billing.invoice_draft", "billing.write") }, only: %i[create update_draft]
      before_action -> { require_capability_with_legacy("billing.invoice_post", "billing.write") }, only: %i[post credit void_invoice]
      before_action -> { require_capability_with_legacy("billing.payment_record", "billing.write") }, only: %i[allocate_payment record_cash_payment]

      def index
        patient = current_practice.patients.find(requested_id!(params[:patient_id], :patient_id))
        invoices = patient.invoices.includes(:lines, :payment_allocations, :credit_notes, :payment_collection_intents,
          invoice_stripe_checkouts: :collection_intent)
        if params[:encounter_id].present?
          encounter = current_practice.encounters.where(patient_id: patient.id).find(requested_id!(params[:encounter_id], :encounter_id))
          invoices = invoices.where(encounter_id: encounter.id)
        end
        invoices = invoices.where(status: enum_param!(params[:status], field: :status, allowed: %w[draft posted void])) if params[:status].present?
        paginate(invoices, key: :invoices, serializer: ->(invoice) { InvoiceSerializer.call(invoice) }, order: { created_at: :desc, id: :desc })
      end

      def show
        invoice = current_practice.invoices.includes(:lines, :payment_allocations, :credit_notes, :payment_collection_intents,
          invoice_stripe_checkouts: :collection_intent).find(requested_id!(params[:id], :id))
        verify_patient_scope!(invoice) if params[:patient_id].present?
        render json: { invoice: InvoiceSerializer.call(invoice, detail: true) }
      end

      def create
        input = parameter_hash!(:invoice, %i[currency encounter_id request_key], nested_arrays: { lines: %i[quantity unit_amount description_snapshot billing_service_id service_lock_version invoice_line_id] })
        lines = Array(input[:lines])
        raise Clinic::Api::RequestParameters::Invalid.new("lines must contain 1–100 entries.", field: :lines) unless lines.size.between?(1, 100)
        line_attributes = invoice_line_attributes(lines)
        patient = current_practice.patients.find(requested_id!(params[:patient_id], :patient_id))
        encounter = if input[:encounter_id].present?
          current_practice.encounters.where(patient_id: patient.id).find(requested_id!(input[:encounter_id], :encounter_id))
        end
        request_key = input.key?(:request_key) ? required_string!(input[:request_key], field: :request_key, maximum: 160) : SecureRandom.uuid
        invoice = Clinic::Billing::DraftInvoice.call(
          practice: current_practice,
          actor: current_user,
          patient: patient,
          encounter: encounter,
          currency: required_string!(input[:currency], field: :currency, maximum: 3),
          lines: line_attributes,
          request_key: request_key
        )
        render json: {
          invoice: InvoiceSerializer.call(invoice, detail: true),
          replayed: !invoice.previously_new_record?,
          request_key: request_key
        }, status: invoice.previously_new_record? ? :created : :ok
      end

      def post
        input = params[:invoice_post].present? ? parameter_hash!(:invoice_post, %i[request_key expected_updated_at]) : {}
        request_key = input.key?(:request_key) ? required_string!(input[:request_key], field: :request_key, maximum: 160) : SecureRandom.uuid
        invoice = current_practice.invoices.find(requested_id!(params[:id], :id))
        expected_updated_at = input.key?(:expected_updated_at) ? required_string!(input[:expected_updated_at], field: :expected_updated_at, maximum: 40) : nil
        updated = Clinic::Billing::PostInvoice.call(invoice: invoice, actor: current_user, request_key: request_key, expected_updated_at: expected_updated_at)
        render json: { invoice: InvoiceSerializer.call(updated, detail: true), request_key: request_key }
      end

      def credit
        input = parameter_hash!(:credit, %i[amount reason request_key])
        invoice = current_practice.invoices.find(requested_id!(params[:id], :id))
        request_key = required_string!(input[:request_key], field: :request_key, maximum: 160)
        result = InvoiceAdjustments.credit(
          invoice: invoice,
          actor: current_user,
          amount: decimal_string!(input[:amount], field: :amount),
          reason: required_string!(input[:reason], field: :reason, maximum: 500),
          request_key: request_key
        )
        render json: {
          credit: InvoiceSerializer.credit(result.credit),
          invoice: InvoiceSerializer.call(result.invoice, detail: true),
          replayed: result.replayed,
          request_key: result.request_key
        }, status: result.replayed ? :ok : :created
      end

      def void_invoice
        input = parameter_hash!(:invoice_void, %i[reason request_key])
        invoice = current_practice.invoices.find(requested_id!(params[:id], :id))
        request_key = required_string!(input[:request_key], field: :request_key, maximum: 160)
        result = InvoiceAdjustments.void(
          invoice: invoice,
          actor: current_user,
          reason: required_string!(input[:reason], field: :reason, maximum: 500),
          request_key: request_key
        )
        render json: {
          invoice: InvoiceSerializer.call(result.invoice, detail: true),
          replayed: result.replayed,
          request_key: result.request_key
        }
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
        payment = allocation.payment_event
        payment_allocated = payment.allocations.sum(:amount)
        payment_refunded = payment.refund_events.sum(:amount)
        render json: { payment_allocation: {
          id: allocation.id,
          patient_id: allocation.patient_id,
          payment_event_id: allocation.payment_event_id,
          invoice_id: allocation.invoice_id,
          amount: allocation.amount.to_s("F"),
          payment_event: {
            id: payment.id,
            amount: payment.amount.to_s("F"),
            allocated_amount: payment_allocated.to_s("F"),
            unapplied_amount: [payment.amount - payment_allocated - payment_refunded, 0].max.to_s("F")
          }
        } }, status: :created
      end

      def update_draft
        input = parameter_hash!(:invoice, %i[currency request_key expected_updated_at], nested_arrays: { lines: %i[quantity unit_amount description_snapshot billing_service_id service_lock_version invoice_line_id] })
        lines = Array(input[:lines])
        raise Clinic::Api::RequestParameters::Invalid.new("lines must contain 1–100 entries.", field: :lines) unless lines.size.between?(1, 100)
        attributes = invoice_line_attributes(lines)
        invoice = current_practice.invoices.find(requested_id!(params[:id], :id))
        updated = Clinic::Billing::UpdateDraftInvoice.call(practice: current_practice, actor: current_user, invoice: invoice,
          currency: required_string!(input[:currency], field: :currency, maximum: 3), lines: attributes,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          expected_updated_at: required_string!(input[:expected_updated_at], field: :expected_updated_at, maximum: 40))
        render json: { invoice: InvoiceSerializer.call(updated, detail: true), request_key: input[:request_key] }
      end

      def record_cash_payment
        input = parameter_hash!(:cash_payment, %i[cash_drawer_session_id tendered_amount allocation_amount request_key])
        invoice = current_practice.invoices.find(requested_id!(params[:id], :id))
        patient = current_practice.patients.find(invoice.patient_id)
        drawer = current_practice.cash_drawer_sessions.find(requested_id!(input[:cash_drawer_session_id], :cash_drawer_session_id))
        allocation = RecordCashPayment.call(
          practice: current_practice, actor: current_user, patient: patient, invoice: invoice, drawer_session: drawer,
          tendered_amount: decimal_string!(input[:tendered_amount], field: :tendered_amount),
          allocation_amount: decimal_string!(input[:allocation_amount], field: :allocation_amount),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 100)
        )
        tender = allocation.payment_event.cash_tender
        render json: { payment_allocation: { id: allocation.id, payment_event_id: allocation.payment_event_id, amount: allocation.amount.to_s("F") },
          cash_tender: { id: tender.id, tendered_amount: tender.tendered_amount.to_s("F"), change_amount: tender.change_amount.to_s("F"), cash_drawer_session_id: tender.cash_drawer_session_id } }, status: :created
      end

      private

      def invoice_line_attributes(lines)
        lines.map.with_index do |line, index|
          field = "lines[#{index}]"
          unless line.is_a?(ActionController::Parameters)
            raise Clinic::Api::RequestParameters::Invalid.new("#{field} must be an object.", field: field)
          end

          if line.key?(:invoice_line_id)
            override = %w[unit_amount description_snapshot billing_service_id service_lock_version].find { |key| line.key?(key) }
            if override
              raise Clinic::Api::RequestParameters::Invalid.new("Retained invoice lines cannot include #{override}.", field: "#{field}.#{override}")
            end
            {
              invoice_line_id: requested_id!(line[:invoice_line_id], "#{field}.invoice_line_id"),
              quantity: decimal_string!(line[:quantity], field: "#{field}.quantity")
            }
          elsif line.key?(:billing_service_id)
            override = %w[unit_amount description_snapshot].find { |key| line.key?(key) }
            if override
              raise Clinic::Api::RequestParameters::Invalid.new("Catalog invoice lines cannot override #{override}.", field: "#{field}.#{override}")
            end
            {
              billing_service_id: requested_id!(line[:billing_service_id], "#{field}.billing_service_id"),
              service_lock_version: bounded_integer!(line[:service_lock_version], field: "#{field}.service_lock_version", min: 0, max: 2_147_483_647),
              quantity: decimal_string!(line[:quantity], field: "#{field}.quantity")
            }
          else
            if line.key?(:service_lock_version)
              raise Clinic::Api::RequestParameters::Invalid.new("Custom invoice lines cannot include service_lock_version.", field: "#{field}.service_lock_version")
            end
            {
              quantity: decimal_string!(line[:quantity], field: "#{field}.quantity"),
              unit_amount: decimal_string!(line[:unit_amount], field: "#{field}.unit_amount"),
              description_snapshot: required_string!(line[:description_snapshot], field: "#{field}.description_snapshot", maximum: 500)
            }
          end
        end
      end

      def verify_patient_scope!(invoice)
        expected = requested_id!(params[:patient_id], :patient_id)
        raise ActiveRecord::RecordNotFound unless invoice.patient_id == expected
      end
    end
  end
end
