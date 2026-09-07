module Clinic
  module Scribe
    class Export < ApplicationRecord
      self.table_name = "clinic_scribe_exports"
      include TenantScoped
      include Auditable

      belongs_to :draft, class_name: "Clinic::Scribe::Draft"
      belongs_to :actor, class_name: "User"
      belongs_to :encounter_note, class_name: "Clinic::EncounterNote", optional: true
      belongs_to :encounter_note_revision, class_name: "Clinic::EncounterNoteRevision", optional: true

      validates :destination, inclusion: { in: %w[parent_record_adapter] }
      validates :status, inclusion: { in: %w[exported failed] }
      validates :version_checksum, :idempotency_key, :payload_digest, presence: true
      validate :draft_belongs_to_practice
      validate :chart_record_links_are_consistent

      def chart_written?
        encounter_note_id.present? && encounter_note_revision_id.present?
      end

      private

      def draft_belongs_to_practice
        errors.add(:draft, "must belong to the selected practice") if draft && draft.practice_id != practice_id
      end

      def chart_record_links_are_consistent
        if encounter_note_id.present? != encounter_note_revision_id.present?
          errors.add(:encounter_note, "and its revision must be recorded together")
          return
        end
        return unless encounter_note && encounter_note_revision

        errors.add(:encounter_note, "must belong to the selected practice") if encounter_note.practice_id != practice_id
        errors.add(:encounter_note_revision, "must belong to the selected practice") if encounter_note_revision.practice_id != practice_id
        errors.add(:encounter_note_revision, "must belong to the chart note") if encounter_note_revision.note_id != encounter_note_id
        if draft&.encounter&.clinical_encounter_id != encounter_note.encounter_id
          errors.add(:encounter_note, "must belong to the Scribe session's clinical encounter")
        end
      end
    end
  end
end
