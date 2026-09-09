# frozen_string_literal: true

require "cgi"
require "fileutils"
require "json"
require "securerandom"
require "time"

module Apply
  module TaskTrace
    SCHEMA_VERSION = 1
    CATEGORIES = %w[
      agent database dependency external git other server setup test wait
    ].freeze
    COLORS = {
      "agent" => "#6d5dfc",
      "database" => "#0f9d8a",
      "dependency" => "#d97706",
      "external" => "#64748b",
      "git" => "#ef4444",
      "other" => "#8b5cf6",
      "server" => "#2563eb",
      "setup" => "#0891b2",
      "test" => "#16a34a",
      "wait" => "#94a3b8"
    }.freeze
    STATUS_COLORS = {
      "ok" => "#16a34a",
      "failed" => "#dc2626",
      "interrupted" => "#d97706",
      "running" => "#64748b"
    }.freeze

    class TraceError < StandardError; end

    module_function

    def start(name:, output_root:, source: nil)
      FileUtils.mkdir_p(output_root)
      timestamp = Time.now.utc.strftime("%Y%m%dT%H%M%S.%6NZ")
      slug = sanitize_label(name).downcase.gsub(/[^a-z0-9]+/, "-").gsub(/\A-|\z-/, "")
      slug = "task" if slug.empty?
      path = File.join(output_root, "#{timestamp}-#{slug}-#{SecureRandom.hex(4)}.json")
      started_at = Time.now.utc
      trace = {
        "schema_version" => SCHEMA_VERSION,
        "trace_id" => SecureRandom.uuid,
        "name" => sanitize_label(name),
        "source" => source && sanitize_label(source),
        "status" => "running",
        "started_at" => started_at.iso8601(6),
        "started_epoch_ms" => epoch_ms(started_at),
        "ended_at" => nil,
        "duration_ms" => nil,
        "spans" => []
      }.compact
      write_json(path, trace)
      Recorder.new(path)
    end

    def open(path)
      Recorder.new(File.expand_path(path))
    end

    def sanitize_label(value)
      value.to_s.encode("UTF-8", invalid: :replace, undef: :replace, replace: "?")
        .gsub(/[[:cntrl:]]+/, " ").strip[0, 120]
    end

    def epoch_ms(time = Time.now.utc)
      (time.to_r * 1000).to_f.round(3)
    end

    def write_json(path, value)
      FileUtils.mkdir_p(File.dirname(path))
      temporary = "#{path}.tmp-#{Process.pid}-#{SecureRandom.hex(3)}"
      File.open(temporary, File::WRONLY | File::CREAT | File::EXCL, 0o600) do |file|
        file.write(JSON.pretty_generate(value))
        file.write("\n")
      end
      File.rename(temporary, path)
    ensure
      File.delete(temporary) if defined?(temporary) && File.exist?(temporary)
    end

    class Recorder
      attr_reader :path

      def initialize(path)
        @path = File.expand_path(path)
        raise TraceError, "Trace does not exist: #{@path}" unless File.file?(@path)
      end

      def start_span(name:, category:, parent_id: nil)
        now = Time.now.utc
        span = {
          "id" => SecureRandom.uuid,
          "parent_id" => parent_id,
          "name" => TaskTrace.sanitize_label(name),
          "category" => normalize_category(category),
          "status" => "running",
          "started_at" => now.iso8601(6),
          "start_offset_ms" => nil,
          "ended_at" => nil,
          "duration_ms" => nil
        }.compact
        update do |trace|
          span["start_offset_ms"] = [TaskTrace.epoch_ms(now) - trace.fetch("started_epoch_ms"), 0].max.round(3)
          trace.fetch("spans") << span
        end
        span.fetch("id")
      end

      def finish_span(id, status: "ok")
        now = Time.now.utc
        update do |trace|
          span = trace.fetch("spans").find { |candidate| candidate.fetch("id") == id }
          raise TraceError, "Unknown span: #{id}" unless span
          raise TraceError, "Span is already finished: #{id}" unless span.fetch("status") == "running"

          span["status"] = normalize_status(status)
          span["ended_at"] = now.iso8601(6)
          span["duration_ms"] = [TaskTrace.epoch_ms(now) - trace.fetch("started_epoch_ms") - span.fetch("start_offset_ms"), 0].max.round(3)
        end
      end

      def span(name:, category:, parent_id: nil)
        id = start_span(name: name, category: category, parent_id: parent_id)
        result = yield(id)
        finish_span(id, status: "ok")
        result
      rescue Exception # rubocop:disable Lint/RescueException -- record interrupts before preserving them
        finish_span(id, status: "failed") if id && span_running?(id)
        raise
      end

      def finish(status: "ok")
        now = Time.now.utc
        update do |trace|
          next unless trace.fetch("status") == "running"

          trace.fetch("spans").each do |span|
            next unless span.fetch("status") == "running"

            span["status"] = "interrupted"
            span["ended_at"] = now.iso8601(6)
            span["duration_ms"] = [TaskTrace.epoch_ms(now) - trace.fetch("started_epoch_ms") - span.fetch("start_offset_ms"), 0].max.round(3)
          end
          trace["status"] = normalize_status(status)
          trace["ended_at"] = now.iso8601(6)
          trace["duration_ms"] = [TaskTrace.epoch_ms(now) - trace.fetch("started_epoch_ms"), 0].max.round(3)
        end
        render
      end

      def render
        trace = read
        svg_path = path.sub(/\.json\z/, ".svg")
        svg_path = "#{path}.svg" if svg_path == path
        File.open(svg_path, "w", 0o600) { |file| file.write(svg(trace)) }
        svg_path
      end

      def summary
        trace = read
        duration = effective_duration(trace)
        totals = Hash.new(0.0)
        children = trace.fetch("spans").group_by { |span| span["parent_id"] }
        trace.fetch("spans").each do |span|
          totals[span.fetch("category")] += exclusive_span_duration(span, children.fetch(span.fetch("id"), []), duration)
        end
        observed = covered_duration(trace.fetch("spans"), duration)
        unattributed = [duration - observed, 0].max
        lines = ["#{trace.fetch('name')}: #{format_duration(duration)} (#{trace.fetch('status')})"]
        totals.sort_by { |_category, value| -value }.each do |category, value|
          lines << format("  %-12s %s", category, format_duration(value))
        end
        lines << format("  %-12s %s", "unattributed", format_duration(unattributed))
        lines.join("\n")
      end

      def read
        JSON.parse(File.read(path))
      rescue JSON::ParserError => error
        raise TraceError, "Invalid trace JSON: #{error.message}"
      end

      private

      def update
        lock_path = "#{path}.lock"
        File.open(lock_path, File::RDWR | File::CREAT, 0o600) do |lock|
          lock.flock(File::LOCK_EX)
          trace = read
          yield trace
          TaskTrace.write_json(path, trace)
        ensure
          lock.flock(File::LOCK_UN) rescue nil
        end
      end

      def span_running?(id)
        read.fetch("spans").any? { |span| span.fetch("id") == id && span.fetch("status") == "running" }
      end

      def normalize_category(category)
        candidate = category.to_s
        CATEGORIES.include?(candidate) ? candidate : "other"
      end

      def normalize_status(status)
        candidate = status.to_s
        %w[ok failed interrupted].include?(candidate) ? candidate : "failed"
      end

      def effective_duration(trace)
        trace["duration_ms"] || [TaskTrace.epoch_ms - trace.fetch("started_epoch_ms"), 0].max
      end

      def effective_span_duration(span, trace_duration)
        span["duration_ms"] || [trace_duration - span.fetch("start_offset_ms"), 0].max
      end

      def covered_duration(spans, trace_duration)
        intervals = spans.map { |span| span_interval(span, trace_duration) }
        merged_duration(intervals)
      end

      def exclusive_span_duration(span, child_spans, trace_duration)
        start_ms, finish_ms = span_interval(span, trace_duration)
        child_intervals = child_spans.map do |child|
          child_start, child_finish = span_interval(child, trace_duration)
          [[child_start, start_ms].max, [child_finish, finish_ms].min]
        end.select { |child_start, child_finish| child_finish > child_start }
        [finish_ms - start_ms - merged_duration(child_intervals), 0].max
      end

      def span_interval(span, trace_duration)
        start_ms = [[span.fetch("start_offset_ms"), 0].max, trace_duration].min
        finish_ms = [start_ms + effective_span_duration(span, trace_duration), trace_duration].min
        [start_ms, finish_ms]
      end

      def merged_duration(intervals)
        intervals = intervals.sort_by(&:first)
        intervals.reduce([]) do |merged, interval|
          if merged.empty? || interval.first > merged.last.last
            merged << interval
          else
            merged.last[1] = [merged.last.last, interval.last].max
          end
          merged
        end.sum { |start_ms, finish_ms| finish_ms - start_ms }
      end

      def format_duration(milliseconds)
        seconds = milliseconds.to_f / 1000
        return format("%.0fms", milliseconds) if seconds < 1
        return format("%.2fs", seconds) if seconds < 60

        minutes = (seconds / 60).floor
        format("%dm %.1fs", minutes, seconds - (minutes * 60))
      end

      def svg(trace)
        spans = trace.fetch("spans").sort_by { |span| span.fetch("start_offset_ms") }
        duration = [effective_duration(trace), 1].max
        width = 1100
        label_width = 360
        chart_width = width - label_width - 40
        row_height = 30
        height = 105 + ([spans.length, 1].max * row_height)
        rows = spans.each_with_index.map do |span, index|
          start_ms = span.fetch("start_offset_ms")
          span_duration = effective_span_duration(span, duration)
          x = label_width + ((start_ms / duration) * chart_width)
          bar_width = [((span_duration / duration) * chart_width), 2].max
          y = 75 + (index * row_height)
          full_label = span.fetch("name")
          display_label = full_label.length > 42 ? "#{full_label[0, 39]}..." : full_label
          label = CGI.escapeHTML(display_label)
          title_label = CGI.escapeHTML(full_label)
          timing = CGI.escapeHTML(format_duration(span_duration))
          status = span.fetch("status")
          color = COLORS.fetch(span.fetch("category"), COLORS.fetch("other"))
          status_color = STATUS_COLORS.fetch(status, STATUS_COLORS.fetch("running"))
          stroke = status == "ok" ? "none" : status_color
          timing_label = status == "ok" ? timing : "#{timing} · #{CGI.escapeHTML(status)}"
          estimated_timing_width = timing_label.length * 7
          timing_x = x + bar_width + 6
          timing_anchor = "start"
          timing_class = "timing"
          if timing_x + estimated_timing_width > width - 10
            if bar_width >= estimated_timing_width + 12
              timing_x = x + bar_width - 6
              timing_class = "timing timing-in-bar"
            else
              timing_x = x - 6
            end
            timing_anchor = "end"
          end
          <<~ROW
            <circle cx="12" cy="#{y + 9}" r="4" fill="#{status_color}"/>
            <text x="24" y="#{y + 15}" class="label">#{label}</text>
            <rect x="#{x.round(2)}" y="#{y}" width="#{bar_width.round(2)}" height="18" rx="4" fill="#{color}" stroke="#{stroke}" stroke-width="2">
              <title>#{title_label} — #{timing} — #{CGI.escapeHTML(status)} — #{CGI.escapeHTML(span.fetch('category'))}</title>
            </rect>
            <text x="#{timing_x.round(2)}" y="#{y + 14}" text-anchor="#{timing_anchor}" class="#{timing_class}">#{timing_label}</text>
          ROW
        end.join
        <<~SVG
          <svg xmlns="http://www.w3.org/2000/svg" width="#{width}" height="#{height}" viewBox="0 0 #{width} #{height}" role="img" aria-labelledby="title description">
            <title id="title">#{CGI.escapeHTML(trace.fetch('name'))} task timeline</title>
            <desc id="description">Observable task spans over #{CGI.escapeHTML(format_duration(duration))}; status #{CGI.escapeHTML(trace.fetch('status'))}.</desc>
            <style>
              .title { font: 600 18px ui-sans-serif, system-ui, sans-serif; fill: #0f172a; }
              .meta, .label, .timing { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #334155; }
              .timing { font-size: 11px; }
              .timing-in-bar { fill: #fff; font-weight: 600; }
              .axis { stroke: #cbd5e1; stroke-width: 1; }
            </style>
            <rect width="100%" height="100%" fill="#f8fafc"/>
            <text x="12" y="27" class="title">#{CGI.escapeHTML(trace.fetch('name'))}</text>
            <text x="12" y="49" class="meta">Total #{CGI.escapeHTML(format_duration(duration))} · #{CGI.escapeHTML(trace.fetch('status'))} · observable spans only</text>
            <line x1="#{label_width}" y1="62" x2="#{label_width + chart_width}" y2="62" class="axis"/>
            <text x="#{label_width}" y="59" class="timing">0</text>
            <text x="#{width - 40}" y="59" text-anchor="end" class="timing">#{CGI.escapeHTML(format_duration(duration))}</text>
            #{rows}
          </svg>
        SVG
      end
    end
  end
end
