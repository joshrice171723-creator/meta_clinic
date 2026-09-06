require "base64"
require "digest"
require "json"
require "net/http"
require "uri"

module Clinic
  module Scribe
    class OpenRouter
      class Error < StandardError
        attr_reader :code

        def initialize(message, code: "provider_unavailable")
          @code = code
          super(message)
        end
      end

      ENDPOINT = URI("https://openrouter.ai/api/v1/chat/completions")
      DEFAULT_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"
      MAX_RESPONSE_BYTES = 5.megabytes
      PROMPT_VERSION = "soap-audio-v1"
      SYSTEM_PROMPT = <<~PROMPT.freeze
        You are a clinical documentation scribe. Transcribe the supplied encounter audio faithfully and create a SOAP draft for professional review.
        Preserve uncertainty as [unclear]. Do not guess speaker identity, demographics, measurements, diagnoses, treatments, medications, or follow-up.
        Include assessment or plan content only when it is explicitly stated in the recording. Use empty text when the source does not support a section.
        Call submit_scribe_result exactly once. Do not respond with prose outside that tool call.
      PROMPT

      class << self
        def configured?
          Rails.env.development? && ENV["OPENROUTER_API_KEY"].present?
        end

        def model
          ENV.fetch("OPENROUTER_SCRIBE_MODEL", DEFAULT_MODEL).presence || DEFAULT_MODEL
        end

        def prompt_digest
          Digest::SHA256.hexdigest([PROMPT_VERSION, SYSTEM_PROMPT].join("\0"))
        end

        def process(audio:, format:, duration_ms:)
          raise Error.new("OpenRouter is not configured for this environment.", code: "provider_not_configured") unless configured?

          response = request(audio:, format:, duration_ms:)
          parse(response)
        rescue Timeout::Error, SocketError, SystemCallError, IOError, OpenSSL::SSL::SSLError, Net::HTTPBadResponse
          raise Error, "OpenRouter could not be reached."
        end

        private

        def request(audio:, format:, duration_ms:)
          body = {
            model: model,
            temperature: 0,
            max_tokens: 8_000,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Create the faithful transcript and review-required SOAP draft for this #{duration_ms} ms encounter recording."
                  },
                  { type: "input_audio", input_audio: { data: Base64.strict_encode64(audio), format: format } }
                ]
              }
            ],
            tools: [result_tool],
            tool_choice: { type: "function", function: { name: "submit_scribe_result" } }
          }
          request = Net::HTTP::Post.new(ENDPOINT)
          request["Authorization"] = "Bearer #{ENV.fetch("OPENROUTER_API_KEY")}"
          request["Content-Type"] = "application/json"
          request["Accept"] = "application/json"
          request["X-Title"] = "APPly Scribe"
          request.body = JSON.generate(body)

          Net::HTTP.start(ENDPOINT.host, ENDPOINT.port, use_ssl: true, open_timeout: 5,
            read_timeout: 180, write_timeout: 60, max_retries: 0) do |http|
            response = http.request(request)
            unless response.is_a?(Net::HTTPSuccess)
              code = response.code.to_i == 429 ? "provider_rate_limited" : "provider_unavailable"
              raise Error.new("OpenRouter did not accept the recording.", code: code)
            end
            raise Error.new("OpenRouter returned an oversized response.", code: "invalid_provider_response") if
              response.body.to_s.bytesize > MAX_RESPONSE_BYTES
            response
          end
        end

        def parse(response)
          payload = JSON.parse(response.body)
          calls = Array(payload.dig("choices", 0, "message", "tool_calls"))
          call = calls.find { |item| item.dig("function", "name") == "submit_scribe_result" }
          raise Error.new("OpenRouter did not return a structured scribe result.", code: "invalid_provider_response") unless call

          result = JSON.parse(call.dig("function", "arguments").to_s)
          transcript = result["transcript"].to_s.strip
          raise Error.new("OpenRouter returned an empty transcript.", code: "invalid_provider_response") if transcript.blank?
          raise Error.new("OpenRouter returned an oversized transcript.", code: "invalid_provider_response") if transcript.bytesize > 250_000

          sections = result["sections"]
          unless sections.is_a?(Hash) && Workflow::SECTIONS.all? { |key| sections[key].is_a?(String) }
            raise Error.new("OpenRouter returned an incomplete SOAP draft.", code: "invalid_provider_response")
          end
          if sections.values.all? { |value| value.to_s.strip.blank? } || sections.values.any? { |value| value.bytesize > 50_000 }
            raise Error.new("OpenRouter returned an invalid SOAP draft.", code: "invalid_provider_response")
          end
          uncertain_sections = Array(result["uncertain_sections"]).map(&:to_s) & Workflow::SECTIONS
          {
            transcript: transcript,
            sections: sections.transform_values(&:strip),
            uncertain_sections: uncertain_sections,
            provider: "openrouter",
            model: payload["model"].presence || model,
            model_version: payload["model"].presence || model,
            prompt_digest: prompt_digest,
            provider_request_id: payload["id"].to_s.presence
          }
        rescue JSON::ParserError, TypeError
          raise Error.new("OpenRouter returned an unreadable scribe result.", code: "invalid_provider_response")
        end

        def result_tool
          {
            type: "function",
            function: {
              name: "submit_scribe_result",
              description: "Return the faithful transcript and source-grounded SOAP draft.",
              parameters: {
                type: "object",
                additionalProperties: false,
                required: %w[transcript sections uncertain_sections],
                properties: {
                  transcript: { type: "string" },
                  sections: {
                    type: "object",
                    additionalProperties: false,
                    required: Workflow::SECTIONS,
                    properties: Workflow::SECTIONS.to_h { |key| [key, { type: "string" }] }
                  },
                  uncertain_sections: {
                    type: "array",
                    items: { type: "string", enum: Workflow::SECTIONS },
                    uniqueItems: true
                  }
                }
              }
            }
          }
        end
      end
    end
  end
end
