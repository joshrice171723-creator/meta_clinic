module Clinic
  module Inventory
    class ReconciliationsController < Clinic::BaseController
      before_action -> { require_capability(:inventory_access?) }
      rescue_from ArgumentError, KeyError, ActiveRecord::RecordInvalid do |error|
        render_error(error.message, :unprocessable_entity)
      end
      rescue_from ActiveRecord::RecordNotFound do
        render_error("Inventory record not found in this clinic.", :not_found)
      end
      rescue_from ActiveRecord::RecordNotUnique do
        render_error("This supplier reference has already been recorded. Reload the order.", :conflict)
      end

      def show
        Authorization.authorize!(actor: current_user, practice: current_practice, action: "procurement.read")
        order = scoped_order
        receipts = ReceiptLine.where(practice_id: current_practice.id, receipt_id: order.receipts.select(:id)).includes(batch: :product).order(id: :desc).limit(101).to_a
        locations = current_practice.inventory_locations.where(status: "active").includes(:children, :site).order(:name, :id).limit(101).to_a
        history = {}
        returned_quantities = VendorReturn.where(practice_id: current_practice.id, receipt_line_id: receipts.first(100).map(&:id)).group(:receipt_line_id).sum(:quantity)
        truncated = receipts.size > 100 || locations.size > 100
        { receiving_sessions: ReceivingSession, returns: VendorReturn, credits: SupplierCredit, invoices: SupplierInvoice }.each do |name, model|
          records = model.where(practice_id: current_practice.id, purchase_order_id: order.id).order(id: :desc).limit(101).to_a
          truncated ||= records.size > 100
          history[name] = records.first(100).map { |record| record_wire(record) }
        end
        render json: { data: history.merge(truncated: truncated,
          receipt_lines: receipts.first(100).map { |row| { id: row.id.to_s, product: row.batch.product.name, lot: row.batch.lot_number,
            quantity: row.quantity.to_s("F"), stock_unit: row.stock_unit,
            returned: (returned_quantities[row.id] || BigDecimal("0")).to_s("F") } },
          locations: locations.first(100).select(&:stock_destination?).map { |location| { id: location.id.to_s, name: location.name, kind: location.kind } }) }
      end

      def receive
        input = params.require(:session).permit(:reference, :reason, :request_key, :invoice_reference,
          lines: [:purchase_order_line_id, :delivered_packages, :accepted_packages, :lot_number, :expiration_date, :destination_location_id, :temperature_c,
            { reconciliation: [:missing_packages, :rejected_packages, :excess_packages, :exception] }]).to_h.with_indifferent_access
        record = PostReceivingSession.call(practice: current_practice, actor: current_user, order_id: params[:id], input: input)
        render json: { data: record_wire(record) }, status: :created
      end

      def return_stock
        input = params.require(:return).permit(:reference, :reason, :request_key, :receipt_line_id, :quantity).to_h.with_indifferent_access
        record = ProcurementReconciliation.record_return(practice: current_practice, actor: current_user, order_id: params[:id], input: input)
        render json: { data: record_wire(record) }, status: :created
      end

      def credit
        input = params.require(:credit).permit(:reference, :reason, :request_key, :vendor_return_id, :amount, :currency).to_h.with_indifferent_access
        record = ProcurementReconciliation.record_credit(practice: current_practice, actor: current_user, order_id: params[:id], input: input)
        render json: { data: record_wire(record) }, status: :created
      end

      def invoice
        input = params.require(:invoice).permit(:reference, :reason, :request_key, :amount, :currency, :tax, :shipping, :supersedes_id,
          lines: [:purchase_order_line_id, :quantity_packages, :unit_price]).to_h.with_indifferent_access
        record = ProcurementReconciliation.record_invoice(practice: current_practice, actor: current_user, order_id: params[:id], input: input)
        render json: { data: record_wire(record) }, status: :created
      end

      private

      def scoped_order
        PurchaseOrder.where(practice_id: current_practice.id).find(params[:id])
      end

      def record_wire(record)
        value = record.attributes.slice("reference", "reason", "details", "status", "currency", "request_key")
        %w[id purchase_order_id vendor_return_id receipt_line_id supersedes_id entry_id].each { |key| value[key] = record[key]&.to_s if record.has_attribute?(key) }
        %w[amount quantity].each { |key| value[key] = record[key].to_s("F") if record.has_attribute?(key) }
        value["created_at"] = record.created_at.iso8601
        value
      end
    end
  end
end
