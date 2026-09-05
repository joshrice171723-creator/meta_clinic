module Clinic
  module Inventory
    class SupplierPricingController < Clinic::BaseController
      before_action -> { require_capability(:inventory_access?) }
      before_action :require_catalog_access, only: %i[create update preview import set_preferred_supplier]

      rescue_from ArgumentError, ActiveRecord::RecordInvalid do |error|
        message = error.is_a?(ActiveRecord::RecordInvalid) ? error.record.errors.full_messages.to_sentence : error.message
        render_error(message, :unprocessable_entity)
      end

      def create
        input = parameter_hash!(:supplier, %i[name])
        supplier = Clinic::Inventory::Access.with(current_practice.id, current_user, "catalog") do
          current_practice.inventory_suppliers.create!(name: required_string!(input[:name], field: :name, maximum: 120))
        end
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user), id: supplier.id }, status: :created
      end

      def update
        supplier = current_practice.inventory_suppliers.find(requested_id!(params[:id], :id))
        input = parameter_hash!(:supplier, %i[name])
        Clinic::Inventory::Access.with(current_practice.id, current_user, "catalog") do
          supplier.update!(name: required_string!(input[:name], field: :name, maximum: 120))
        end
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user) }
      end

      def preview
        supplier = current_practice.inventory_suppliers.find(requested_id!(params[:supplier_id], :supplier_id))
        preview = IngestPriceSheet.preview(practice: current_practice, supplier:, csv: required_csv)
        render json: { preview: serialize_preview(preview) }
      end

      def import
        supplier = current_practice.inventory_suppliers.find(requested_id!(params[:supplier_id], :supplier_id))
        include_lines = Array(params[:include_lines]).first(50_000)
        result = IngestPriceSheet.call(practice: current_practice, supplier:, actor: current_user, csv: required_csv, include_lines: include_lines)
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user), imported: result[:imported], unmatched_ndcs: result[:unmatched_ndcs] }
      end

      def set_preferred_supplier
        product = current_practice.pharmacy_products.find(requested_id!(params[:id], :id))
        supplier = if params[:supplier_id].present?
          current_practice.inventory_suppliers.find(requested_id!(params[:supplier_id], :supplier_id))
        end
        if supplier && !supplier.supplier_products.where(product_id: product.id).where(available: [ true, nil ]).exists?
          raise ArgumentError, "The preferred supplier must have an available price for this catalog item."
        end
        product.update_catalog!({ preferred_supplier_id: supplier&.id }, actor: current_user)
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user) }
      end

      private

      def require_catalog_access
        require_capability(:catalog)
      end

      def required_csv
        value = params[:csv].to_s
        raise ArgumentError, "Choose a supplier CSV file first." if value.blank?

        value
      end

      def serialize_preview(preview)
        preview.merge(
          rows: preview[:rows].map do |row|
            attributes = row[:attributes]
            {
              line: row[:line], product_id: row[:product_id]&.to_s, matched: row[:matched],
              ndc: attributes[:ndc], supplier_sku: attributes[:supplier_sku], description: attributes[:description],
              package_quantity: attributes[:package_quantity].to_d.to_s("F"), wholesale_unit_cost: attributes[:wholesale_unit_cost].to_d.to_s("F"),
              effective_date: attributes[:effective_date].iso8601
            }
          end
        )
      end
    end
  end
end
