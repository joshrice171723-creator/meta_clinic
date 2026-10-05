require "json"
require "net/http"
require "openssl"
require "timeout"
require "uri"

module Clinic
  module Assistant
    module Providers
      class OpenRouter
        class Error < StandardError; end
        class RetryableError < Error; end
        class QuotaError < RetryableError; end

        ENDPOINT = URI("https://openrouter.ai/api/v1/chat/completions")
        ATTEMPT_DEADLINE_SECONDS = 20
        MAX_RESPONSE_BYTES = 12_000
        MAX_COMPLETION_TOKENS = 300
        MAX_WORKFLOW_COMPLETION_TOKENS = 1_200

        attr_reader :response_metadata

        def initialize(model:)
          @model = model
        end

        def call(input)
          parse(request(input))
        end

        def call_workflow(input, schema:, schema_name:, system_prompt:)
          parse_json(request(input, response_format: build_response_format(schema:, schema_name:), system_prompt:,
            max_tokens: MAX_WORKFLOW_COMPLETION_TOKENS))
        end

        private

        def request(input = nil, response_format: nil, system_prompt: ModelGateway::SYSTEM_PROMPT, max_tokens: MAX_COMPLETION_TOKENS, **request_input)
          input ||= request_input
          input = input.to_h
          response_format ||= booking_response_format
          request = Net::HTTP::Post.new(ENDPOINT)
          request["Authorization"] = "Bearer #{ENV.fetch("OPENROUTER_API_KEY")}"
          request["Content-Type"] = "application/json"
          request["Accept"] = "application/json"
          request["X-Title"] = "Meta Clinic Assistant"
          request.body = JSON.generate(
            model: @model,
            temperature: 0,
            max_tokens:,
            reasoning: { enabled: false },
            provider: { max_price: { prompt: 0, completion: 0 }, require_parameters: true },
            response_format:,
            messages: [
              { role: "system", content: system_prompt },
              { role: "user", content: JSON.generate(input) }
            ]
          )

          response_body = nil
          response = Timeout.timeout(ATTEMPT_DEADLINE_SECONDS) do
            Net::HTTP.start(ENDPOINT.host, ENDPOINT.port,
              use_ssl: true, open_timeout: 3, read_timeout: 8, write_timeout: 3, max_retries: 0) do |http|
              http.request(request) do |http_response|
                response_body = +"".b
                http_response.read_body do |chunk|
                  raise Error, "OpenRouter returned an oversized response." if response_body.bytesize + chunk.bytesize > MAX_RESPONSE_BYTES

                  response_body << chunk
                end
              end
            end
          end
          status = response.code.to_i
          raise QuotaError, "OpenRouter request quota is exhausted." if status == 429
          raise RetryableError, "OpenRouter request failed." if status >= 500
          raise Error, "OpenRouter did not accept the request." unless status.between?(200, 299)

          response_body
        rescue Timeout::Error, SocketError, SystemCallError, IOError, OpenSSL::SSL::SSLError, Net::HTTPBadResponse
          raise RetryableError, "OpenRouter could not be reached."
        end

        def parse(body)
          decoded = parse_json(body)
          raise Error, "OpenRouter returned an unsupported result shape." unless
            decoded.is_a?(Hash) && decoded.keys.sort == %w[date duration_minutes message status time]

          case decoded["status"]
          when "intent"
            raise Error, "OpenRouter returned an unsupported intent shape." unless decoded["message"].nil?

            {
              status: "intent",
              intent: {
                date: decoded["date"],
                time: decoded["time"],
                duration_minutes: decoded["duration_minutes"]
              }
            }
          when "clarify"
            { status: "clarify", message: decoded["message"] }
          else
            raise Error, "OpenRouter returned an unsupported status."
          end
        rescue JSON::ParserError, TypeError
          raise Error, "OpenRouter returned unreadable booking data."
        end

        def parse_json(body)
          payload = JSON.parse(body)
          @response_metadata = safe_response_metadata(payload)
          raise Error, "OpenRouter returned an incomplete structured result." if @response_metadata[:finish_reason] == "length"
          content = payload.dig("choices", 0, "message", "content")
          raise Error, "OpenRouter returned no structured result." unless content.is_a?(String) && content.bytesize <= 8_000

          decoded = JSON.parse(content)
          raise Error, "OpenRouter returned an unsupported result shape." unless decoded.is_a?(Hash)

          decoded
        rescue JSON::ParserError, TypeError
          raise Error, "OpenRouter returned unreadable assistant data."
        end

        def safe_response_metadata(payload)
          metadata = {}
          model = payload["model"]
          metadata[:model] = model if model.is_a?(String) && model.bytesize <= 200

          finish_reason = payload.dig("choices", 0, "finish_reason")
          metadata[:finish_reason] = finish_reason if finish_reason.is_a?(String) && finish_reason.match?(/\A[a-z_]{1,40}\z/i)

          usage = payload["usage"]
          if usage.is_a?(Hash)
            usage_metadata = %w[prompt_tokens completion_tokens total_tokens cost].each_with_object({}) do |key, values|
              value = usage[key]
              values[key.to_sym] = value if value.is_a?(Numeric) && value.finite? && value >= 0
            end
            reasoning_tokens = usage.dig("completion_tokens_details", "reasoning_tokens")
            if reasoning_tokens.is_a?(Numeric) && reasoning_tokens.finite? && reasoning_tokens >= 0
              usage_metadata[:reasoning_tokens] = reasoning_tokens
            end
            metadata[:usage] = usage_metadata unless usage_metadata.empty?
          end
          metadata.freeze
        end

        def build_response_format(schema:, schema_name:)
          {
            type: "json_schema",
            json_schema: {
              name: schema_name,
              strict: true,
              schema:
            }
          }
        end

        def booking_response_format
          build_response_format(schema: booking_response_schema, schema_name: "booking_search_intent")
        end

        def booking_response_schema
          {
            type: "object",
            additionalProperties: false,
            required: %w[status date time duration_minutes message],
            properties: {
              status: { type: "string", enum: %w[intent clarify] },
              date: { type: [ "string", "null" ], description: "ISO date YYYY-MM-DD, or null" },
              time: { type: [ "string", "null" ], description: "24-hour clinic-local time HH:MM, or null" },
              duration_minutes: { type: [ "integer", "null" ], description: "Requested visit duration in 5-minute increments, or null" },
              message: { type: [ "string", "null" ], description: "One short clarification question, or null for an intent" }
            }
          }
        end
      end
    end
  end
end
