require "csv"
require "bigdecimal"

module Clinic
  module Inventory
    class IngestPriceSheet
      MAX_ROWS = 50_000
      REQUIRED_HEADERS = %w[ndc vendor_sku description package_qty wholesale_cost effective_date].freeze

      def self.call(practice:, supplier:, actor:, path:)
        new(practice:, supplier:, actor:, path:).call
      end

      def self.normalize_ndc(value)
        Integrations::Cms::Nadac.normalize_ndc(value)
      end

      def initialize(practice:, supplier:, actor:, path:)
        @practice = practice
        @supplier = supplier
        @actor = actor
        @path = path.to_s
      end

      def call
        raise ArgumentError, "The supplier feed file could not be found." unless File.file?(@path)
        raise ArgumentError, "The supplier feed file is too large." if File.size(@path) > 50.megabytes
        raise ArgumentError, "The supplier does not belong to this clinic." unless @supplier.practice_id == @practice.id

        products_by_ndc = PharmacyProduct.where(practice_id: @practice.id).where.not(ndc: nil).to_a.each_with_object({}) do |product, index|
          normalized = self.class.normalize_ndc(product.ndc)
          index[normalized] = product.id if normalized
        end
        imported_at = Time.current
        rows = []
        unmatched_ndcs = []

        CSV.foreach(@path, headers: true).with_index(2) do |row, line_number|
          raise ArgumentError, "The supplier feed is limited to #{MAX_ROWS} rows." if rows.length >= MAX_ROWS
          attributes = parse_row(row, line_number)
          product_id = products_by_ndc[attributes[:ndc]]
          unmatched_ndcs << attributes[:ndc] unless product_id
          rows << attributes.merge(
            practice_id: @practice.id,
            supplier_id: @supplier.id,
            product_id: product_id,
            currency: "USD",
            ordering_unit: "package",
            contract_status: "unknown",
            imported_at: imported_at,
            created_at: imported_at,
            updated_at: imported_at,
          )
        end
        raise ArgumentError, "The supplier feed must include a header row." if rows.empty? && CSV.read(@path, headers: true).headers.compact.empty?

        Access.with(@practice.id, @actor, "catalog") do
          SupplierProduct.upsert_all(rows, unique_by: :inventory_supplier_product_identity) unless rows.empty?
        end
        Rails.logger.info("inventory_supplier_price_sheet_import practice_id=#{@practice.id} supplier_id=#{@supplier.id} rows=#{rows.length} unmatched_ndcs=#{unmatched_ndcs.uniq.length}")
        { imported: rows.length, unmatched_ndcs: unmatched_ndcs.uniq }
      rescue CSV::MalformedCSVError => error
        raise ArgumentError, "The supplier feed is not valid CSV: #{error.message}"
      end

      private

      def parse_row(row, line_number)
        values = REQUIRED_HEADERS.to_h { |header| [ header.to_sym, row[header].to_s.strip ] }
        missing = REQUIRED_HEADERS.select { |header| values[header.to_sym].empty? }
        raise ArgumentError, "Supplier feed line #{line_number} is missing #{missing.join(', ')}." if missing.any?
        ndc = self.class.normalize_ndc(values[:ndc])
        raise ArgumentError, "Supplier feed line #{line_number} has an invalid NDC." unless ndc
        package_quantity = decimal(values[:package_qty], line_number, "package quantity")
        wholesale_unit_cost = decimal(values[:wholesale_cost], line_number, "wholesale cost", zero: true)
        effective_date = Date.iso8601(values[:effective_date])
        { ndc: ndc, supplier_sku: values[:vendor_sku].first(120), description: values[:description].first(400), package_quantity: package_quantity, wholesale_unit_cost: wholesale_unit_cost, effective_date: effective_date }
      rescue Date::Error
        raise ArgumentError, "Supplier feed line #{line_number} has an invalid effective date."
      end

      def decimal(value, line_number, label, zero: false)
        raise ArgumentError, "Supplier feed line #{line_number} has an invalid #{label}." unless value.match?(/\A\d+(?:\.\d{1,6})?\z/)
        number = BigDecimal(value)
        raise ArgumentError, "Supplier feed line #{line_number} has an invalid #{label}." unless number.between?(zero ? 0 : BigDecimal("0.000001"), 1_000_000_000)
        number
      end
    end
  end
end
