module Clinic
  module Inventory
    class ScanResolver
      CONTEXT_PERMISSIONS = {
        "receiving" => "inventory.receive",
        "transfer" => "inventory.transfer",
        "count" => "inventory.count"
      }.freeze
      CANDIDATE_LIMIT = 25
      LINE_PAGE_SIZE = 25

      def self.call(practice:, actor:, context:, scan_code:, product_id: nil, session_id: nil, page: 1)
        context = context.to_s
        permission = CONTEXT_PERMISSIONS[context]
        raise ArgumentError, "Choose a supported inventory scanning workflow." unless permission

        code = scan_code.to_s.strip
        raise ArgumentError, "Scan a code containing 1 to 200 characters." unless code.length.between?(1, 200)

        Clinic::Authorization.authorize!(actor: actor, practice: practice, action: permission)
        selected_product = receiving_product!(practice, product_id) if context == "receiving"
        session = count_session!(practice, actor, session_id) if context == "count"

        products = matching_products(practice, code)
        if products.length > CANDIDATE_LIMIT
          return result(status: "too_many", code: code,
            message: "More than 25 products use this exact code. Correct the local product identifiers before scanning.",
            matches: products.first(CANDIDATE_LIMIT).map { |product| product_match(product, code) })
        end
        if products.empty?
          return result(status: "unmatched", code: code,
            message: "No local inventory product uses this exact code.", matches: [])
        end
        if products.many?
          return result(status: "ambiguous", code: code,
            message: "More than one local product uses this exact code. Choose the product manually.",
            matches: products.map { |product| product_match(product, code) })
        end

        product = products.sole
        if selected_product && selected_product.id != product.id
          return result(status: "unmatched", code: code,
            message: "The scanned code belongs to a different product than the selected receipt item.",
            matches: [ product_match(product, code) ])
        end
        return count_result(session, product, code, page) if session

        result(status: "matched", code: code, message: nil, matches: [ product_match(product, code) ])
      rescue Clinic::Authorization::Denied => error
        raise ArgumentError, error.message
      end

      def self.matching_products(practice, code)
        PharmacyProduct.where(practice_id: practice.id)
          .where("sku = :code OR ndc = :code OR device_identifier = :code", code: code)
          .order(:id).limit(CANDIDATE_LIMIT + 1).to_a
      end
      private_class_method :matching_products

      def self.receiving_product!(practice, product_id)
        id = positive_id!(product_id, "selected product")
        PharmacyProduct.where(practice_id: practice.id).find_by(id: id) ||
          raise(ArgumentError, "Choose a product from this clinic before scanning a receipt.")
      end
      private_class_method :receiving_product!

      def self.count_session!(practice, actor, session_id)
        id = positive_id!(session_id, "count session")
        CountSession.where(practice_id: practice.id, assignee_id: actor.id, status: "open").find_by(id: id) ||
          raise(ArgumentError, "Choose an open count session assigned to you.")
      end
      private_class_method :count_session!

      def self.count_result(session, product, code, page)
        page = page_number!(page)
        session_lines = CountSessionLine.where(practice_id: session.practice_id, count_session_id: session.id)
          .includes(batch: :location_record).order(:id).limit(501).to_a
        if session_lines.length > 500
          return result(status: "too_many", code: code,
            message: "This count session has more than 500 lines and cannot be resolved safely.", matches: [])
        end
        matching_lines = session_lines.each_with_index.select { |(line, _index)| line.batch.product_id == product.id }
        total_count = matching_lines.length
        if total_count.zero?
          return result(status: "unmatched", code: code,
            message: "This product is not part of the selected count session.",
            matches: [ product_match(product, code) ], page: 1, page_count: 1, total_count: 0)
        end

        page_count = (total_count + LINE_PAGE_SIZE - 1) / LINE_PAGE_SIZE
        page = [ page, page_count ].min
        matches = matching_lines.slice((page - 1) * LINE_PAGE_SIZE, LINE_PAGE_SIZE).map do |line, session_index|
          batch = line.batch
          product_match(product, code).merge(
            line_id: line.id.to_s,
            line_page: (session_index / LINE_PAGE_SIZE) + 1,
            lot_number: batch.lot_number,
            expires_on: batch.expires_on&.iso8601,
            location_id: batch.location_id.to_s,
            location_name: batch.location_record.name
          )
        end
        status = total_count == 1 ? "matched" : "ambiguous"
        message = total_count == 1 ? nil : "This product has more than one count line. Choose the stock position manually."
        result(status: status, code: code, message: message, matches: matches,
          page: page, page_count: page_count, total_count: total_count)
      end
      private_class_method :count_result

      def self.product_match(product, code)
        {
          product_id: product.id.to_s,
          product_name: product.name,
          sku: product.sku,
          ndc: product.ndc,
          device_identifier: product.device_identifier,
          matched_fields: %i[sku ndc device_identifier].select { |field| product.public_send(field) == code }.map(&:to_s)
        }
      end
      private_class_method :product_match

      def self.result(status:, code:, message:, matches:, page: nil, page_count: nil, total_count: nil)
        response = { status: status, normalized_code: code, message: message, matches: matches }
        if page
          response.merge!(page: page, page_count: page_count, total_count: total_count, page_size: LINE_PAGE_SIZE)
        end
        response
      end
      private_class_method :result

      def self.positive_id!(value, label)
        text = value.to_s
        unless /\A[1-9][0-9]*\z/.match?(text) && text.to_i <= 9_223_372_036_854_775_807
          raise ArgumentError, "Choose a valid #{label}."
        end
        text.to_i
      end
      private_class_method :positive_id!

      def self.page_number!(value)
        text = value.present? ? value.to_s : "1"
        raise ArgumentError, "Choose a valid scan result page." unless /\A[1-9][0-9]{0,5}\z/.match?(text)

        text.to_i
      end
      private_class_method :page_number!
    end
  end
end
