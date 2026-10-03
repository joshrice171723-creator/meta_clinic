require "net/http"
require "resolv"
require "ipaddr"
require "timeout"

module Qa
  class MuseEvidence
    class ArchiveFailed < StandardError; end
    MAX_BYTES = 4 * 1024 * 1024
    BLOCKED_NETWORKS = %w[0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12
      192.0.0.0/24 192.0.2.0/24 192.168.0.0/16 198.18.0.0/15 198.51.100.0/24 203.0.113.0/24 224.0.0.0/4 240.0.0.0/4
      ::/96 ::1/128 fc00::/7 fe80::/10 ff00::/8 2001:db8::/32].map { |value| IPAddr.new(value) }.freeze

    def self.validate!(items)
      WorkflowContract.list!(items, minimum: 1, maximum: 20).each do |item|
        raise ArgumentError, "Each evidence item must be an object." unless item.is_a?(Hash)
        case item["kind"]
        when "observation"
          WorkflowContract.object!(item, %w[kind text])
          WorkflowContract.text!(item["text"], maximum: 4000)
        when "screenshot"
          WorkflowContract.object!(item, %w[kind url])
          url!(item["url"])
        when "qa_evidence_id"
          WorkflowContract.object!(item, %w[kind id])
          WorkflowContract.positive!(item["id"])
        else
          raise ArgumentError, "Unknown evidence kind."
        end
      end
    end

    def self.archive!(items, credential:, build_pin:, workflow_ids:, fixture_scopes:)
      Timeout.timeout(25) do
        items.map do |item|
          next item.dup if item["kind"] == "observation"

          artifact = if item["kind"] == "qa_evidence_id"
            Evidence.find_by(id: item["id"])
          else
            image, content_type = download!(item.fetch("url"))
            Evidence.create!(user: credential.user, issue_number: nil, workflow_ids:, revision: build_pin,
              caption: "Muse screenshot: #{workflow_ids.join(', ')}".truncate(500), phase: "observation",
              image:, content_type:, digest: Digest::SHA256.hexdigest(image), created_at: Time.current,
              context: { "fixture_scopes" => fixture_scopes })
          end
          unless artifact && artifact.user_id == credential.user_id && artifact.revision == build_pin &&
              (workflow_ids - artifact.workflow_ids).empty? && fixture_scopes.all? { |scope| artifact.context.fetch("fixture_scopes", []).include?(scope) }
            raise MuseWrites::Denied, "Stored evidence does not match the exact build and verified workflow scope."
          end
          { "kind" => "screenshot", "id" => artifact.id, "url" => "/api/qa/evidence/#{artifact.id}",
            "sha256" => artifact.digest, "content_type" => artifact.content_type, "bytes" => artifact.image.bytesize,
            "build_pin" => artifact.revision, "workflow_ids" => artifact.workflow_ids }
        end
      end
    rescue Timeout::Error
      raise ArchiveFailed, "Screenshot archival timed out; the write was rolled back."
    end

    def self.download!(source)
      Timeout.timeout(20) do
        uri = url!(source)
        4.times do |hop|
          hosts = ENV.fetch("QA_MUSE_EVIDENCE_HOSTS", "").split(",").map { |host| host.strip.downcase }.reject(&:empty?)
          raise ArchiveFailed, "Screenshot host is not approved." unless hosts.include?(uri.host.downcase)
          addresses = Resolv.getaddresses(uri.host)
          raise ArchiveFailed, "Screenshot host must resolve only to public addresses." if addresses.empty? || addresses.any? { |address| !public_address?(address) }
          http = Net::HTTP.new(uri.host, 443, nil)
          http.ipaddr = addresses.first
          http.use_ssl = true
          http.open_timeout = 5
          http.read_timeout = 5
          http.max_retries = 0
          redirect = nil
          result = nil
          http.start do |client|
            client.request(Net::HTTP::Get.new(uri.request_uri, "Accept" => "image/png, image/jpeg")) do |response|
              if response.is_a?(Net::HTTPRedirection)
                raise ArchiveFailed, "Screenshot redirect limit exceeded." if hop == 3 || response["location"].blank?
                redirect = url!(URI.join(uri.to_s, response["location"]).to_s)
                next
              end
              raise ArchiveFailed, "Screenshot download did not succeed." unless response.is_a?(Net::HTTPSuccess)
              raise ArchiveFailed, "Screenshot exceeds 4 MiB." if response["content-length"].to_i > MAX_BYTES
              data = +"".b
              response.read_body do |chunk|
                data << chunk
                raise ArchiveFailed, "Screenshot exceeds 4 MiB." if data.bytesize > MAX_BYTES
              end
              type = response["content-type"].to_s.split(";").first.to_s.strip.downcase
              valid = type == "image/png" && data.start_with?("\x89PNG\r\n\x1a\n".b) || type == "image/jpeg" && data.start_with?("\xff\xd8\xff".b)
              raise ArchiveFailed, "Screenshot must be a PNG or JPEG image." unless valid && data.bytesize.positive?
              result = [data, type]
            end
          end
          return result if result
          uri = redirect
        end
      end
    rescue ArchiveFailed
      raise
    rescue StandardError
      raise ArchiveFailed, "Screenshot could not be archived. Upload again and submit immediately."
    end

    def self.url!(value)
      WorkflowContract.text!(value, maximum: 8000)
      uri = URI.parse(value)
      raise ArgumentError, "Screenshot URL must be HTTPS without credentials or a fragment." unless uri.is_a?(URI::HTTPS) &&
        uri.host.present? && uri.port == 443 && uri.userinfo.nil? && uri.fragment.nil?
      uri
    rescue URI::InvalidURIError
      raise ArgumentError, "Screenshot URL is invalid."
    end

    def self.public_address?(value)
      address = IPAddr.new(value)
      address = address.native if address.ipv4_mapped?
      BLOCKED_NETWORKS.none? { |network| network.include?(address) }
    rescue IPAddr::InvalidAddressError
      false
    end

    private_class_method :url!, :public_address?
  end
end
