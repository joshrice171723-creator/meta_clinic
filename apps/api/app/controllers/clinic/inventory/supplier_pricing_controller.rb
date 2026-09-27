module Clinic
  module Inventory
    class SupplierPricingController < Clinic::BaseController
      before_action -> { require_capability(:inventory_access?) }
      before_action :require_supplier_pricing_role
      before_action :require_catalog_access, only: %i[create update preview import set_preferred_supplier record_quote]

      rescue_from ArgumentError, ActiveRecord::RecordInvalid do |error|
        message = error.is_a?(ActiveRecord::RecordInvalid) ? error.record.errors.full_messages.to_sentence : error.message
        render_error(message, :unprocessable_entity)
      end

      def create
        input = parameter_hash!(:supplier, %i[name])
        supplier = Clinic::Inventory::Access.with(current_practice.id, current_user, "catalog") do
          current_practice.inventory_suppliers.create!(name: required_string!(input[:name], field: :name, maximum: 120))
        end
        render json: mutation_response.merge(id: supplier.id), status: :created
      end

      def update
        supplier = current_practice.inventory_suppliers.find(requested_id!(params[:id], :id))
        input = parameter_hash!(:supplier, %i[name])
        Clinic::Inventory::Access.with(current_practice.id, current_user, "catalog") do
          supplier.update!(name: required_string!(input[:name], field: :name, maximum: 120))
        end
        render json: mutation_response
      end

      def preview
        supplier = current_practice.inventory_suppliers.find(requested_id!(params[:supplier_id], :supplier_id))
        preview = IngestPriceSheet.preview(
          practice: current_practice,
          supplier:,
          csv: required_csv,
          page: preview_page_param
        )
        render json: { preview: serialize_preview(preview, supplier:) }
      end

      def import
        supplier = current_practice.inventory_suppliers.find(requested_id!(params[:supplier_id], :supplier_id))
        include_lines = Array(params[:include_lines]).first(50_000)
        result = IngestPriceSheet.call(practice: current_practice, supplier:, actor: current_user, csv: required_csv, include_lines: include_lines)
        render json: mutation_response.merge(imported: result[:imported], unmatched_ndcs: result[:unmatched_ndcs])
      end

      def set_preferred_supplier
        product = current_practice.pharmacy_products.find(requested_id!(params[:id], :id))
        supplier = if params[:supplier_id].present?
          current_practice.inventory_suppliers.find(requested_id!(params[:supplier_id], :supplier_id))
        end
        if supplier && !supplier.supplier_products.where(product_id: product.id).eligible_for_purchase(on: current_practice.inventory_date).exists?
          raise ArgumentError, "The preferred supplier must have an eligible price for this catalog item."
        end
        product.update_catalog!({ preferred_supplier_id: supplier&.id }, actor: current_user)
        render json: mutation_response
      end

      def record_quote
        offer = SupplierProduct.where(practice_id: current_practice.id).find(requested_id!(params[:id], :id))
        raise ArgumentError, "Match this supplier offer to a clinic catalog item before recording a quote." unless offer.product_id.present?
        input = parameter_hash!(:quote, %i[reference quoted_on wholesale_unit_cost currency expected_updated_at])
        reference = required_string!(input[:reference], field: :reference, maximum: 120)
        quoted_on = date_param!(input[:quoted_on], field: :quoted_on)
        raise ArgumentError, "A supplier quote cannot be dated in the future." if quoted_on > current_practice.inventory_date

        cost = Quantity.parse(input[:wholesale_unit_cost].to_s, scale: 6, zero: true)
        currency = input[:currency].to_s.strip.upcase
        raise ArgumentError, "Currency must be a three-letter ISO code." unless currency.match?(/\A[A-Z]{3}\z/) && currency != SupplierProduct::UNKNOWN_CURRENCY

        Clinic::Inventory::Access.with(current_practice.id, current_user, "catalog") do
          offer.with_lock do
            raise ArgumentError, "This supplier offer changed. Reload it before recording a quote." unless
              offer.updated_at.iso8601(6) == input[:expected_updated_at].to_s
            offer.assign_attributes(price_source: "manual_quote", quote_reference: reference, quoted_on: quoted_on,
              wholesale_unit_cost: cost, currency: currency, effective_date: quoted_on)
            if offer.changed?
              offer.save!
              Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
                action_code: "inventory.supplier_quote.record", outcome: :committed,
                resource_version_ref: "supplier_product:#{offer.id}")
            end
          end
        end
        render json: mutation_response
      end

      private

      def require_catalog_access
        require_capability(:catalog)
      end

      def require_supplier_pricing_role
        ability = Ability.new(current_user, practice: current_practice)
        return if ability.role_code_allowed?(Ability::SUPPLIER_PRICING_ROLE_CODES)

        raise Clinic::Authorization::Denied
      end

      def required_csv
        value = params[:csv].to_s
        raise ArgumentError, "Choose a supplier CSV file first." if value.blank?

        value
      end

      def preview_page_param
        value = params[:page].presence || "1"
        raise ArgumentError, "Choose a valid supplier preview page." unless /\A[1-9][0-9]{0,2}\z/.match?(value.to_s)

        value.to_i
      end

      def mutation_response
        return { acknowledged: true } if params[:response] == "ack"

        { data: InventoryWire.call(practice: current_practice, actor: current_user) }
      end

      def serialize_preview(preview, supplier:)
        products = current_practice.pharmacy_products.where(id: preview[:rows].filter_map { |row| row[:product_id] }).index_by(&:id)
        preview.merge(
          rows: preview[:rows].map do |row|
            attributes = row[:attributes]
            supplier_product = SupplierProduct.new(attributes.merge(
              practice_id: current_practice.id, supplier: supplier, product: products[row[:product_id]]
            ))
            eligibility_reason = supplier_product.purchase_eligibility_reason(on: current_practice.inventory_date)
            {
              line: row[:line], product_id: row[:product_id]&.to_s, matched: row[:matched],
              ndc: attributes[:ndc], supplier_sku: attributes[:supplier_sku], description: attributes[:description],
              package_quantity: attributes[:package_quantity].to_d.to_s("F"), wholesale_unit_cost: attributes[:wholesale_unit_cost].to_d.to_s("F"),
              effective_date: attributes[:effective_date].iso8601, currency: attributes[:currency], ordering_unit: attributes[:ordering_unit],
              contract_status: attributes[:contract_status], available: attributes[:available], lead_time_days: attributes[:lead_time_days],
              eligible: eligibility_reason.nil?, eligibility_reason: eligibility_reason
            }
          end
        )
      end
    end
  end
end
