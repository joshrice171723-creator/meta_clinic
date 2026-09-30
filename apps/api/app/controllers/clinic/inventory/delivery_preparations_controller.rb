module Clinic
  module Inventory
    class DeliveryPreparationsController < Clinic::BaseController
      before_action -> { require_capability(:inventory_access?) }
      before_action -> { require_capability("procurement.submit") }, only: :create
      rescue_from ArgumentError, KeyError, ActiveRecord::RecordInvalid do |error|
        render_error(error.message, :unprocessable_entity)
      end
      rescue_from ActiveRecord::RecordNotFound do
        render_error("Purchase order not found in this clinic.", :not_found)
      end
      rescue_from Clinic::Idempotency::Conflict, ActiveRecord::RecordNotUnique do
        render_error("This preparation identity is already bound to different data. Reconcile the saved attempt.", :conflict)
      end

      def index
        Authorization.authorize!(actor: current_user, practice: current_practice, action: "procurement.read")
        order = PurchaseOrder.where(practice_id: current_practice.id).find(params[:id])
        # Keep version, lines and history consistent with the preparation writer.
        order.with_lock do
          snapshot = PrepareOrderDelivery.snapshot(order)
          records = DeliveryPreparation.where(practice_id: current_practice.id, purchase_order_id: order.id).order(order_version: :desc).limit(26).to_a
          retained = if params[:request_key].present?
            DeliveryPreparation.where(practice_id: current_practice.id, purchase_order_id: order.id, request_key: params[:request_key].to_s.downcase).first
          end
          render json: { data: { order_version: order.version, source_digest: PrepareOrderDelivery.source_digest(snapshot),
            can_prepare: order.status == "approved" && order.supplier_id.present? && order.lines.exists?,
            snapshot: snapshot, attempts: records.first(25).map { |record| wire(record) }, truncated: records.size > 25,
            recovered_attempt: retained && wire(retained) } }
        end
      end

      def create
        input = params.require(:preparation).permit(:request_key, :order_version, :source_digest, :reason)
        record = PrepareOrderDelivery.call(practice: current_practice, actor: current_user, order_id: params[:id], input: input)
        render json: { acknowledged: true, data: wire(record) }, status: :created
      end

      private

      def wire(record)
        { id: record.id.to_s, attempt_id: record.attempt_id, correlation_id: record.correlation_id,
          request_key: record.request_key, order_version: record.order_version, source_digest: record.source_digest,
          status: record.status, connection_status: record.connection_status, delivery_outcome: record.delivery_outcome,
          source: record.source, actor_id: record.actor_id.to_s, prepared_at: record.prepared_at.iso8601,
          reason: record.reason, snapshot: record.snapshot }
      end
    end
  end
end
