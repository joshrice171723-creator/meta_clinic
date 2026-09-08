require "bigdecimal"

module Clinic
  module Inventory
    class PatientPricing
      def self.calculate(wholesale_unit_cost:, markup_percent:, dispensing_fee:)
        cost = decimal(wholesale_unit_cost, "wholesale unit cost", zero: true)
        markup = decimal(markup_percent, "markup percent", zero: true)
        fee = decimal(dispensing_fee, "dispensing fee", zero: true)
        raise ArgumentError, "Markup percent must be 0–1,000." if markup > 1_000

        (cost + (cost * markup / 100) + fee).round(2)
      end

      def self.decimal(value, label, zero: false)
        text = value.to_s
        raise ArgumentError, "Enter a valid #{label}." unless text.match?(/\A\d+(?:\.\d{1,6})?\z/)
        number = BigDecimal(text)
        raise ArgumentError, "Enter a valid #{label}." unless number >= (zero ? 0 : BigDecimal("0.000001")) && number <= 1_000_000_000
        number
      end
      private_class_method :decimal
    end
  end
end
