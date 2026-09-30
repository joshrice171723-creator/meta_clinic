require "digest"

module Clinic
  module Reports
    class IssueExport
      SERIALIZER_REVISION = 2

      # The HTTP owner supplies the outer repeatable-read transaction and the
      # existing membership-generation lock. This method never releases bytes.
      def self.call(practice:, actor:, report_id:, filters:, request_key:, scope: nil)
        raise ArgumentError, "The request key is invalid." unless request_key.to_s.match?(Clinic::Idempotency::KEY_PATTERN)

        complete = scope == ExportSource::COMPLETE_SCOPE
        unless scope.nil? || complete || scope == "summaries_and_selected_source_pages"
          raise ArgumentError, "Unsupported export scope."
        end
        filters = complete ? ExportSource.normalize_complete(report_id, filters) : ExportSource.normalize(report_id, filters)
        ExportSource.authorize!(practice:, actor:, report_id:, filters:)
        existing = Clinic::ReportExport.find_by(practice:, issued_by: actor, request_key:)
        if existing
          saved_complete = existing.snapshot["export_scope"] == ExportSource::COMPLETE_SCOPE
          unless existing.report_id == report_id && existing.filters == filters && saved_complete == complete
            raise Clinic::Idempotency::Conflict
          end

          return existing
        end
        raise ArgumentError, "New exports must explicitly request all_filtered_rows." unless complete
        if ::Development::DemoLesson.exists?(practice_id: practice.id)
          raise ArgumentError, "Durable export issuance is unavailable in resettable lesson clinics."
        end
        raise ArgumentError, "Export issuance requires its snapshot transaction." unless ApplicationRecord.connection.transaction_open? &&
          ApplicationRecord.connection.select_value("SHOW transaction_isolation") == "repeatable read"

        database_snapshot = ApplicationRecord.connection.select_value("SELECT pg_current_snapshot()::text")
        business_time = Current.business_time
        snapshot = Current.set(business_time_snapshot: business_time) do
          ExportSource.capture(practice:, actor:, report_id:, filters:)
        end
        snapshot["business_time"] = business_time.iso8601(6)
        snapshot["database_snapshot"] = database_snapshot
        snapshot["consistency"] = "repeatable_read"
        issued_at = Time.current
        provenance = { "report_id" => report_id, "filters" => filters,
          "serializer_revision" => SERIALIZER_REVISION, "snapshot" => snapshot }
        source_json = JSON.generate(canonical(provenance))
        if source_json.bytesize > ExportSource::MAX_SNAPSHOT_BYTES
          raise ExportSource::LimitExceeded, "The complete source snapshot exceeds the 4 MB technical limit. No artifact was issued."
        end
        source_digest = Digest::SHA256.hexdigest(source_json)
        artifact = ExportCsv.call(report_id:, snapshot:, filters:, actor_id: actor.id, request_key:,
          issued_at:, source_digest:, serializer_revision: SERIALIZER_REVISION)
        raise ExportSource::LimitExceeded, "The complete CSV exceeds the 2 MB technical limit. No artifact was issued." if artifact.bytesize > ExportSource::MAX_ARTIFACT_BYTES

        export = Clinic::ReportExport.create!(practice:, issued_by: actor,
          site_id: filters["site_id"], report_id:, request_key:, filters:, snapshot:,
          source_digest:, serializer_revision: SERIALIZER_REVISION,
          artifact_digest: Digest::SHA256.hexdigest(artifact), artifact_csv: artifact,
          artifact_bytes: artifact.bytesize, issued_at:,
          filename: "#{report_id}-clinic-#{practice.id}-#{SecureRandom.uuid}.csv")
        Clinic::AuditRecorder.record!(practice:, actor:, action_code: "reports.export.issue",
          outcome: :committed, resource_version_ref: "report_export:#{export.id}:#{export.artifact_digest}")
        export
      end

      def self.canonical(value)
        case value
        when Hash then value.keys.sort.to_h { |key| [key, canonical(value.fetch(key))] }
        when Array then value.map { |item| canonical(item) }
        else value
        end
      end
      private_class_method :canonical
    end
  end
end
