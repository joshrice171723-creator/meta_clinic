require "net/http"

module Integrations
  module Fda
    class NdcDirectory
      class Unavailable < StandardError; end
      ENDPOINT = "https://api.fda.gov/drug/ndc.json".freeze
      MAX_BYTES = 1_000_000

      def self.search(query)
        value = query.to_s.strip
        raise ArgumentError, "Use 3–80 characters: a public drug name or an NDC." unless value.length.between?(3, 80) && value.match?(/\A[a-zA-Z0-9 '\-.,()\/]+\z/)
        ndcs = ndc_candidates(value)
        expression = if ndcs
          ndcs.flat_map { |ndc| [ "packaging.package_ndc:\"#{ndc}\"", "product_ndc:\"#{ndc}\"" ] }.join(" OR ")
        else
          name_term = value.match?(/\A[a-zA-Z0-9]+\z/) ? "#{value}*" : "\"#{value}\""
          %w[brand_name generic_name active_ingredients.name].map { |field| "#{field}:#{name_term}" }.join(" OR ")
        end
        uri = URI(ENDPOINT)
        uri.query = URI.encode_www_form(search: "(#{expression})", limit: 8)
        payload = fetch(uri)
        raise Unavailable, "The FDA directory returned an unreadable response." unless payload.is_a?(Hash)
        records = payload.fetch("results", [])
        raise Unavailable unless records.is_a?(Array)
        records.first(8).flat_map do |record|
          next [] unless record.is_a?(Hash)
          product_ndc = clean(record["product_ndc"], 30)
          packages = record["packaging"].is_a?(Array) ? record["packaging"] : []
          packages.first(100).filter_map do |package|
            next unless package.is_a?(Hash)
            ndc = clean(package["package_ndc"], 30)
            next unless ndc.match?(/\A\d{4,5}-\d{3,4}-\d{1,2}\z/)
            next if ndcs && !ndcs.include?(ndc) && !ndcs.include?(product_ndc)
            ingredients = record["active_ingredients"].is_a?(Array) ? record["active_ingredients"] : []
            {
              name: clean(record["brand_name"], 160).presence || clean(record["generic_name"], 160).presence || "Listed package #{ndc}",
              generic_name: clean(record["generic_name"]), ndc: ndc, product_ndc: product_ndc,
              ingredients: ingredients.first(30).filter_map { |item| [ clean(item["name"]), clean(item["strength"]) ].reject(&:empty?).join(" ") if item.is_a?(Hash) }.join("; ").first(4000),
              dosage_form: clean(record["dosage_form"]), route: Array(record["route"]).first(20).map { |route| clean(route) }.join(", ").first(500),
              labeler: clean(record["labeler_name"]), package_description: clean(package["description"], 4000)
            }
          end
        end.uniq { |record| record[:ndc] }.first(40)
      rescue JSON::ParserError, KeyError, TypeError
        raise Unavailable, "The FDA directory returned an unreadable response. Try again later."
      end

      def self.ndc_candidates(value)
        return nil unless value.match?(/\A[\d\s-]+\z/)
        value = value.delete(" ")
        return [ value ] if value.match?(/\A\d{4,5}-\d{3,4}(-\d{1,2})?\z/)
        # Unhyphenated NDCs are ambiguous; search all possible 10-digit segmentations.
        return [ "#{value[0, 4]}-#{value[4, 4]}-#{value[8, 2]}", "#{value[0, 5]}-#{value[5, 3]}-#{value[8, 2]}", "#{value[0, 5]}-#{value[5, 4]}-#{value[9, 1]}" ] if value.match?(/\A\d{10}\z/)
        raise ArgumentError, "Enter the NDC with the hyphens printed on the package, or use a drug name."
      end

      def self.fetch(uri)
        body = +""
        code = nil
        deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 10
        Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 3, read_timeout: 5, write_timeout: 3, max_retries: 0) do |http|
          http.request(Net::HTTP::Get.new(uri, "Accept" => "application/json")) do |response|
            code = response.code
            response.read_body do |chunk|
              raise Unavailable, "The FDA directory is taking too long. Try again later." if Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline
              raise Unavailable, "The FDA response was too large. Narrow your search." if body.bytesize + chunk.bytesize > MAX_BYTES
              body << chunk
            end
          end
        end
        return { "results" => [] } if code == "404"
        raise Unavailable, "The FDA directory is busy or unavailable. Try again later; manual entry is still available." unless code == "200"
        JSON.parse(body)
      rescue Timeout::Error, SocketError, SystemCallError, IOError, OpenSSL::SSL::SSLError, Net::HTTPBadResponse
        raise Unavailable, "The FDA directory could not be reached. Try again later; manual entry is still available."
      end

      def self.clean(value, length = 500)
        value.is_a?(String) ? value.strip.first(length) : ""
      end
    end
  end
end
