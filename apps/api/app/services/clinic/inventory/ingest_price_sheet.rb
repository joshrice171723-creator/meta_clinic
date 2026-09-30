require "csv"
require "bigdecimal"
require "stringio"

module Clinic
  module Inventory
    class IngestPriceSheet
      MAX_ROWS = 50_000
      MAX_BYTES = 50.megabytes
      IMPORT_BATCH_SIZE = 500
      PREVIEW_PAGE_SIZE = 200
      REQUIRED_HEADERS = %w[ndc vendor_sku description package_qty wholesale_cost effective_date].freeze
      OPTIONAL_HEADERS = %w[currency ordering_unit contract_status available lead_time_days].freeze
      CONTRACT_STATUSES = %w[active inactive unknown].freeze
      ORDERING_UNITS = %w[package unknown].freeze

      def self.call(practice:, supplier:, actor:, path: nil, csv: nil, include_lines: nil)
        new(practice:, supplier:, actor:, path:, csv:, include_lines:).call
      end

      def self.preview(practice:, supplier:, path: nil, csv: nil, page: 1)
        new(practice:, supplier:, path:, csv:).preview(page:)
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
        raise ArgumentError, "The supplier price import requires a catalog permission." unless @actor
        raise ArgumentError, "The supplier does not belong to this clinic." unless @supplier.practice_id == @practice.id

        imported_at = Time.current
        products_by_ndc = nil
        batch = []
        imported = 0
        unmatched_ndcs = {}

        ApplicationRecord.transaction do
          Access.with(@practice.id, @actor, "catalog") do
            each_data_row do |row, line_number|
              next if @include_lines && !@include_lines.include?(line_number)

              begin
                attributes = parse_row(row, line_number)
              rescue ArgumentError
                raise if @include_lines.nil?

                next
              end

              products_by_ndc ||= product_index
              product_id = products_by_ndc[attributes[:ndc]]
              batch << {
                attributes: attributes,
                product_id: product_id
              }
              next if batch.length < IMPORT_BATCH_SIZE

              imported += persist_batch(batch, imported_at, unmatched_ndcs)
              batch.clear
            end

            if batch.any?
              imported += persist_batch(batch, imported_at, unmatched_ndcs)
              batch.clear
            end
            raise ArgumentError, "Choose at least one valid supplier price row." if @include_lines && imported.zero?
          end
        end
        Rails.logger.info("inventory_supplier_price_sheet_import practice_id=#{@practice.id} supplier_id=#{@supplier.id} rows=#{imported} unmatched_ndcs=#{unmatched_ndcs.length}")
        { imported: imported, unmatched_ndcs: unmatched_ndcs.keys }
      end

      def preview(page: 1)
        parsed = parsed_rows(page:)
        {
          total_rows: parsed[:total_rows],
          valid_count: parsed[:valid_count],
          invalid_count: parsed[:invalid_count],
          page: parsed[:page],
          page_count: parsed[:page_count],
          rows: parsed[:rows].map { |row| row.slice(:line, :product_id, :matched, :attributes).merge(row[:attributes]) },
          errors: parsed[:errors],
          unmatched_ndcs: parsed[:unmatched_ndcs]
        }
      end

      private

      def parsed_rows(page:)
        raise ArgumentError, "The supplier does not belong to this clinic." unless @supplier.practice_id == @practice.id
        products_by_ndc = nil
        rows = []
        errors = []
        unmatched_ndcs = {}
        valid_count = 0
        invalid_count = 0
        total_rows = 0
        requested_page = Integer(page)
        unless requested_page.between?(1, (MAX_ROWS.to_f / PREVIEW_PAGE_SIZE).ceil)
          raise ArgumentError, "Choose a valid supplier preview page."
        end
        first_line = ((requested_page - 1) * PREVIEW_PAGE_SIZE) + 2
        last_line = first_line + PREVIEW_PAGE_SIZE - 1
        each_data_row do |row, line_number|
          total_rows += 1
          page_row = line_number.between?(first_line, last_line)
          begin
            attributes = parse_row(row, line_number)
            products_by_ndc ||= product_index
            product_id = products_by_ndc[attributes[:ndc]]
            valid_count += 1
            unmatched_ndcs[attributes[:ndc]] = true unless product_id
            if page_row
              rows << { line: line_number, product_id: product_id, matched: product_id.present?, attributes: attributes }
            end
          rescue ArgumentError => error
            invalid_count += 1
            errors << { line: line_number, message: error.message } if page_row
          end
        end
        page_count = [(total_rows.to_f / PREVIEW_PAGE_SIZE).ceil, 1].max
        if requested_page > page_count
          return parsed_rows(page: page_count)
        end
        {
          total_rows:,
          valid_count:,
          invalid_count:,
          page: requested_page,
          page_count:,
          rows:,
          errors:,
          unmatched_ndcs: unmatched_ndcs.keys
        }
      rescue CSV::MalformedCSVError => error
        raise ArgumentError, "The supplier feed is not valid CSV: #{error.message}"
      end

      def each_data_row
        raise ArgumentError, "The supplier does not belong to this clinic." unless @supplier.practice_id == @practice.id
        io = source_io
        parser = CSV.new(io, headers: true)
        first_row = parser.shift
        headers = Array(parser.headers).map(&:to_s)
        missing_headers = REQUIRED_HEADERS - headers
        if headers.empty? || missing_headers.any?
          raise ArgumentError, "The supplier feed is missing required columns: #{missing_headers.join(', ')}."
        end

        total_rows = 0
        if first_row
          total_rows += 1
          raise ArgumentError, "The supplier feed is limited to #{MAX_ROWS} rows." if total_rows > MAX_ROWS
          yield first_row, 2
        end
        parser.each.with_index(3) do |row, line_number|
          total_rows += 1
          raise ArgumentError, "The supplier feed is limited to #{MAX_ROWS} rows." if total_rows > MAX_ROWS
          yield row, line_number
        end
      rescue CSV::MalformedCSVError => error
        raise ArgumentError, "The supplier feed is not valid CSV: #{error.message}"
      ensure
        io&.close unless io&.closed?
      end

      def source_io
        if @csv.is_a?(String)
          raise ArgumentError, "The supplier feed file is too large." if @csv.bytesize > MAX_BYTES
          StringIO.new(@csv)
        elsif @path && File.file?(@path)
          raise ArgumentError, "The supplier feed file is too large." if File.size(@path) > MAX_BYTES
          File.open(@path, "rb")
        else
          raise ArgumentError, "The supplier feed file could not be found."
        end
      end

      def product_index
        PharmacyProduct.where(practice_id: @practice.id).where.not(ndc: nil).select(:id, :ndc).find_each.each_with_object({}) do |product, index|
          normalized = self.class.normalize_ndc(product.ndc)
          index[normalized] = product.id if normalized
        end
      end

      def persist_batch(rows, imported_at, unmatched_ndcs)
        attributes = rows.map do |row|
          values = row.fetch(:attributes)
          product_id = row.fetch(:product_id)
          unmatched_ndcs[values[:ndc]] = true unless product_id
          values.merge(
            practice_id: @practice.id,
            supplier_id: @supplier.id,
            product_id: product_id,
            imported_at: imported_at,
            price_source: "price_sheet",
            quote_reference: nil, quoted_fee_amount: nil, quoted_fee_currency: nil, quoted_fee_basis: nil,
            quoted_on: nil,
            created_at: imported_at,
            updated_at: imported_at,
          )
        end
        SupplierProduct.upsert_all(attributes, unique_by: :inventory_supplier_product_identity) unless attributes.empty?
        attributes.length
      end

      def parse_row(row, line_number)
        values = (REQUIRED_HEADERS + OPTIONAL_HEADERS).to_h { |header| [ header.to_sym, row[header].to_s.strip ] }
        missing = REQUIRED_HEADERS.select { |header| values[header.to_sym].empty? }
        raise ArgumentError, "Supplier feed line #{line_number} is missing #{missing.join(', ')}." if missing.any?
        ndc = self.class.normalize_ndc(values[:ndc])
        raise ArgumentError, "Supplier feed line #{line_number} has an invalid NDC." unless ndc
        package_quantity = decimal(values[:package_qty], line_number, "package quantity")
        wholesale_unit_cost = decimal(values[:wholesale_cost], line_number, "wholesale cost", zero: true)
        effective_date = Date.iso8601(values[:effective_date])
        currency = values[:currency].presence&.upcase || SupplierProduct::UNKNOWN_CURRENCY
        raise ArgumentError, "Supplier feed line #{line_number} has an invalid currency." unless currency.match?(/\A[A-Z]{3}\z/)
        ordering_unit = values[:ordering_unit].presence&.downcase || "unknown"
        unless ORDERING_UNITS.include?(ordering_unit)
          raise ArgumentError, "Supplier feed line #{line_number} has an unsupported ordering unit."
        end
        contract_status = values[:contract_status].presence&.downcase || "unknown"
        unless CONTRACT_STATUSES.include?(contract_status)
          raise ArgumentError, "Supplier feed line #{line_number} has an unsupported contract status."
        end
        available = availability(values[:available], line_number)
        lead_time_days = lead_time_days(values[:lead_time_days], line_number)
        {
          ndc: ndc, supplier_sku: values[:vendor_sku].first(120), description: values[:description].first(400),
          package_quantity: package_quantity, wholesale_unit_cost: wholesale_unit_cost, effective_date: effective_date,
          currency: currency, ordering_unit: ordering_unit, contract_status: contract_status, available: available,
          lead_time_days: lead_time_days
        }
      rescue Date::Error
        raise ArgumentError, "Supplier feed line #{line_number} has an invalid effective date."
      end

      def availability(value, line_number)
        return nil if value.blank? || value.casecmp?("unknown")
        return true if value.casecmp?("true")
        return false if value.casecmp?("false")

        raise ArgumentError, "Supplier feed line #{line_number} has an invalid availability value."
      end

      def lead_time_days(value, line_number)
        return nil if value.blank?
        unless value.match?(/\A\d{1,4}\z/) && value.to_i.between?(0, 3650)
          raise ArgumentError, "Supplier feed line #{line_number} has an invalid lead time."
        end

        value.to_i
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
