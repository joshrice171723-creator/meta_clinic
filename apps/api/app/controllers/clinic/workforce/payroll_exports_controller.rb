module Clinic
  module Workforce
    class PayrollExportsController < BaseController
      rescue_from KeyError do
        render json: { error: "Complete the required payroll configuration fields", code: "invalid_request" }, status: :unprocessable_entity
      end

      def index
        site = payroll_site
        exporter = workforce_access.allow?("workforce.payroll.export", site: site)
        configurator = workforce_access.allow?("workforce.payroll.configure", site: site)
        workforce_access.authorize!("workforce.payroll.configure", site: site) unless exporter
        correction_batch = nil
        if params[:correction_batch_id].present?
          workforce_access.authorize!("workforce.payroll.export", site: site)
          correction_batch = ExportBatch.find_by!(practice: current_practice, site: site,
            id: requested_id!(params[:correction_batch_id], :correction_batch_id))
        end
        period_start = if params[:period_start].present?
          value = params[:period_start].to_s
          parsed = Date.iso8601(value)
          raise ArgumentError, "period_start must be an ISO date" unless parsed.iso8601 == value

          parsed
        end
        raise ArgumentError, "Choose either a correction export or a workweek" if correction_batch && period_start
        configurations = PayrollConfigurationVersion.where(practice: current_practice, site: site).order(revision: :desc).limit(25)
        batches = ExportBatch.where(practice: current_practice, site: site).order(id: :desc)
        if params[:before_batch_id].present?
          batches = batches.where("id < ?", requested_id!(params[:before_batch_id], :before_batch_id))
        end
        batches = batches.limit(51)
        batches = exporter ? batches.to_a : []
        more_batches = batches.length > 50
        batches = batches.first(50)
        context = batch_context(batches)
        employee_ids = EmploymentSite.where(practice: current_practice, site: site).select(:employment_id)
        employees = Employment.where(practice: current_practice, id: employee_ids).includes(:staff_member).order(:id)
        cards = TimecardVersion.where(practice: current_practice, employment_id: employees.select(:id), status: "approved")
          .joins(:time_segments).where(clinic_workforce_time_segments: { site_id: site.id }).distinct
          .where(<<~SQL)
            NOT EXISTS (
              SELECT 1 FROM clinic_workforce_timecard_versions newer
              WHERE newer.practice_id = clinic_workforce_timecard_versions.practice_id
                AND newer.employment_id = clinic_workforce_timecard_versions.employment_id
                AND newer.period_start = clinic_workforce_timecard_versions.period_start
                AND newer.version_number > clinic_workforce_timecard_versions.version_number
            )
          SQL
          .order(period_start: :desc, id: :desc)
        cards = cards.where(period_start: period_start) if period_start
        if correction_batch
          source_periods = TimecardVersion.where(practice: current_practice,
            id: correction_batch.source_versions.map { |source| source.fetch("id") })
            .pluck(:employment_id, :period_start, :period_end)
          cards = if source_periods.empty?
            cards.none
          else
            conditions = source_periods.map do
              "(clinic_workforce_timecard_versions.employment_id = ? AND clinic_workforce_timecard_versions.period_start = ? AND clinic_workforce_timecard_versions.period_end = ?)"
            end
            cards.where(conditions.join(" OR "), *source_periods.flatten)
          end
        end
        # ponytail: one candidate page is capped at 250; add paging when a workweek exceeds this file limit.
        cards = exporter ? cards.limit(correction_batch ? 250 : 251).to_a : []
        timecards_truncated = correction_batch.nil? && cards.length > 250
        cards = cards.first(250)
        Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user, action_code: "workforce.payroll.export", outcome: :released)
        render json: { configurations: configurations.map { |configuration| configuration_json(configuration) },
          batches: batches.map { |batch| batch_json(batch, context: context) },
          next_batch_before_id: more_batches ? batches.last.id.to_s : nil, fields: GeneratePayrollExport::FIELDS,
          permissions: { configure: configurator, export: exporter },
          default_columns: GeneratePayrollExport::DEFAULT_COLUMNS,
          employees: employees.map { |employee| { id: employee.id.to_s, name: employee.staff_member.display_name } },
          timecards_truncated: timecards_truncated,
          timecards: cards.map { |card| { id: card.id.to_s, employment_id: card.employment_id.to_s, period_start: card.period_start, period_end: card.period_end, version: card.version_number } } }
      end

      def configure
        site = payroll_site
        workforce_access.authorize!("workforce.payroll.configure", site: site)
        input = params.require(:configuration).permit(:name, :effective_from, :expected_revision, columns: [:field, :header], employee_identifiers: {}).to_h
        columns, identifiers = input.fetch("columns"), input.fetch("employee_identifiers", {})
        GeneratePayrollExport.validate_mapping!(columns, identifiers)
        effective_from = Time.iso8601(input.fetch("effective_from"))
        configuration = PayrollConfigurationVersion.transaction do
          site.lock!
          latest = PayrollConfigurationVersion.where(practice: current_practice, site: site).maximum(:revision).to_i
          raise ArgumentError, "Payroll settings changed; reload before saving" unless latest == input.fetch("expected_revision").to_i
          eligible = EmploymentSite.where(practice: current_practice, site: site, employment_id: identifiers.keys).distinct.count(:employment_id)
          raise ArgumentError, "Payroll identifiers include employees outside this location" unless eligible == identifiers.keys.length
          PayrollConfigurationVersion.create!(practice: current_practice, site: site, created_by_membership: clinic_membership,
            name: input.fetch("name"), effective_from: effective_from, revision: latest + 1, columns: columns, employee_identifiers: identifiers)
        end
        render json: { configuration: configuration_json(configuration) }, status: :created
      end

      def preview
        render json: generate(preview: true)
      end

      def create
        batch = generate(preview: false)
        render json: { batch: batch_json(batch) }, status: :created
      end

      def download
        batch = ExportBatch.find_by!(practice: current_practice, id: requested_id!(params[:id], :id))
        workforce_access.authorize!("workforce.payroll.export", site: batch.site)
        Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user, action_code: "workforce.payroll.export", outcome: :released, resource_version_ref: "workforce_export:#{batch.id}")
        if params[:response_format] == "json"
          render json: { filename: "workforce-hours-#{batch.id}.csv", content_type: "text/csv; charset=utf-8", content: batch.csv_content }
        else
          send_data batch.csv_content, type: "text/csv; charset=utf-8", filename: "workforce-hours-#{batch.id}.csv", disposition: "attachment"
        end
      end

      private

      def payroll_site
        current_practice.sites.find(requested_id!(params[:site_id], :site_id))
      end

      def generate(preview:)
        configuration = PayrollConfigurationVersion.find_by!(practice: current_practice, id: requested_id!(params[:configuration_version_id], :configuration_version_id))
        GeneratePayrollExport.call(practice: current_practice, actor: current_user, configuration: configuration,
          timecard_ids: params[:timecard_version_ids], request_key: params[:idempotency_key], supersedes_batch_id: params[:supersedes_batch_id], preview: preview)
      end

      def configuration_json(configuration)
        { id: configuration.id.to_s, site_id: configuration.site_id.to_s, revision: configuration.revision, name: configuration.name,
          effective_from: configuration.effective_from, provider: configuration.provider, columns: configuration.columns, employee_identifiers: configuration.employee_identifiers }
      end

      def batch_context(batches)
        successors = ExportBatch.where(practice: current_practice, site_id: batches.map(&:site_id), supersedes_batch_id: batches.map(&:id))
          .pluck(:supersedes_batch_id, :id).to_h
        source_ids = batches.flat_map { |batch| batch.source_versions.map { |source| source.fetch("id") } }.uniq
        periods = TimecardVersion.where(practice: current_practice, id: source_ids)
          .pluck(:id, :employment_id, :period_start, :period_end).to_h do |id, employment_id, period_start, period_end|
            [ id.to_s, { employment_id: employment_id.to_s, period_start: period_start.iso8601, period_end: period_end.iso8601 } ]
          end
        { successors: successors, periods: periods }
      end

      def batch_json(batch, context: nil)
        context ||= batch_context([ batch ])
        source_periods = batch.source_versions.filter_map { |source| context.fetch(:periods)[source.fetch("id").to_s] }.uniq
        { id: batch.id.to_s, site_id: batch.site_id.to_s, created_at: batch.created_at, configuration_version_id: batch.configuration_version_id.to_s,
          source_digest: batch.source_digest, source_versions: batch.source_versions, totals: batch.totals, row_count: batch.rows.length,
          supersedes_batch_id: batch.supersedes_batch_id&.to_s, superseded_by_batch_id: context.fetch(:successors)[batch.id]&.to_s,
          source_periods: source_periods, download_url: "/api/clinic/workforce/payroll-exports/#{batch.id}/download" }
      end
    end
  end
end
