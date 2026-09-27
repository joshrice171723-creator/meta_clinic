module Clinic
  module Reports
    class ScribeActivity
      def self.call(practice:, actor:)
        Clinic::Authorization.authorize!(actor:, practice:, action: "scribe.read", any_site: true)
        ability = Ability.new(actor, practice:)
        encounters = practice.scribe_encounters.accessible_by(ability, :read).where(deleted_at: nil)
        encounter_ids = encounters.select(:id)
        documents = Clinic::Scribe::Document.where(practice:, encounter_id: encounter_ids, status: "active")
        drafts = Clinic::Scribe::Draft.where(practice:, encounter_id: encounter_ids, id: documents.select(:current_draft_id))
        sources = Clinic::Scribe::Source.where(practice:, encounter_id: encounter_ids)
        recordings = Clinic::Scribe::Recording.where(practice:, encounter_id: encounter_ids)
        Clinic::AuditRecorder.record!(practice:, actor:, action_code: "scribe.read", outcome: :released)
        {
          source: "current_scribe_documents_sources_recordings", as_of: Time.current.iso8601(6),
          scope: "authorized_non_deleted_encounters", provider: "openrouter",
          provider_configured: Clinic::Scribe::OpenRouter.configured?, provider_verified: false,
          current_draft_counts: drafts.group(:status).count,
          source_counts: sources.group(:status).count,
          recording_counts: recordings.group(:status).count,
          documents_without_draft: documents.where(current_draft_id: nil).count,
          latest_recording_update_at: recordings.maximum(:updated_at)&.iso8601(6)
        }
      end
    end
  end
end
