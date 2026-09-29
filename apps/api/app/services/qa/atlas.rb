require "digest"
require "json"

module Qa
  class Atlas
    SOURCE = "APPlyVault/03 Execution/Meta Clinic Implementation Tracker.md".freeze

    def self.read
      snapshot = JSON.parse(Rails.root.join("config/qa_atlas.json").read)
      source = Rails.root.join("../..", SOURCE)
      if source.file?
        current = snapshot.fetch("source_digests").all? do |path, digest|
          file = Rails.root.join("../..", path)
          file.file? && Digest::SHA256.hexdigest(file.read.gsub(/\r\n/, "\n")) == digest
        end
        return parse(source.read).merge(status: "live_repository", inventory: snapshot.fetch("inventory"),
          inventory_status: current ? "current_repository" : "snapshot_outdated")
      end

      snapshot.merge(status: "packaged_snapshot", inventory_status: "packaged_snapshot")
    rescue StandardError => error
      { status: "unavailable", error: "Atlas tracker unavailable (#{error.class.name}).", rows: [] }
    end

    def self.parse(text)
      rows = text.lines.filter_map do |line|
        cells = line.strip.delete_prefix("|").delete_suffix("|").split("|").map(&:strip)
        match = cells[0]&.match(/\A(MC-\d{2}) — (.+)\z/)
        next unless match && cells[1]&.match?(/\A\d+%\z/)

        scores = cells[1..3].map do |cell|
          raise ArgumentError, "Invalid Atlas percentage" unless cell&.match?(/\A\d+%\z/) && cell.to_i.between?(0, 100)
          cell.to_i
        end
        raise ArgumentError, "Incomplete Atlas row" unless cells.length == 7

        { code: match[1], title: match[2], build: scores[0], validation: scores[1], external: scores[2],
          remaining: plain(cells[4]), next_work: plain(cells[5]), evidence: plain(cells[6]) }
      end
      expected = (1..16).map { |number| format("MC-%02d", number) }
      raise ArgumentError, "Expected sixteen unique Atlas milestones" unless rows.map { |row| row[:code] }.sort == expected

      core = rows.reject { |row| row[:code] == "MC-16" }
      averages = %i[build validation external].to_h { |key| [key, (core.sum { |row| row[key] }.fdiv(core.length)).round(1)] }
      { source: SOURCE, source_digest: Digest::SHA256.hexdigest(text),
        tracker_updated_at: text[/^\| Updated \(UTC\) \| ([^|]+) \|\r?$/, 1]&.strip,
        scoring_basis: "Equal-weight MC-01–15 recorded estimates. Optional insurance (MC-16) is separate.",
        averages:, rows: }
    end

    def self.plain(text)
      text.gsub(/\[([^\]]+)\]\([^)]*\)/, '\1').delete("*`").strip
    end
  end
end
