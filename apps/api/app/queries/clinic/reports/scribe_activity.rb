module Clinic
  module Reports
    class ScribeActivity
      def self.call(practice:, actor:, page: 1, per_page: 25)
        Clinic::Authorization.authorize!(actor:, practice:, action: "scribe.read", any_site: true)
        ability = Ability.new(actor, practice:)
        encounters = practice.scribe_encounters.accessible_by(ability, :read).where(deleted_at: nil)
        encounter_ids = encounters.select(:id)
        documents = Clinic::Scribe::Document.where(practice:, encounter_id: encounter_ids, status: "active")
        drafts = Clinic::Scribe::Draft.where(practice:, encounter_id: encounter_ids, id: documents.select(:current_draft_id))
        sources = Clinic::Scribe::Source.where(practice:, encounter_id: encounter_ids)
        recordings = Clinic::Scribe::Recording.where(practice:, encounter_id: encounter_ids)
        recovery_items, recovery_pagination = recovery_page(
          recordings: recordings.where(status: %w[recording interrupted]),
          sources: sources.where(status: "incomplete"), page:, per_page:)
        Clinic::AuditRecorder.record!(practice:, actor:, action_code: "scribe.read", outcome: :released)
        {
          source: "current_scribe_documents_sources_recordings", as_of: Time.current.iso8601(6),
          scope: "authorized_non_deleted_encounters", provider: "openrouter",
          provider_configured: Clinic::Scribe::OpenRouter.configured?, provider_verified: false,
          current_draft_counts: drafts.group(:status).count,
          source_counts: sources.group(:status).count,
          recording_counts: recordings.group(:status).count,
          documents_without_draft: documents.where(current_draft_id: nil).count,
          latest_recording_update_at: recordings.maximum(:updated_at)&.iso8601(6),
          recovery_items:, recovery_pagination:
        }
      end

      def self.recovery_page(recordings:, sources:, page:, per_page:)
        page = Integer(page)
        per_page = Integer(per_page)
        raise ArgumentError, "Choose a valid recovery page." unless page.between?(1, 100_000)
        raise ArgumentError, "Choose 1 to 50 recovery records per page." unless per_page.between?(1, 50)

        total = recordings.count + sources.count
        total_pages = (total.to_f / per_page).ceil
        page = [ page, [ total_pages, 1 ].max ].min
        recording_rows = recordings.select(Arel.sql("'recording' AS record_type"), :id, :encounter_id, :status, :updated_at)
        source_rows = sources.select(Arel.sql("'source' AS record_type"), :id, :encounter_id, :status, :updated_at)
        sql = <<~SQL
          SELECT * FROM (#{recording_rows.to_sql} UNION ALL #{source_rows.to_sql}) AS recovery_items
          ORDER BY updated_at DESC, id DESC, record_type ASC
          LIMIT #{per_page} OFFSET #{(page - 1) * per_page}
        SQL
        items = ApplicationRecord.connection.select_all(sql).cast_values.map do |record_type, id, encounter_id, status, updated_at|
          { record_type:, id:, encounter_id:, status:, updated_at: updated_at.iso8601(6) }
        end
        [ items, { page:, per_page:, total:, total_pages: } ]
      end
      private_class_method :recovery_page
    end
  end
end
