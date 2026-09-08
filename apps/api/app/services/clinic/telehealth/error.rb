module Clinic
  module Telehealth
    class Error < StandardError
      attr_reader :code, :status, :retryable, :field

      def initialize(message, code:, status: :unprocessable_entity, retryable: false, field: nil)
        super(message)
        @code = code
        @status = status
        @retryable = retryable
        @field = field
      end
    end
  end
end
