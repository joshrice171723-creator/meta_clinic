require "csv"
require "bigdecimal"

module Clinic
  module Inventory
    class IngestPriceSheet
      MAX_ROWS = 50_000
      MAX_BYTES = 50.megabytes
      REQUIRED_HEADERS = %w[ndc vendor_sku description package_qty wholesale_cost effective_date].freeze

      def self.call(practice:, supplier:, actor:, path: nil, csv: nil, include_lines: nil)
        new(practice:, supplier:, actor:, path:, csv:, include_lines:).call
      end

      def self.preview(practice:, supplier:, path: nil, csv: nil)
        new(practice:, supplier:, path:, csv:).preview
      end

      def self.normalize_ndc(value)
        Integrations::Cms::Nadac.normalize_ndc(value)
      end

      def initialize(practice:, supplier:, actor: nil, path: nil, csv: nil, include_lines: nil)
        @practice = practice
        @supplier = supplier
        @actor = actor
        @path = path.to_s.presence
        @csv = csv
        @include_lines = include_lines&.map { |line| Integer(line.to_s, 10) }
      end

      def call
        parsed = parsed_rows
        raise ArgumentError, parsed[:errors].first[:message] if parsed[:errors].any? && @include_lines.nil?
        selected = @include_lines ? parsed[:rows].select { |row| @include_lines.include?(row[:line]) } : parsed[:rows]
        raise ArgumentError, "Choose at least one valid supplier price row." if @include_lines && selected.empty?
        raise ArgumentError, "The supplier price import requires a catalog permission." unless @actor

        imported_at = Time.current
        attributes = selected.map do |row|
          row[:attributes].merge(
            practice_id: @practice.id,
            supplier_id: @supplier.id,
            product_id: row[:product_id],
            currency: "USD",
            ordering_unit: "package",
            contract_status: "unknown",
            imported_at: imported_at,
            created_at: imported_at,
            updated_at: imported_at,
          )
        end
        Access.with(@practice.id, @actor, "catalog") do
          SupplierProduct.upsert_all(attributes, unique_by: :inventory_supplier_product_identity) unless attributes.empty?
        end
        Rails.logger.info("inventory_supplier_price_sheet_import practice_id=#{@practice.id} supplier_id=#{@supplier.id} rows=#{attributes.length} unmatched_ndcs=#{selected.count { |row| row[:product_id].nil? }}")
        { imported: attributes.length, unmatched_ndcs: selected.filter_map { |row| row[:product_id].nil? ? row[:attributes][:ndc] : nil }.uniq }
      end

      def preview
        parsed = parsed_rows
        {
          total_rows: parsed[:total_rows],
          rows: parsed[:rows].map { |row| row.slice(:line, :product_id, :matched, :attributes).merge(row[:attributes]) },
          errors: parsed[:errors],
          unmatched_ndcs: parsed[:rows].filter_map { |row| row[:product_id].nil? ? row[:attributes][:ndc] : nil }.uniq
        }
      end

      private

      def parsed_rows
        raise ArgumentError, "The supplier does not belong to this clinic." unless @supplier.practice_id == @practice.id
        content = source_content
        table = CSV.parse(content, headers: true)
        headers = Array(table.headers).map(&:to_s)
        missing_headers = REQUIRED_HEADERS - headers
        raise ArgumentError, "The supplier feed is missing required columns: #{missing_headers.join(', ')}." if headers.empty? || missing_headers.any?

        products_by_ndc = PharmacyProduct.where(practice_id: @practice.id).where.not(ndc: nil).to_a.each_with_object({}) do |product, index|
          normalized = self.class.normalize_ndc(product.ndc)
          index[normalized] = product.id if normalized
        end
        rows = []
        errors = []
        table.each.with_index(2) do |row, line_number|
          raise ArgumentError, "The supplier feed is limited to #{MAX_ROWS} rows." if line_number - 1 > MAX_ROWS
          begin
            attributes = parse_row(row, line_number)
            product_id = products_by_ndc[attributes[:ndc]]
            rows << { line: line_number, product_id: product_id, matched: product_id.present?, attributes: attributes }
          rescue ArgumentError => error
            errors << { line: line_number, message: error.message }
          end
        end
        { total_rows: rows.length + errors.length, rows:, errors: }
      rescue CSV::MalformedCSVError => error
        raise ArgumentError, "The supplier feed is not valid CSV: #{error.message}"
      end

      def source_content
        content = if @csv.is_a?(String)
          @csv
        elsif @path && File.file?(@path)
          File.binread(@path)
        else
          raise ArgumentError, "The supplier feed file could not be found."
        end
        raise ArgumentError, "The supplier feed file is too large." if content.bytesize > MAX_BYTES
        content
      end

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
