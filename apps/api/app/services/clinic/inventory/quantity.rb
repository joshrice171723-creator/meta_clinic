module Clinic
  module Inventory
    module Quantity
      def self.parse(value, scale:, zero: false, signed: false)
        text = value.to_s
        pattern = signed ? /\A-?\d+(?:\.\d+)?\z/ : /\A\d+(?:\.\d+)?\z/
        raise ArgumentError, "Enter an exact quantity with at most #{scale} decimal places." unless text.match?(pattern)
        number = BigDecimal(text)
        minimum = signed ? -1_000_000 : (zero ? 0 : BigDecimal("0.000001"))
        unless number.between?(minimum, 1_000_000) && (zero || !number.zero?) && number == number.round(scale)
          qualifier = signed ? "a nonzero quantity from -1,000,000 to 1,000,000" : "#{zero ? '0' : 'a positive quantity'}–1,000,000"
          raise ArgumentError, "Enter #{qualifier} in the configured stock unit (#{scale} decimal places)."
        end
        number
      end
    end
  end
end
