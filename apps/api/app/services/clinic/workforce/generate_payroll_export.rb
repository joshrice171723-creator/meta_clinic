require "csv"
require "digest"

module Clinic
  module Workforce
    class GeneratePayrollExport
      FIELDS = %w[employee_id work_date location_code regular_hours overtime_hours paid_hours].freeze
      DEFAULT_COLUMNS = FIELDS.map { |field| { "field" => field, "header" => field } }.freeze

      def self.validate_mapping!(columns, identifiers)
        raise ArgumentError, "Choose between one and six export columns" unless columns.is_a?(Array) && columns.length.between?(1, 6)
        fields = columns.map { |column| column.is_a?(Hash) && column["field"] }
        headers = columns.map { |column| column.is_a?(Hash) && column["header"].to_s.strip }
        unless fields.all? { |field| FIELDS.include?(field) } && fields.uniq.length == fields.length && fields.include?("employee_id")
          raise ArgumentError, "Export fields must be unique supported fields and include Employee ID"
        end
        unless headers.all? { |header| header.present? && header.length <= 80 && !header.match?(/[\r\n\x00]/) } && headers.uniq.length == headers.length
          raise ArgumentError, "Use distinct column headings of 1–80 characters"
        end
        unless identifiers.is_a?(Hash) && identifiers.size <= 2000 && identifiers.all? { |key, value| key.to_s.match?(/\A\d+\z/) && value.is_a?(String) && value.strip.length.between?(1, 100) && !value.match?(/[\r\n\x00]/) }
          raise ArgumentError, "Payroll identifiers must map employees to nonempty IDs of at most 100 characters"
        end
        unless identifiers.values.map(&:strip).uniq.length == identifiers.length
          raise ArgumentError, "Each employee needs a distinct payroll identifier"
        end
      end

      def self.call(practice:, actor:, configuration:, timecard_ids:, request_key:, supersedes_batch_id: nil, preview: false)
        new(practice, actor, configuration, timecard_ids, request_key, supersedes_batch_id).call(preview: preview)
      end

      def initialize(practice, actor, configuration, ids, request_key, supersedes)
        @practice, @actor, @configuration = practice, actor, configuration
        @ids = Array(ids).map { |id| Integer(id.to_s, 10) }.uniq.sort
        raise ArgumentError, "Select 1–250 approved timecards" unless @ids.length.between?(1, 250)
        @request_key = request_key.to_s
        raise ArgumentError, "A retry key of 8–100 characters is required" unless @request_key.length.between?(8, 100)
        @supersedes = supersedes.present? ? Integer(supersedes.to_s, 10) : nil
      end

      def call(preview:)
        Access.new(actor: @actor, practice: @practice).authorize!("workforce.payroll.export", site: @configuration.site)
        raise ArgumentError, "The payroll configuration belongs to another practice" unless @configuration.practice_id == @practice.id
        raise ArgumentError, "This payroll configuration is not effective yet" if @configuration.effective_from > Current.business_time
        settings = EffectiveSettings.call(practice: @practice, site: @configuration.site)
        raise ArgumentError, "Payroll exports are disabled for this location" unless settings[:values]["payroll_export_enabled"] == true
        self.class.validate_mapping!(@configuration.columns, @configuration.employee_identifiers)
        payload_digest = Digest::SHA256.hexdigest([@configuration.id, @ids, @supersedes].to_json)
        ExportBatch.transaction do
          # Serialize export/correction decisions for the same practice without mutating history.
          @practice.lock!
          existing = ExportBatch.find_by(practice_id: @practice.id, request_key: @request_key)
          if existing
            raise ArgumentError, "That retry key belongs to a different export" unless existing.payload_digest == payload_digest
            return preview ? { rows: existing.rows, totals: existing.totals, source_versions: existing.source_versions,
              source_digest: existing.source_digest } : existing
          end
          previous = @supersedes && ExportBatch.find_by!(practice_id: @practice.id, site_id: @configuration.site_id, id: @supersedes)
          if previous && ExportBatch.where(practice_id: @practice.id, supersedes_batch_id: previous.id).exists?
            raise ArgumentError, "This export already has a correction. Correct its latest saved export instead."
          end
          selected = TimecardVersion.where(practice_id: @practice.id, id: @ids)
          Employment.where(practice_id: @practice.id, id: selected.select(:employment_id)).order(:id).lock.load
          cards = selected.order(:id).lock.to_a
          raise ArgumentError, "One or more timecards are unavailable" unless cards.length == @ids.length
          validate_export_population!(cards, previous)
          rows = cards.flat_map { |card| rows_for(card) }
          raise ArgumentError, "These timecards contain no hours for this location" if rows.empty?
          sources = cards.map { |card| { id: card.id.to_s, employment_id: card.employment_id.to_s, source_digest: card.source_digest } }
          totals = %w[regular_hours overtime_hours paid_hours].to_h { |field| [field, rows.sum { |row| BigDecimal(row.fetch(field)) }.to_s("F")] }
          content = CSV.generate(row_sep: "\r\n", force_quotes: true) do |csv|
            csv << @configuration.columns.map { |column| safe_cell(column.fetch("header")) }
            rows.each { |row| csv << @configuration.columns.map { |column| safe_cell(row.fetch(column.fetch("field"))) } }
          end
          data = { rows: rows, totals: totals, source_versions: sources, source_digest: Digest::SHA256.hexdigest(content) }
          return data if preview
          batch = ExportBatch.create!(**data, practice: @practice, site: @configuration.site, configuration_version: @configuration,
            created_by_membership: @practice.memberships.find_by!(user_id: @actor.id, active: true), request_key: @request_key,
            payload_digest: payload_digest, csv_content: content, supersedes_batch: previous)
          Clinic::AuditRecorder.record!(practice: @practice, actor: @actor, action_code: "workforce.payroll.export", outcome: :committed, resource_version_ref: "workforce_export:#{batch.id}")
          batch
        end
      end

      private

      def validate_export_population!(cards, previous)
        population = cards.map { |card| [ card.employment_id, card.period_start, card.period_end ] }
        raise ArgumentError, "Select one timecard revision per employee and workweek" unless population.uniq.length == cards.length

        lineage_ids = []
        if previous
          original_ids = previous.source_versions.map { |source| source.fetch("id") }
          original = TimecardVersion.where(practice_id: @practice.id, id: original_ids)
            .pluck(:employment_id, :period_start, :period_end)
          unless original.length == original_ids.length && original.sort == population.sort
            raise ArgumentError, "A correction must cover the same employees and workweeks as the saved export"
          end
          ancestor = previous
          while ancestor
            lineage_ids << ancestor.id
            ancestor = ancestor.supersedes_batch
          end
        end

        exported_ids = ExportBatch.where(practice_id: @practice.id, site_id: @configuration.site_id)
          .where.not(id: lineage_ids).pluck(:source_versions).flatten.map { |source| source.fetch("id") }.uniq
        exported_population = TimecardVersion.where(practice_id: @practice.id, id: exported_ids)
          .pluck(:employment_id, :period_start, :period_end)
        if (population & exported_population).any?
          raise ArgumentError, "A selected employee's workweek was already exported. Download its saved file or explicitly correct the previous export."
        end
      end

      def rows_for(card)
        raise ArgumentError, "Only approved, resolved timecards can be exported" unless card.status == "approved" && card.unresolved_exceptions.blank?
        current_digest = CalculateTimecard.current_source_digest(employment: card.employment, period_start: card.period_start)
        raise ArgumentError, "Recorded hours changed; recalculate and approve the timecard before export" unless card.source_digest == current_digest
        if TimecardVersion.where(practice_id: @practice.id, employment_id: card.employment_id, period_start: card.period_start).where("version_number > ?", card.version_number).exists?
          raise ArgumentError, "A selected timecard has a newer revision; review it before export"
        end
        payroll_id = @configuration.employee_identifiers[card.employment_id.to_s]
        raise ArgumentError, "Set a payroll identifier for every selected employee" if payroll_id.blank?
        card.snapshot.fetch("segments", []).filter_map do |segment|
          next unless segment.fetch("site_id").to_s == @configuration.site_id.to_s
          raise ArgumentError, "Resolve overtime rules before exporting hours" if segment["overtime_minutes"].nil?
          raise ArgumentError, "Resolve timecard exceptions before exporting" if Array(segment["exception_codes"]).any?
          {
            "employee_id" => payroll_id, "work_date" => segment.fetch("local_date"), "location_code" => @configuration.site.code,
            "regular_hours" => hours(segment.fetch("regular_minutes")), "overtime_hours" => hours(segment.fetch("overtime_minutes")),
            "paid_hours" => hours(segment.fetch("paid_minutes"))
          }
        end.tap do |rows|
          raise ArgumentError, "A selected timecard contains no hours for this location" if rows.empty?
        end
      end

      def hours(minutes)
        (BigDecimal(minutes.to_s) / 60).round(6).to_s("F")
      end

      def safe_cell(value)
        text = value.to_s
        text.match?(/\A[\s\x00-\x1f]*[=+\-@]/) ? "'#{text}" : text
      end
    end
  end
end
