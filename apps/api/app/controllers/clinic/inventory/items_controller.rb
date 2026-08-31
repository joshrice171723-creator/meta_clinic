module Clinic
  module Inventory
    class ItemsController < Clinic::BaseController
      before_action -> { require_capability(:inventory_access?) }
      rescue_from ArgumentError do |error|
        render_error(error.message, :unprocessable_entity)
      end

      def index
        render json: { items: current_practice.items.order(:name).as_json(only: %i[id name sku quantity reorder_level]) }
      end

      def create
        item = current_practice.items.new(params.require(:clinic_item).permit(:name, :sku, :reorder_level))
        Access.with(current_practice.id, current_user, "catalog") { item.save! }
        render json: { id: item.id }, status: :created
      end

      def adjust
        item = current_practice.items.find(params[:id])
        item.adjust!(delta: params[:delta], reason: params[:reason], actor: current_user, request_key: params[:request_key].to_s)
        head :no_content
      end
    end
  end
end
