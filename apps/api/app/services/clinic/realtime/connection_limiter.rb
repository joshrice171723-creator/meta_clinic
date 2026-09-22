module Clinic
  module Realtime
    class ConnectionLimiter
      DEFAULT_LIMIT = 20
      @mutex = Mutex.new
      @active = 0

      class << self
        def acquire
          @mutex.synchronize do
            return false if @active >= limit

            @active += 1
            true
          end
        end

        def release
          @mutex.synchronize { @active = [@active - 1, 0].max }
        end

        private

        def limit
          Integer(ENV.fetch("CLINIC_REALTIME_MAX_CONNECTIONS", DEFAULT_LIMIT.to_s)).clamp(1, 250)
        rescue ArgumentError
          DEFAULT_LIMIT
        end
      end
    end
  end
end
