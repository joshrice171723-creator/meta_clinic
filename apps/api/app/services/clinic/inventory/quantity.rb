module Clinic
  module Inventory
    module Quantity
      def self.parse(value, scale:, zero: false)
        text = value.to_s
        raise ArgumentError, "Enter an exact quantity with at most #{scale} decimal places." unless text.match?(/\A\d+(?:\.\d+)?\z/)
        number = BigDecimal(text)
        unless number.between?(zero ? 0 : BigDecimal("0.000001"), 1_000_000) && number == number.round(scale)
          raise ArgumentError, "Enter #{zero ? '0' : 'a positive quantity'}–1,000,000 in the configured stock unit (#{scale} decimal places)."
        end
        number
      end
    end
  end
end
