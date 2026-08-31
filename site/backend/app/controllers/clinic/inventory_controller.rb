module Clinic
  class InventoryController < BaseController
    before_action -> { require_capability(:inventory_access?) }

    def index
      @items = current_practice.items.order(:name)
    end

    def create
      item = current_practice.items.new(params.require(:clinic_item).permit(:name, :sku, :reorder_level))
      if item.save
        redirect_to clinic_inventory_index_path, status: :see_other, notice: "Office item added. Record its initial stock with an adjustment."
      else
        @items = current_practice.items.order(:name)
        flash.now[:alert] = item.errors.full_messages.to_sentence
        render :index, status: :unprocessable_entity
      end
    end

    def adjust
      item = current_practice.items.find(params[:id])
      item.adjust!(delta: params[:delta], reason: params[:reason], actor: current_user, request_key: params[:request_key].to_s)
      redirect_to clinic_inventory_index_path, status: :see_other, notice: "Stock adjustment recorded."
    rescue ArgumentError, ActiveRecord::RecordInvalid => error
      @items = current_practice.items.order(:name)
      flash.now[:alert] = error.is_a?(ActiveRecord::RecordInvalid) ? error.record.errors.full_messages.to_sentence : "Enter a valid nonzero whole-number adjustment."
      render :index, status: :unprocessable_entity
    end
  end
end
