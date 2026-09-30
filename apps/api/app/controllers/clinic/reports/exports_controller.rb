module Clinic
  module Reports
    class ExportsController < Clinic::ApiController
      before_action -> { response.headers["Cache-Control"] = "no-store" }

      def create
        input = params.require(:export)
        raise ArgumentError, "Export request must be an object." unless input.is_a?(ActionController::Parameters)
        raise ArgumentError, "Unsupported export request fields." unless (input.keys - %w[report_id filters request_key]).empty?
        report_id = required_string!(input[:report_id], field: :report_id, maximum: 80)
        filters = input[:filters]
        raise ArgumentError, "Export filters must be an object." unless filters.is_a?(ActionController::Parameters)

        export = IssueExport.call(practice: current_practice, actor: current_user, report_id:,
          filters: filters.to_unsafe_h,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160))
        recovered = !export.previously_new_record?
        audit!(recovered ? "reports.export.recovery" : "reports.export.receipt", :released, export)
        render json: { export: receipt(export), recovered: }, status: recovered ? :ok : :created
      end

      def index
        report_id = required_string!(params[:report_id], field: :report_id, maximum: 80)
        filters = ExportSource.normalize(report_id, params.permit(:date, :site_id, :page,
          :payment_page, :refund_page, :office_page, :status).to_h)
        ExportSource.authorize!(practice: current_practice, actor: current_user, report_id:, filters:)
        scope = Clinic::ReportExport.where(practice: current_practice, issued_by: current_user, report_id:, filters:)
        if params[:request_key].present?
          key = required_string!(params[:request_key], field: :request_key, maximum: 160)
          raise ArgumentError, "The request key is invalid." unless key.match?(Clinic::Idempotency::KEY_PATTERN)

          scope = scope.where(request_key: key)
        end
        scope = scope.where("id < ?", requested_id!(params[:before_id], :before_id)) if params[:before_id].present?
        exports = scope.order(id: :desc).limit(21).to_a
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
          ApplicationRecord.transaction(isolation: :repeatable_read) { super(operation) }
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
          source_pages: export.snapshot.slice("pagination", "payment_pagination", "refund_pagination", "office_pagination"),
          database_snapshot: export.snapshot.fetch("database_snapshot"),
          serializer_revision: export.serializer_revision, source_digest: export.source_digest,
          artifact_digest: export.artifact_digest, artifact_bytes: export.artifact_bytes,
          filename: export.filename, scope: "summaries_and_selected_source_pages",
          download_url: "/api/clinic/report_exports/#{export.id}/download" }
      end
    end
  end
end
