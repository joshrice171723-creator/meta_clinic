require "json"
require "net/http"

module Integrations
  module Fda
    class Gudid
      class Unavailable < StandardError; end

      ENDPOINT = "https://accessgudid.nlm.nih.gov/api/v3/devices/lookup.json".freeze
      MAX_BYTES = 1_000_000

      class << self
        def lookup(identifier)
          value = identifier.to_s.strip
          raise ArgumentError, "Enter a UDI-DI, GTIN, or UDI from the device label." unless valid_identifier?(value)

          parameter = value.match?(/\A[0-9 -]+\z/) ? "di" : "udi"
          uri = URI(ENDPOINT)
          uri.query = URI.encode_www_form(parameter => value)
          payload = fetch(uri)
          return unless payload.is_a?(Hash)

          device = payload.dig("gudid", "device")
          return unless device.is_a?(Hash)

          identifiers = device.dig("identifiers", "identifier")
          primary = Array(identifiers).find { |entry| entry.is_a?(Hash) && entry["deviceIdType"] == "Primary" } || Array(identifiers).find { |entry| entry.is_a?(Hash) }
          gmdn = Array(device.dig("gmdnTerms", "gmdn")).find { |entry| entry.is_a?(Hash) }
          sterilization = device.dig("sterilization")
          {
            device_identifier: clean(primary&.fetch("deviceId", nil), 160),
            issuing_agency: clean(primary&.fetch("deviceIdIssuingAgency", nil), 80),
            brand_name: clean(device["brandName"], 250),
            company_name: clean(device["companyName"], 250),
            version_model_number: clean(device["versionModelNumber"], 160),
            catalog_number: clean(device["catalogNumber"], 160),
            device_description: clean(device["deviceDescription"], 4000),
            single_use: device["singleUse"],
            lot_batch: device["lotBatch"],
            expiration_date: device["expirationDate"],
            device_sterile: sterilization.is_a?(Hash) ? sterilization["deviceSterile"] : nil,
            gmdn_name: clean(gmdn&.fetch("gmdnPTName", nil), 250),
            source_url: primary&.fetch("deviceId", nil).to_s.present? ? "https://accessgudid.nlm.nih.gov/devices/#{primary.fetch('deviceId')}" : "https://accessgudid.nlm.nih.gov/"
          }.compact
        rescue JSON::ParserError, KeyError, TypeError
          raise Unavailable, "The FDA device directory returned an unreadable response."
        end

        private

        def valid_identifier?(value)
          value.length.between?(6, 200) && value.match?(/\A[0-9A-Za-z .\-()=,|\/+]+\z/)
        end

        def fetch(uri)
          body = +""
          code = nil
          deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 10
          Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 3, read_timeout: 5, write_timeout: 3, max_retries: 0) do |http|
            http.request(Net::HTTP::Get.new(uri, "Accept" => "application/json")) do |response|
              code = response.code
              response.read_body do |chunk|
                raise Unavailable, "The FDA device directory is taking too long. Try again later." if Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline
                raise Unavailable, "The FDA device response was too large. Use a device identifier." if body.bytesize + chunk.bytesize > MAX_BYTES
                body << chunk
              end
            end
          end
          return if code == "404"
          raise Unavailable, "The FDA device directory is unavailable. Try again later." unless code == "200"
          JSON.parse(body)
        rescue Timeout::Error, SocketError, SystemCallError, IOError, OpenSSL::SSL::SSLError, Net::HTTPBadResponse
          raise Unavailable, "The FDA device directory could not be reached. Try again; manual entry is still available."
        end

        def clean(value, length)
          value.is_a?(String) ? value.strip.first(length).presence : nil
        end
      end
    end
  end
end
