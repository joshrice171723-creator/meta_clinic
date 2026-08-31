require "bigdecimal"

module Clinic
  module Billing
    module Money
      POLICY_VERSION = "half_up_v1".freeze
      SCALE = 2
      MAX_AMOUNT = BigDecimal("999999999999.99")

      def self.decimal(value, name: "amount", positive: false)
        number = BigDecimal(value.to_s)
        invalid = !number.finite? || number.negative? || (positive && number.zero?) || number > MAX_AMOUNT || number != number.round(6)
        raise ArgumentError, "#{name} is outside the supported monetary range." if invalid

        number
      rescue ArgumentError
        raise
      rescue TypeError, NoMethodError
        raise ArgumentError, "#{name} must be an exact decimal amount."
      end

      def self.line_total(quantity:, unit_amount:)
        quantity = decimal(quantity, name: "quantity", positive: true)
        unit_amount = decimal(unit_amount, name: "unit amount")
        total = (quantity * unit_amount).round(SCALE, BigDecimal::ROUND_HALF_UP)
        raise ArgumentError, "line total is outside the supported monetary range." if total > MAX_AMOUNT

        total
      end
    end
  end
end
