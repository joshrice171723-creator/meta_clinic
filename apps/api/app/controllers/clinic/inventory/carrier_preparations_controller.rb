module Clinic
  module Inventory
    class CarrierPreparationsController < Clinic::BaseController
      before_action -> { require_capability(:inventory_access?) }
      before_action -> { require_capability("inventory.receive") }, only: :create
      rescue_from ArgumentError, KeyError, ActiveRecord::RecordInvalid do |error|
        render_error(error.message, :unprocessable_entity)
      end
      rescue_from ActiveRecord::RecordNotFound do
        render_error("Shipment not found in this clinic.", :not_found)
      end
      rescue_from Clinic::Idempotency::Conflict, ActiveRecord::RecordNotUnique do
        render_error("This shipment preparation identity is already bound. Reconcile its saved evidence.", :conflict)
      end

      def index
        Authorization.authorize!(actor: current_user, practice: current_practice, action: "procurement.read")
        shipment = Shipment.where(practice_id: current_practice.id).find(params[:id])
        shipment.with_lock do
          snapshot = PrepareCarrierTracking.snapshot(shipment)
          records = CarrierPreparation.where(practice_id: current_practice.id, shipment_id: shipment.id)
            .order(id: :desc).limit(26).to_a
          retained = if params[:request_key].present?
            CarrierPreparation.where(practice_id: current_practice.id, shipment_id: shipment.id,
              request_key: params[:request_key].to_s.downcase).first
          end
          profile = current_practice.inventory_profiles.order(version: :desc).first
          configured = profile && %w[configured synthetic].include?(profile.status) && profile.capabilities.include?("inventory")
          render json: { data: { source_digest: PrepareCarrierTracking.source_digest(snapshot),
            can_prepare: configured && shipment.carrier.present? && shipment.tracking_number.present? &&
              Authorization.allowed?(actor: current_user, practice: current_practice, action: "inventory.receive"),
            snapshot:, attempts: records.first(25).map { |record| wire(record) }, truncated: records.size > 25,
            recovered_attempt: retained && wire(retained) } }
        end
      end

      def create
        input = params.require(:preparation).permit(:request_key, :source_digest, :reason)
        record = PrepareCarrierTracking.call(practice: current_practice, actor: current_user,
          shipment_id: params[:id], input:)
        render json: { acknowledged: true, data: wire(record) }, status: :created
      end

      private

      def wire(record)
        { id: record.id.to_s, shipment_id: record.shipment_id.to_s,
          attempt_id: record.attempt_id, correlation_id: record.correlation_id,
          request_key: record.request_key, source_digest: record.source_digest,
          status: record.status, connection_status: record.connection_status, delivery_outcome: record.delivery_outcome,
          source: record.source, actor_id: record.actor_id.to_s, prepared_at: record.prepared_at.iso8601(6),
          reason: record.reason, snapshot: record.snapshot }
      end
    end
  end
end
