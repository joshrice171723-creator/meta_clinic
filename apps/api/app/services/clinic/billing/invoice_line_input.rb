module Clinic
  module Billing
    module InvoiceLineInput
      LEGACY_FIELDS = %i[quantity unit_amount description_snapshot].freeze
      CATALOG_FIELDS = %i[quantity billing_service_id service_lock_version].freeze
      RETAINED_FIELDS = %i[quantity invoice_line_id].freeze

      def self.normalize(lines)
        raise ArgumentError, "An invoice needs at least one line." unless lines.is_a?(Array) && lines.any?

        lines.map do |line|
          attributes = line.to_h.symbolize_keys
          if attributes.key?(:invoice_line_id)
            reject_retained_overrides!(attributes)
            {
              invoice_line_id: positive_integer(attributes[:invoice_line_id], field: "invoice_line_id"),
              quantity: Money.decimal(attributes.fetch(:quantity), name: "quantity", positive: true).to_s("F")
            }
          elsif attributes.key?(:billing_service_id)
            reject_fields!(attributes, LEGACY_FIELDS - [ :quantity ], message: "Catalog invoice lines cannot override")
            {
              billing_service_id: positive_integer(attributes[:billing_service_id], field: "billing_service_id"),
              service_lock_version: nonnegative_integer(attributes[:service_lock_version], field: "service_lock_version"),
              quantity: Money.decimal(attributes.fetch(:quantity), name: "quantity", positive: true).to_s("F")
            }
          else
            reject_fields!(attributes, CATALOG_FIELDS - [ :quantity ], message: "Custom invoice lines cannot include")
            quantity = Money.decimal(attributes.fetch(:quantity), name: "quantity", positive: true)
            unit_amount = Money.decimal(attributes.fetch(:unit_amount), name: "unit amount")
            {
              quantity: quantity.to_s("F"),
              unit_amount: unit_amount.to_s("F"),
              description_snapshot: attributes.fetch(:description_snapshot).to_s
            }
          end
        end
      rescue KeyError => error
        raise ArgumentError, "Invoice line is missing #{error.key}."
      end

      def self.resolve!(practice:, currency:, lines:, invoice: nil)
        retained_ids = lines.filter_map { |line| line[:invoice_line_id] }
        raise ArgumentError, "Existing invoice lines cannot be used to create an invoice." if retained_ids.any? && !invoice
        raise ArgumentError, "Each existing invoice line can be retained only once." if retained_ids.uniq.size != retained_ids.size
        if retained_ids.any? && invoice.currency != currency
          raise ArgumentError, "Retained invoice lines must keep the invoice currency."
        end

        retained_lines = if retained_ids.any?
          invoice.lines.where(id: retained_ids).order(:id).lock.index_by(&:id)
        else
          {}
        end
        missing_retained = retained_ids - retained_lines.keys
        raise ActiveRecord::RecordNotFound, "Invoice line was not found on this invoice." if missing_retained.any?
        unless retained_lines.values.all?(&:billing_service_id)
          raise ArgumentError, "Only catalog-backed invoice lines can be retained by invoice_line_id."
        end

        ids = lines.filter_map { |line| line[:billing_service_id] }.uniq.sort
        services = practice.billing_services.where(id: ids).order(:id).lock.index_by(&:id)
        missing = ids - services.keys
        raise ActiveRecord::RecordNotFound, "Billing service was not found." if missing.any?

        lines.map do |line|
          if line[:invoice_line_id]
            retained = retained_lines.fetch(line.fetch(:invoice_line_id))
            quantity = Money.decimal(line.fetch(:quantity), name: "quantity", positive: true)
            unit_amount = Money.decimal(retained.unit_amount, name: "unit amount")
            next {
              invoice_line_id: retained.id,
              billing_service_id: retained.billing_service_id,
              quantity: quantity.to_s("F"),
              unit_amount: unit_amount.to_s("F"),
              posted_amount: Money.line_total(quantity: quantity, unit_amount: unit_amount),
              description_snapshot: retained.description_snapshot.to_s
            }
          end

          unless line[:billing_service_id]
            quantity = Money.decimal(line.fetch(:quantity), name: "quantity", positive: true)
            unit_amount = Money.decimal(line.fetch(:unit_amount), name: "unit amount")
            next line.merge(posted_amount: Money.line_total(quantity: quantity, unit_amount: unit_amount))
          end

          service = services.fetch(line.fetch(:billing_service_id))
          raise ArgumentError, "#{service.name} is inactive and cannot be added to a new invoice." unless service.active?
          unless service.lock_version == line.fetch(:service_lock_version)
            raise ActiveRecord::StaleObjectError.new(service, "select")
          end
          unless service.currency == currency
            raise ArgumentError, "All invoice lines must use the invoice currency."
          end

          quantity = Money.decimal(line.fetch(:quantity), name: "quantity", positive: true)
          unit_amount = Money.currency_amount(service.unit_amount, name: "unit amount")
          line.merge(
            unit_amount: unit_amount.to_s("F"),
            posted_amount: Money.line_total(quantity: quantity, unit_amount: unit_amount),
            description_snapshot: [ service.name, service.description.presence ].compact.join(" — ")
          )
        end
      end

      def self.reject_fields!(attributes, fields, message:)
        field = fields.find { |candidate| attributes.key?(candidate) }
        raise ArgumentError, "#{message} #{field}." if field
      end
      private_class_method :reject_fields!

      def self.reject_retained_overrides!(attributes)
        field = (attributes.keys - RETAINED_FIELDS).first
        return unless field

        raise ArgumentError, "Retained invoice lines cannot include #{field}."
      end
      private_class_method :reject_retained_overrides!

      def self.positive_integer(value, field:)
        number = Integer(value.to_s, 10)
        return number if number.positive?

        raise ArgumentError, "#{field} must be a positive integer."
      rescue ArgumentError
        raise ArgumentError, "#{field} must be a positive integer."
      end
      private_class_method :positive_integer

      def self.nonnegative_integer(value, field:)
        number = Integer(value.to_s, 10)
        return number unless number.negative?

        raise ArgumentError, "#{field} must be zero or greater."
      rescue ArgumentError
        raise ArgumentError, "#{field} must be zero or greater."
      end
      private_class_method :nonnegative_integer
    end
  end
end
