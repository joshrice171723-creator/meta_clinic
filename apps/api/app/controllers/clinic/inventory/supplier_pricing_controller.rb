module Clinic
  module Inventory
    class SupplierPricingController < Clinic::BaseController
      before_action -> { require_capability(:inventory_access?) }
      before_action :require_supplier_pricing_role
      before_action :require_catalog_access, only: %i[create update preview import set_preferred_supplier record_quote catalog_products create_manual_quote create_quote_request]

      rescue_from ArgumentError, ActiveRecord::RecordInvalid do |error|
        message = error.is_a?(ActiveRecord::RecordInvalid) ? error.record.errors.full_messages.to_sentence : error.message
        render_error(message, :unprocessable_entity)
      end
      rescue_from ActiveRecord::RecordNotUnique do
        render_error("An offer with this supplier SKU and NDC already exists. Reload supplier pricing before retrying.", :conflict)
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
        input = parameter_hash!(:quote, %i[reference quoted_on wholesale_unit_cost currency expected_updated_at quote_request_id quoted_fee_amount quoted_fee_basis])
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
              wholesale_unit_cost: cost, currency: currency, effective_date: quoted_on, **quote_fee_attributes(input, currency))
            if offer.changed?
              offer.save!
              Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
                action_code: "inventory.supplier_quote.record", outcome: :committed,
                resource_version_ref: "supplier_product:#{offer.id}")
            end
            product = PharmacyProduct.where(practice_id: current_practice.id).lock.find(offer.product_id)
            close_quote_request!(input[:quote_request_id], offer:, product:, reference:, quoted_on:)
          end
        end
        render json: mutation_response
      end

      def create_quote_request
        input = parameter_hash!(:quote_request, %i[supplier_product_id requested_packages note request_key])
        offer = SupplierProduct.where(practice_id: current_practice.id).find(requested_id!(input[:supplier_product_id], :supplier_product_id))
        requested_packages = Quantity.parse(input[:requested_packages].to_s, scale: 0)
        note = input[:note].to_s.strip
        raise ArgumentError, "A request note is required and must be at most 1000 characters." if note.blank? || note.length > 1000
        request_key = required_string!(input[:request_key], field: :request_key, maximum: 160)

        outcome = Clinic::Idempotency.execute(
          practice: current_practice,
          actor: current_user,
          operation_code: "inventory.supplier_quote_request.create",
          request_key: request_key,
          payload: { supplier_product_id: offer.id, requested_packages: requested_packages.to_s("F"), note: note },
          resource: offer,
          authorization: -> { require_catalog_access },
          authorization_action: "inventory.catalog",
          result_resource: ->(request) { request },
          resource_resolver: ->(practice:, receipt:) { SupplierQuoteRequest.where(practice_id: practice.id).find_by(id: receipt.resource_id) }
        ) do
          offer.with_lock do
            product = PharmacyProduct.where(practice_id: current_practice.id).lock.find_by(id: offer.product_id)
            raise ArgumentError, "Match this supplier offer to a clinic catalog item before requesting a quote." unless product
            SupplierQuoteRequest.create!(practice: current_practice, supplier_product: offer, supplier: offer.supplier,
              product:, requested_packages: requested_packages, package_quantity_at_request: offer.package_quantity,
              stock_unit_at_request: product.stock_unit, note: note, request_key: request_key)
          end
        end
        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

        request = outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The committed supplier quote request is unavailable.")
        render json: mutation_response.merge(id: request.id.to_s), status: :created
      end

      def catalog_products
        query = params[:q].to_s.strip
        raise ArgumentError, "Search must be 100 characters or fewer." if query.length > 100

        products = current_practice.pharmacy_products.where(active: true).where.not(ndc: nil)
        if query.present?
          pattern = "%#{Clinic::Inventory::PharmacyProduct.sanitize_sql_like(query)}%"
          normalized_ndc = IngestPriceSheet.normalize_ndc(query)
          products = products.where("name ILIKE :query OR sku ILIKE :query OR ndc ILIKE :query OR ndc = :normalized_ndc",
            query: pattern, normalized_ndc: normalized_ndc)
        end
        rows = products.order(:name, :id).limit(25).filter_map do |product|
          ndc = IngestPriceSheet.normalize_ndc(product.ndc)
          next unless ndc

          { id: product.id.to_s, name: product.name, ndc:, package_quantity: product.package_size.to_d.to_s("F"), stock_unit: product.stock_unit }
        end
        render json: { products: rows, limit: 25 }
      end

      def create_manual_quote
        input = parameter_hash!(:offer, %i[supplier_id product_id supplier_sku description package_quantity quote_reference quoted_on wholesale_unit_cost currency contract_status available lead_time_days quoted_fee_amount quoted_fee_basis])
        supplier = current_practice.inventory_suppliers.find(requested_id!(input[:supplier_id], :supplier_id))
        product = current_practice.pharmacy_products.find(requested_id!(input[:product_id], :product_id))
        raise ArgumentError, "Choose an active catalog item." unless product.active?

        ndc = IngestPriceSheet.normalize_ndc(product.ndc)
        raise ArgumentError, "This catalog item needs a valid NDC before it can have a supplier offer." unless ndc
        reference = required_string!(input[:quote_reference], field: :quote_reference, maximum: 120)
        quoted_on = date_param!(input[:quoted_on], field: :quoted_on)
        raise ArgumentError, "A supplier quote cannot be dated in the future." if quoted_on > current_practice.inventory_date

        currency = input[:currency].to_s.strip.upcase
        unless currency.match?(/\A[A-Z]{3}\z/) && currency != SupplierProduct::UNKNOWN_CURRENCY
          raise ArgumentError, "Currency must be a three-letter ISO code."
        end
        contract_status = input[:contract_status].to_s
        unless IngestPriceSheet::CONTRACT_STATUSES.include?(contract_status)
          raise ArgumentError, "Choose a valid supplier contract status."
        end
        available = case input[:available].to_s
        when "true" then true
        when "false" then false
        when "unknown" then nil
        else raise ArgumentError, "Choose whether availability is confirmed."
        end
        lead_time = if input[:lead_time_days].blank?
          nil
        elsif input[:lead_time_days].to_s.match?(/\A\d{1,4}\z/) && input[:lead_time_days].to_i.between?(0, 3650)
          input[:lead_time_days].to_i
        else
          raise ArgumentError, "Lead time must be a whole number from 0 to 3650 days."
        end

        offer = ApplicationRecord.transaction do
          Clinic::Inventory::Access.with(current_practice.id, current_user, "catalog") do
            row = SupplierProduct.create!(
              practice: current_practice, supplier: supplier, product: product, ndc: ndc,
              supplier_sku: required_string!(input[:supplier_sku], field: :supplier_sku, maximum: 120),
              description: required_string!(input[:description], field: :description, maximum: 400),
              ordering_unit: "package", package_quantity: Quantity.parse(input[:package_quantity].to_s, scale: 6),
              wholesale_unit_cost: Quantity.parse(input[:wholesale_unit_cost].to_s, scale: 6, zero: true),
              currency: currency, contract_status: contract_status, available: available, lead_time_days: lead_time,
              effective_date: quoted_on, imported_at: Time.current, price_source: "manual_quote",
              quote_reference: reference, quoted_on: quoted_on, **quote_fee_attributes(input, currency)
            )
            Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
              action_code: "inventory.supplier_offer.create_manual_quote", outcome: :committed,
              resource_version_ref: "supplier_product:#{row.id}")
            row
          end
        end
        render json: { acknowledged: true, id: offer.id.to_s }, status: :created
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
        { acknowledged: true }
      end

      # Supplier evidence only: no fee classification, multiplication or PO total change.
      def quote_fee_attributes(input, currency)
        if input[:quoted_fee_amount].blank?
          raise ArgumentError, "Record an amount with the quoted fee basis, or leave both unknown." if input[:quoted_fee_basis].present?
          return { quoted_fee_amount: nil, quoted_fee_currency: nil, quoted_fee_basis: nil }
        end
        amount = Quantity.parse(input[:quoted_fee_amount].to_s, scale: 6, zero: true)
        basis = required_string!(input[:quoted_fee_basis], field: :quoted_fee_basis, maximum: 160)
        { quoted_fee_amount: amount, quoted_fee_currency: currency, quoted_fee_basis: basis }
      end

      def close_quote_request!(value, offer:, product:, reference:, quoted_on:)
        return if value.blank?

        request = SupplierQuoteRequest.where(practice_id: current_practice.id).lock.find(requested_id!(value, :quote_request_id))
        raise ArgumentError, "This supplier quote request does not match the supplier offer." unless request.supplier_product_id == offer.id
        unless request.supplier_id == offer.supplier_id && request.product_id == offer.product_id &&
            (request.package_quantity_at_request.nil? || request.package_quantity_at_request == offer.package_quantity) &&
            (request.stock_unit_at_request.nil? || request.stock_unit_at_request == product.stock_unit)
          raise ArgumentError, "The supplier offer's product or package units changed. Record a new quote request for the current offer."
        end
        raise ArgumentError, "This supplier quote request is already closed." unless request.status == "open"

        request.update!(status: "quoted", quote_reference: reference, quoted_on: quoted_on,
          quoted_fee_amount: offer.quoted_fee_amount, quoted_fee_currency: offer.quoted_fee_currency,
          quoted_fee_basis: offer.quoted_fee_basis)
        Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
          action_code: "inventory.supplier_quote_request.close", outcome: :committed,
          resource_version_ref: "supplier_quote_request:#{request.id}")
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
