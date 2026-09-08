module Clinic
  module Inventory
    class ItemsController < Clinic::BaseController
      before_action -> { require_capability(:inventory_access?) }
      rescue_from ArgumentError do |error|
        render_error(error.message, :unprocessable_entity)
      end

      def index
        items = current_practice.items
        query = query_param
        if query.present?
          escaped = Clinic::Inventory::Item.sanitize_sql_like(query)
          items = items.where("name ILIKE :query OR sku ILIKE :query", query: "%#{escaped}%")
        end
        paginate(items, key: :items, serializer: ->(item) { ItemSerializer.call(item) }, order: { name: :asc, id: :asc })
      end

      def create
        input = parameter_hash!(:clinic_item, %i[name sku reorder_level])
        item = current_practice.items.new(
          name: required_string!(input[:name], field: :name, maximum: 120),
          sku: required_string!(input[:sku], field: :sku, maximum: 40),
          reorder_level: bounded_integer!(input[:reorder_level].presence || "0", field: :reorder_level, min: 0, max: 1_000_000)
        )
        Access.with(current_practice.id, current_user, "catalog") { item.save! }
        render json: { id: item.id, item: ItemSerializer.call(item) }, status: :created
      end

      def adjust
        item = current_practice.items.find(integer_id!(params[:id], field: :id))
        delta = params[:delta].to_s
        raise Clinic::Api::RequestParameters::Invalid.new("delta must be a whole number.", field: :delta) unless delta.match?(/\A-?\d+\z/)
        reason = required_string!(params[:reason], field: :reason, maximum: 200)
        request_key = required_string!(params[:request_key], field: :request_key, maximum: 100)
        entry = item.adjust!(delta: delta, reason: reason, actor: current_user, request_key: request_key)
        head :no_content
      end
    end
  end
end
