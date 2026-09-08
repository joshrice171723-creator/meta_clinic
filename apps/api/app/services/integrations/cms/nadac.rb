require "csv"
require "json"
require "net/http"
require "stringio"

module Integrations
  module Cms
    class Nadac
      class Unavailable < StandardError; end

      CATALOG_URL = "https://data.medicaid.gov/data.json".freeze
      DATASTORE_URL = "https://data.medicaid.gov/api/1/datastore/query".freeze
      CACHE_TTL = 6.hours
      MAX_BYTES = 120_000_000

      class << self
        def lookup(ndc)
          canonical = normalize_ndc(ndc)
          raise ArgumentError, "Enter a valid NDC to check the public cost benchmark." unless canonical

          source = latest_source
          payload = JSON.parse(
            fetch(
              URI("#{DATASTORE_URL}/#{source.fetch(:identifier)}/0"),
              "application/json",
              body: {
                conditions: [ { property: "ndc", value: canonical, operator: "=" } ],
                limit: 1
              }.to_json
            )
          )
          row = Array(payload.fetch("results")).find do |candidate|
            normalize_ndc(candidate["ndc"] || candidate["NDC"]) == canonical
          end
          return unless row

          {
            ndc: canonical,
            description: clean(row["ndc_description"] || row["NDC Description"], 400),
            nadac_per_unit: clean(row["nadac_per_unit"] || row["NADAC Per Unit"], 40),
            effective_date: clean(row["effective_date"] || row["Effective Date"], 40),
            pricing_unit: clean(row["pricing_unit"] || row["Pricing Unit"], 20),
            source_url: source.fetch(:url),
            source_updated_at: source[:updated_at]
          }
        rescue CSV::MalformedCSVError, JSON::ParserError, KeyError, TypeError
          raise Unavailable, "The CMS public cost benchmark returned an unreadable response."
        end

        def normalize_ndc(value)
          text = value.to_s.strip
          return unless text.match?(/\A\d+(?:-\d+){0,2}\z/)

          parts = text.split("-")
          if parts.length == 3
            return parts.join if parts.sum(&:length) == 11
            return "0#{parts.join}" if parts.map(&:length) == [ 4, 4, 2 ]
            return "#{parts[0]}0#{parts[1]}#{parts[2]}" if parts.map(&:length) == [ 5, 3, 2 ]
            return "#{parts[0]}#{parts[1]}0#{parts[2]}" if parts.map(&:length) == [ 5, 4, 1 ]
            return
          end

          text if parts.length == 1 && text.length == 11
        end

        def reset_cache!
          @source_cache = nil
        end

        private

        def latest_source
          if @source_cache && @source_cache[:loaded_at] > CACHE_TTL.ago
            return @source_cache
          end

          @source_cache = load_source
        end

        def load_source
          datasets = JSON.parse(fetch(URI(CATALOG_URL), "application/json")).fetch("dataset")
          dataset = datasets.filter_map do |candidate|
            next unless candidate.is_a?(Hash)
            match = /\ANADAC \(National Average Drug Acquisition Cost\) (\d{4})\z/.match(candidate["title"].to_s)
            next unless match
            distribution = Array(candidate["distribution"]).find { |entry| entry.is_a?(Hash) && entry["downloadURL"].to_s.start_with?("https://download.medicaid.gov/") && entry["format"].to_s.casecmp("csv").zero? }
            next unless distribution
            [ match[1].to_i, candidate, distribution ]
          end.max_by(&:first)
          raise Unavailable, "The CMS public cost benchmark source could not be found." unless dataset

          candidate, distribution = dataset.values_at(1, 2)
          {
            identifier: candidate.fetch("identifier"),
            url: distribution.fetch("downloadURL"),
            updated_at: candidate["modified"].to_s.presence,
            loaded_at: Time.current
          }
        rescue JSON::ParserError, KeyError, TypeError
          raise Unavailable, "The CMS public cost benchmark source returned an unreadable response."
        end

        def fetch(uri, accept, body: nil)
          response_body = +""
          code = nil
          deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 20
          Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", open_timeout: 5, read_timeout: 15, write_timeout: 5, max_retries: 0) do |http|
            request = body ? Net::HTTP::Post.new(uri) : Net::HTTP::Get.new(uri)
            request["Accept"] = accept
            request["Content-Type"] = "application/json" if body
            request.body = body if body
            http.request(request) do |response|
              code = response.code
              response.read_body do |chunk|
                raise Unavailable, "The CMS public cost benchmark is taking too long. Try again later." if Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline
                raise Unavailable, "The CMS public cost benchmark response was too large." if response_body.bytesize + chunk.bytesize > MAX_BYTES
                response_body << chunk
              end
            end
          end
          raise Unavailable, "The CMS public cost benchmark could not be reached. Try again later." unless code == "200"
          response_body
        rescue Timeout::Error, SocketError, SystemCallError, IOError, OpenSSL::SSL::SSLError, Net::HTTPBadResponse
          raise Unavailable, "The CMS public cost benchmark could not be reached. Try again later."
        end

        def clean(value, length)
          value.to_s.strip.first(length).presence
        end
      end
    end
  end
end
