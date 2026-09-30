require "net/http"
require "json"

module Qa
  class Workspace
    class UpstreamError < StandardError
      attr_reader :status
      def initialize(status)
        @status = status.to_i
        super("Upstream HTTP #{@status}")
      end
    end
    REPOSITORY = "joshrice171723-creator/meta_clinic".freeze
    GUARDRAILS = [
      "Use synthetic fixtures in the dedicated QA clinic only.",
      "Do not finalize clinical, financial, prescribing, or outbound actions.",
      "Read-only exploration unless a QA batch is active.",
      "Verify build.json before and after each run. Stop and re-pin if the full revision changes.",
      "Queued is not dispatched. An agent must claim work and attach its result.",
      "One browser run at a time. Preserve the existing three-repair-attempt limit."
    ].freeze

    def self.build
      url = ENV.fetch("QA_BUILD_URL", Rails.env.production? ? "http://web:8080/build.json" : "http://127.0.0.1:3000/build.json")
      data = read_json(URI(url))
      raise "Build identity is incomplete" unless data.is_a?(Hash) && data["revision"].to_s.match?(/\A[0-9a-f]{40}\z/)
      data.slice("version", "revision", "environment", "dirty").merge("observed_at" => Time.current.iso8601)
    rescue StandardError => error
      { "version" => nil, "revision" => nil, "observed_at" => nil, "error" => "Live build identity unavailable (#{error.class.name})." }
    end

    def self.state
      Snapshot.find_by(key: "state")&.data || JSON.parse(Rails.root.join("config/qa_state.json").read)
    end

    def self.coverage_export(data)
      raise ArgumentError, "Coverage export must be an object." unless data.is_a?(Hash)
      if data.to_json.match?(/(?:"(?:password|secret|token|service_token|api_key|authorization)"\s*:|Bearer\s+[A-Za-z0-9_+\/-]{12,})/i)
        raise ArgumentError, "Remove credentials from the coverage export before importing."
      end
      workflows = data["coverage"] || data["workflows"]
      if workflows.is_a?(Hash)
        workflows = workflows.map do |id, item|
          raise ArgumentError, "Each workflow must be an object." unless item.is_a?(Hash)
          raise ArgumentError, "Workflow id differs from its key." if %w[id workflow].any? { |field| item[field] && item[field] != id }
          item.merge("id" => id)
        end
      end
      unless workflows.is_a?(Array) && workflows.length.between?(1, 116)
        raise ArgumentError, "Provide 1–116 expanded workflow records in coverage or workflows."
      end
      fields = %w[id workflow title result status marker last_attempted_at last_attempt last_version version revision evidence_ref evidence notes attempts]
      workflows = workflows.map do |item|
        unless item.is_a?(Hash) && (item["id"] || item["workflow"]).to_s.match?(/\AWF-(?:00[1-9]|0[1-9][0-9]|10[0-9]|11[0-6])\z/)
          raise ArgumentError, "Each workflow requires its WF-001–WF-116 id."
        end
        if item["id"] && item["workflow"] && item["id"] != item["workflow"]
          raise ArgumentError, "Workflow id aliases must match."
        end
        record = item.slice(*fields).merge("id" => item["id"] || item["workflow"], "historical" => true)
        unless record.values.all? { |value| value.nil? || value.is_a?(String) || value.is_a?(Numeric) || value == true || value == false }
          raise ArgumentError, "Workflow fields must contain scalar values."
        end
        raise ArgumentError, "Workflow record exceeds 10 KB." if record.to_json.bytesize > 10_000
        if record["revision"].present? && !record["revision"].to_s.match?(/\A[0-9a-f]{40}\z/)
          raise ArgumentError, "Workflow revision must be a full SHA."
        end
        record
      end
      raise ArgumentError, "Workflow ids must be unique." unless workflows.map { |item| item["id"] }.uniq.length == workflows.length
      pointer = data["pointer"]
      unless pointer.nil? || pointer.is_a?(Integer) && pointer.between?(0, 116) || pointer.is_a?(String) && pointer.match?(/\AWF-(?:00[1-9]|0[1-9][0-9]|10[0-9]|11[0-6])\z/)
        raise ArgumentError, "Coverage pointer must identify a catalog workflow."
      end
      { "coverage" => workflows, "coverage_pointer" => pointer, "coverage_import_status" => "expanded-export" }
    end

    def self.scheduler_state(data)
      fields = %w[source status schedule_id observed_at next_run_at interval_minutes]
      unless data.is_a?(Hash) && (data.keys - fields).empty? && data["source"].is_a?(String) &&
          data["source"].length.between?(1, 200) && %w[active paused unavailable].include?(data["status"])
        raise ArgumentError, "Provide a scheduler source and active, paused or unavailable status."
      end
      %w[observed_at next_run_at].each do |field|
        value = data[field]
        next if value.nil? && field == "next_run_at"
        unless value.is_a?(String) && value.match?(/(?:Z|[+-]\d{2}:\d{2})\z/)
          raise ArgumentError, "Scheduler timestamps must include a timezone."
        end
        Time.iso8601(value)
      end
      if data["schedule_id"] && (!data["schedule_id"].is_a?(String) || data["schedule_id"].length > 200)
        raise ArgumentError, "Scheduler id must be a string of 200 characters or less."
      end
      if data["interval_minutes"] && !(data["interval_minutes"].is_a?(Integer) && data["interval_minutes"].between?(1, 10_080))
        raise ArgumentError, "Scheduler interval must be 1–10080 minutes."
      end
      data
    end

    def self.github(refresh: false)
      cached = Snapshot.find_by(key: "github")
      return with_priorities(cached.data) if !refresh && cached && cached.updated_at > 1.minute.ago
      issues = []
      1.upto(20) do |page|
        uri = URI("https://api.github.com/repos/#{REPOSITORY}/issues?labels=muse-qa&state=all&per_page=100&page=#{page}")
        entries = read_json(uri, github: true)
        raise "Invalid GitHub response" unless entries.is_a?(Array)
        issues.concat(entries.reject { |entry| entry.key?("pull_request") }.map do |entry|
          entry.slice("number", "title", "state", "html_url", "created_at", "updated_at", "closed_at", "body")
            .merge("labels" => entry.fetch("labels", []).map { |label| label.fetch("name") })
        end)
        break if entries.length < 100
        raise "GitHub pagination limit reached" if page == 20
      end
      result = { "status" => "connected", "observed_at" => Time.current.iso8601, "issues" => issues }
      Snapshot.put("github", result)
      with_priorities(result)
    rescue StandardError => error
      detail = error.is_a?(UpstreamError) ? "HTTP #{error.status}" : error.class.name
      with_priorities((cached&.data || { "issues" => [], "observed_at" => nil }).merge(
        "status" => cached ? "stale" : "unavailable", "error" => "GitHub refresh failed (#{detail}); check QA_GITHUB_TOKEN and repository access. Cached records remain visible."))
    end

    def self.with_priorities(data)
      priorities = Snapshot.where("key LIKE 'priority:%'").pluck(:key, :data).to_h
      data.merge("issues" => data.fetch("issues", []).map do |issue|
        issue.merge("priority" => priorities.dig("priority:#{issue.fetch('number')}", "priority") == true)
      end)
    end

    def self.read_json(uri, github: false)
      request = Net::HTTP::Get.new(uri)
      request["Accept"] = "application/json"
      request["User-Agent"] = "MetaClinic-QA-Workspace"
      request["Authorization"] = "Bearer #{ENV.fetch('QA_GITHUB_TOKEN')}" if github && ENV["QA_GITHUB_TOKEN"].present?
      response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https", open_timeout: 4, read_timeout: 8) { |http| http.request(request) }
      raise UpstreamError, response.code unless response.is_a?(Net::HTTPSuccess)
      raise "Response too large" if response.body.bytesize > 5.megabytes
      JSON.parse(response.body)
    end

    def self.event(user:, kind:, summary:, revision: nil, payload: {}, event_key: SecureRandom.uuid)
      Event.create_or_find_by!(event_key:) do |entry|
        entry.assign_attributes(user:, kind:, summary:, revision:, payload:)
      end
    end

    def self.deliver_question(task)
      return { status: "queued", reason: "GitHub delivery is not configured." } if ENV["QA_GITHUB_TOKEN"].blank?
      issue = Integer(task.payload.fetch("github_issue"))
      raise ArgumentError, "A GitHub issue number is required for comment delivery." unless issue.positive?
      base = "https://api.github.com/repos/#{REPOSITORY}/issues/#{issue}"
      body = "QA question · task ##{task.id}\n\n#{task.payload.fetch('question')}\n\nBuild: #{task.revision}"
      comment = write_github(URI("#{base}/comments"), { body: })
      write_github(URI("#{base}/labels"), { labels: [ "qa-question" ] })
      { status: "posted", comment_url: comment.fetch("html_url") }
    rescue StandardError => error
      { status: "delivery_failed", reason: "GitHub question delivery failed (#{error.class.name}); inbox task remains queued." }
    end

    def self.write_github(uri, payload)
      request = Net::HTTP::Post.new(uri)
      request["Accept"] = "application/vnd.github+json"
      request["Content-Type"] = "application/json"
      request["User-Agent"] = "MetaClinic-QA-Workspace"
      request["Authorization"] = "Bearer #{ENV.fetch('QA_GITHUB_TOKEN')}"
      request.body = JSON.generate(payload)
      response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true, open_timeout: 4, read_timeout: 8) { |http| http.request(request) }
      raise "GitHub #{response.code}" unless response.is_a?(Net::HTTPSuccess)
      JSON.parse(response.body)
    end
  end
end
