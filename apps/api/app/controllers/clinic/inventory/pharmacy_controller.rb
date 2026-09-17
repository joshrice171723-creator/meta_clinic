module Clinic
  module Inventory
    class PharmacyController < Clinic::BaseController
      before_action -> { require_capability(:inventory_access?) }
      before_action :require_inventory_action
      rate_limit to: 12, within: 1.minute, by: -> { current_user.id }, only: %i[lookup device_lookup],
        with: -> { render_error("Too many FDA searches. Wait a minute before trying again.", :too_many_requests) }
      rescue_from ArgumentError, ActiveRecord::RecordInvalid do |error|
        message = error.is_a?(ActiveRecord::RecordInvalid) ? error.record.errors.full_messages.to_sentence : error.message
        render_error(message, :unprocessable_entity)
      end

      def index
        catalog = CatalogQuery.call(practice: current_practice, query: params[:q], filter: params[:filter], page: params[:page])
        render json: CatalogResponse.call(catalog)
      end

      def lookup
        results = ndc_catalog.search(params[:ndc_query].to_s.strip)
        render json: { results: results.map { |record, token| record.merge(reference_token: token) } }
      rescue ArgumentError, ::Integrations::Fda::NdcDirectory::Unavailable => error
        render_error(error.message.presence || "The FDA directory is unavailable. Try again later.", :unprocessable_entity)
      end

      def device_lookup
        result = gudid_catalog.lookup(params[:device_identifier].to_s.strip)
        render json: { result: result && result.first.merge(reference_token: result.last) }
      rescue ArgumentError, ::Integrations::Fda::Gudid::Unavailable => error
        render_error(error.message.presence || "The FDA device directory is unavailable. Try again later.", :unprocessable_entity)
      end

      def nadac
        render json: { benchmark: ::Integrations::Cms::Nadac.lookup(params[:ndc].to_s.strip) }
      rescue ArgumentError, ::Integrations::Cms::Nadac::Unavailable => error
        render_error(error.message.presence || "The CMS public cost benchmark is unavailable. Try again later.", :service_unavailable)
      end

      def import
        product = ndc_catalog.import(params[:reference_token])
        render json: { data: Clinic::Inventory::InventoryWire.call(practice: current_practice, actor: current_user), id: product.id }, status: :created
      end

      def create
        attributes = params.require(:clinic_pharmacy_product).permit(:name, :category, :generic_name, :ndc, :ingredients, :dosage_form, :package_description, :sku, :reorder_point, :stock_unit, :quantity_scale, :package_size, :unit_reference, :device_identifier)
        @product = if params[:reference_token].present?
          ndc_catalog.import(params[:reference_token], operational_attributes: attributes.slice(:sku, :reorder_point, :stock_unit, :quantity_scale, :package_size, :unit_reference))
        elsif params[:device_reference_token].present?
          gudid_catalog.import(params[:device_reference_token], operational_attributes: attributes.slice(:name, :category, :sku, :package_description, :reorder_point, :stock_unit, :quantity_scale, :package_size, :unit_reference))
        else
          products.new(attributes).tap do |product|
            # Manual catalog entries cannot claim an FDA directory identifier.
            # Only the signed directory import path may establish NDC
            # provenance; accepting it here would make an operator-entered
            # value indistinguishable from a verified external record.
            product.ndc = nil
            product.product_ndc = nil
            Clinic::Inventory::Access.with(current_practice.id, current_user, "catalog") { product.save! }
          end
        end
        render json: { data: Clinic::Inventory::InventoryWire.call(practice: current_practice, actor: current_user), id: @product.id }, status: :created
      end

      def show
        details = ProductDetailsQuery.call(practice: current_practice, product_id: params[:id], page: params[:page])
        render json: ProductResponse.call(details)
      end

      def update
        product = products.find(params[:id])
        product.update_catalog!(params.require(:clinic_pharmacy_product).permit(:reorder_point, :active), actor: current_user)
        head :no_content
      end

      def receive
        product = products.find(params[:id])
        attributes = params.require(:batch).permit(:lot_number, :expires_on, :location, :supplier).to_h
        Clinic::Inventory::Receiving.call(practice: current_practice, actor: current_user, supplier: attributes.delete("supplier"), invoice_reference: params[:invoice_reference], reason: params[:reason], request_key: params[:request_key],
          lines: [ attributes.merge(product_id: product.id, amount: params[:amount], input_unit: params.require(:input_unit), unit_cost: params[:unit_cost], currency: params[:currency]) ])
        head :no_content
      end

      def movement
        batch = batches.find(params[:id])
        batch.move!(kind: params[:kind], amount: params[:amount], reason: params[:reason], actor: current_user, request_key: params[:request_key])
        head :no_content
      end

      def batch_status
        batch = batches.find(params[:id])
        batch.change_status!(status: params[:status], reason: params[:reason], actor: current_user, request_key: params[:request_key], hold_id: params[:hold_id])
        head :no_content
      end

      def count
        batch = batches.find(params[:id])
        Count.observe!(batch: batch, actor: current_user, observed: params[:observed_quantity], reason: params[:reason], request_key: params[:request_key])
        head :no_content
      end

      def approve_count
        count = Count.where(practice_id: current_practice.id).find(params[:id])
        count.approve!(actor: current_user)
        head :no_content
      end

      def configure
        Profile.revise!(practice: current_practice, actor: current_user, status: params[:status], reason: params[:reason], operator_reference: params[:operator_reference])
        render json: { data: Clinic::Inventory::InventoryWire.call(practice: current_practice, actor: current_user) }
      end

      def demo
        return render_error("Fictional examples are only available in the local demo.", :forbidden) unless development_demo?
        Development::PharmacyStock.populate!(practice: current_practice, actor: current_user)
        head :no_content
      end

      private

      def require_inventory_action
        action = case action_name
        when "new", "lookup", "device_lookup", "nadac", "import", "create", "update" then "catalog"
        when "receive", "demo" then "receive"
        when "movement" then params[:kind] == "receipt" ? "receive" : "adjust"
        when "batch_status" then params[:status] == "active" ? "release" : "hold"
        when "count" then "count"
        when "approve_count" then "adjust"
        when "configure" then "configure"
        end
        return unless action
        Clinic::Inventory::Access.with(current_practice.id, current_user, action) { }
      rescue ArgumentError
        render_error("Your clinic account cannot perform this inventory action.", :forbidden)
      end

      def products
        PharmacyProduct.where(practice_id: current_practice.id)
      end

      def batches
        PharmacyBatch.where(practice_id: current_practice.id)
      end

      def ndc_catalog
        NdcCatalog.new(practice: current_practice, actor: current_user)
      end

      def gudid_catalog
        GudidCatalog.new(practice: current_practice, actor: current_user)
      end
    end
  end
end
