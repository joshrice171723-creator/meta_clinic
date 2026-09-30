module Clinic
  module Reports
    class ExportsController < Clinic::ApiController
      before_action -> { response.headers["Cache-Control"] = "no-store" }

      rescue_from ExportSource::LimitExceeded do |error|
        render json: { error: error.message, code: "export_limit_exceeded", limits: ExportSource.resource_limits }, status: :unprocessable_entity
      end

      rescue_from ExportSource::CaptureMismatch do |error|
        render json: { error: error.message, code: "export_capture_mismatch" }, status: :conflict
      end

      rescue_from ActiveRecord::QueryCanceled, ActiveRecord::LockWaitTimeout do
        render json: { error: "The complete export exceeded its database time limit. No artifact was issued. Retry explicitly later or narrow the report filters.",
          code: "export_limit_exceeded", limits: ExportSource.resource_limits }, status: :unprocessable_entity
      end

      def create
        input = params.require(:export)
        raise ArgumentError, "Export request must be an object." unless input.is_a?(ActionController::Parameters)
        raise ArgumentError, "Unsupported export request fields." unless (input.keys - %w[report_id filters request_key scope]).empty?
        report_id = required_string!(input[:report_id], field: :report_id, maximum: 80)
        filters = input[:filters]
        raise ArgumentError, "Export filters must be an object." unless filters.is_a?(ActionController::Parameters)

        scope = input[:scope].nil? ? nil : required_string!(input[:scope], field: :scope, maximum: 80)
        export = IssueExport.call(practice: current_practice, actor: current_user, report_id:,
          filters: filters.to_unsafe_h, scope:,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160))
        recovered = !export.previously_new_record?
        audit!(recovered ? "reports.export.recovery" : "reports.export.receipt", :released, export)
        render json: { export: receipt(export), recovered: }, status: recovered ? :ok : :created
      end

      def index
        report_id = required_string!(params[:report_id], field: :report_id, maximum: 80)
        input = params.permit(:date, :site_id, :page, :payment_page, :refund_page, :office_page, :status).to_h
        # Semantic-filter history includes preserved page receipts. Supplying
        # legacy page filters still permits exact old receipt lookup.
        filters = if (input.keys & ExportSource::PAGES.fetch(report_id) { [] }).any?
          ExportSource.normalize(report_id, input)
        else
          ExportSource.normalize_complete(report_id, input)
        end
        ExportSource.authorize!(practice: current_practice, actor: current_user, report_id:, filters:)
        scope = Clinic::ReportExport.where(practice: current_practice, issued_by: current_user, report_id:)
          .where("filters @> ?::jsonb", JSON.generate(filters))
        if params[:request_key].present?
          key = required_string!(params[:request_key], field: :request_key, maximum: 160)
          raise ArgumentError, "The request key is invalid." unless key.match?(Clinic::Idempotency::KEY_PATTERN)

          scope = scope.where(request_key: key)
        end
        scope = scope.where("id < ?", requested_id!(params[:before_id], :before_id)) if params[:before_id].present?
        metadata_fields = %w[as_of timezone definition pagination payment_pagination refund_pagination
          office_pagination export_scope row_counts resource_limits coverage_revision database_snapshot]
        projection = metadata_fields.map { |name| "'#{name}', snapshot->'#{name}'" }.join(", ")
        # History releases metadata only; do not hydrate up to 21 full artifacts
        # and complete detail snapshots merely to display their receipts.
        exports = scope.select(:id, :practice_id, :issued_by_id, :site_id, :report_id, :request_key,
          :filters, :issued_at, :serializer_revision, :source_digest, :artifact_digest, :artifact_bytes,
          :filename, Arel.sql("jsonb_strip_nulls(jsonb_build_object(#{projection})) AS snapshot"))
          .order(id: :desc).limit(21).to_a
        more = exports.length > 20
        exports = exports.first(20)
        audit!("reports.export.history", :released)
        render json: { exports: exports.map { |export| receipt(export) }, next_before_id: more ? exports.last.id : nil }
      end

      def show
        export = owned_export
        audit!("reports.export.receipt", :released, export)
        render json: { export: receipt(export), source_snapshot: export.snapshot }
      end

      def download
        export = owned_export
        unless Digest::SHA256.hexdigest(export.artifact_csv) == export.artifact_digest && export.artifact_csv.bytesize == export.artifact_bytes
          raise Clinic::AuditRecorder::Unavailable
        end
        audit!("reports.export.download", :released, export)
        # The shared authenticated api client validates response ownership and
        # the browser checks the digest before handing these exact bytes to Blob.
        render json: { export: receipt(export), artifact_csv: export.artifact_csv }
      end

      private

      def attribute_clinic_mutation(operation)
        retries = 0
        begin
          ApplicationRecord.transaction(isolation: :repeatable_read) do
            ApplicationRecord.connection.execute("SET LOCAL statement_timeout = '#{ExportSource::MAX_QUERY_MS}ms'")
            ApplicationRecord.connection.execute("SET LOCAL lock_timeout = '#{ExportSource::MAX_LOCK_WAIT_MS}ms'")
            super(operation)
          end
        rescue ActiveRecord::SerializationFailure, ActiveRecord::RecordNotUnique
          # A failure at commit must not leave the uncommitted rendered receipt
          # attached to the response before retrying in a new snapshot.
          self.response_body = nil
          retries += 1
          retry if retries == 1
          raise Clinic::Idempotency::OutcomeUnconfirmed
        end
      end

      def owned_export
        export = Clinic::ReportExport.find_by!(id: requested_id!(params[:id], :id),
          practice: current_practice, issued_by: current_user)
        ExportSource.authorize!(practice: current_practice, actor: current_user,
          report_id: export.report_id, filters: export.filters)
        export
      end

      def audit!(action, outcome, export = nil)
        Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
          action_code: action, outcome:,
          resource_version_ref: export && "report_export:#{export.id}:#{export.artifact_digest}")
      end

      def receipt(export)
        { id: export.id, report_id: export.report_id, practice_id: export.practice_id,
          request_key: export.request_key, site_id: export.site_id, filters: export.filters, issued_by_user_id: export.issued_by_id,
          issued_at: export.issued_at.iso8601(6), as_of: export.snapshot.fetch("as_of"),
          timezone: export.snapshot.fetch("timezone"), definition: export.snapshot.fetch("definition"),
          source_pages: export.snapshot["export_scope"] == ExportSource::COMPLETE_SCOPE ? {} :
            export.snapshot.slice("pagination", "payment_pagination", "refund_pagination", "office_pagination"),
          row_counts: export.snapshot.fetch("row_counts", {}),
          resource_limits: export.snapshot["resource_limits"],
          coverage_revision: export.snapshot.fetch("coverage_revision", 1),
          database_snapshot: export.snapshot.fetch("database_snapshot"),
          serializer_revision: export.serializer_revision, source_digest: export.source_digest,
          artifact_digest: export.artifact_digest, artifact_bytes: export.artifact_bytes,
          filename: export.filename, scope: export.snapshot.fetch("export_scope", "summaries_and_selected_source_pages"),
          download_url: "/api/clinic/report_exports/#{export.id}/download" }
      end
    end
  end
end
