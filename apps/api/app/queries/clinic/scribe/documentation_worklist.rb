module Clinic
  module Scribe
    class DocumentationWorklist
      CANDIDATE_LIMIT_PER_SOURCE = 25
      STATE_ORDER = {
        "inputs_changed" => 0,
        "needs_review" => 1,
        "ready_to_add_to_chart" => 2,
        "unsigned_note" => 3
      }.freeze

      def self.call(scribe_scope:, note_scope: nil)
        scribe_candidates = current_scribe_drafts(scribe_scope)
        unsigned_candidates = current_unsigned_revisions(note_scope)
        truncated = scribe_candidates.length > CANDIDATE_LIMIT_PER_SOURCE ||
          unsigned_candidates.length > CANDIDATE_LIMIT_PER_SOURCE
        items = scribe_candidates.first(CANDIDATE_LIMIT_PER_SOURCE).map { |draft| scribe_item(draft) }
        items.concat(unsigned_candidates.first(CANDIDATE_LIMIT_PER_SOURCE).map { |revision| unsigned_item(revision) })
        items.sort_by! { |item| [ STATE_ORDER.fetch(item.fetch(:state)), item.fetch(:updated_at), item.fetch(:key) ] }
        counts = STATE_ORDER.keys.to_h { |state| [ state.to_sym, items.count { |item| item[:state] == state } ] }

        {
          scope: "recent_completed_visits",
          candidate_limit_per_source: CANDIDATE_LIMIT_PER_SOURCE,
          unsigned_notes_available: !note_scope.nil?,
          truncated: truncated,
          returned_count: items.length,
          returned_counts: counts,
          items: items
        }
      end

      def self.current_scribe_drafts(scribe_scope)
        completed_encounter_ids = Clinic::Encounter.where(status: "completed").where.not(ended_at: nil).select(:id)
        eligible_scribe_ids = scribe_scope.where.not(status: "deleted")
          .where(clinical_encounter_id: completed_encounter_ids).select(:id)
        Clinic::Scribe::Draft.joins(:document)
          .where(encounter_id: eligible_scribe_ids, status: %w[draft in_review approved])
          .where(clinic_scribe_documents: { status: "active" })
          .where("clinic_scribe_documents.current_draft_id = clinic_scribe_drafts.id")
          .includes(:sections, encounter: %i[patient site clinical_encounter])
          .order(updated_at: :desc, id: :desc).limit(CANDIDATE_LIMIT_PER_SOURCE + 1).to_a
      end
      private_class_method :current_scribe_drafts

      def self.current_unsigned_revisions(note_scope)
        return [] unless note_scope

        completed_encounter_ids = Clinic::Encounter.where(status: "completed").where.not(ended_at: nil).select(:id)
        eligible_note_ids = note_scope.where(note_kind: "soap", encounter_id: completed_encounter_ids).select(:id)
        Clinic::EncounterNoteRevision.where(note_id: eligible_note_ids)
          .where(<<~SQL.squish)
            NOT EXISTS (
              SELECT 1 FROM clinic_encounter_note_revisions newer
              WHERE newer.note_id = clinic_encounter_note_revisions.note_id
                AND newer.revision_no > clinic_encounter_note_revisions.revision_no
            )
          SQL
          .where(<<~SQL.squish)
            NOT EXISTS (
              SELECT 1 FROM clinic_encounter_note_signatures signatures
              WHERE signatures.revision_id = clinic_encounter_note_revisions.id
            )
          SQL
          .includes(note: %i[patient encounter])
          .order(created_at: :desc, id: :desc).limit(CANDIDATE_LIMIT_PER_SOURCE + 1).to_a
      end
      private_class_method :current_unsigned_revisions

      def self.scribe_item(draft)
        encounter = draft.encounter
        fresh = Workflow.fresh?(draft)
        state = if !fresh
          "inputs_changed"
        elsif %w[draft in_review].include?(draft.status)
          "needs_review"
        else
          "ready_to_add_to_chart"
        end
        unresolved = draft.sections.count do |section|
          !%w[accepted edited].include?(section.status) || section.warning_codes.present? || section.effective_content.blank?
        end

        base_item(encounter.patient, encounter.site_id, encounter.clinical_encounter_id).merge(
          key: "scribe-draft-#{draft.id}",
          kind: "scribe_draft",
          state: state,
          scribe_encounter_id: encounter.id,
          document_id: draft.document_id,
          draft_id: draft.id,
          note_id: nil,
          note_revision_id: nil,
          unresolved_section_count: unresolved,
          updated_at: draft.updated_at.iso8601(6)
        )
      end
      private_class_method :scribe_item

      def self.unsigned_item(revision)
        note = revision.note
        base_item(note.patient, note.encounter.site_id, note.encounter_id).merge(
          key: "soap-revision-#{revision.id}",
          kind: "soap_note",
          state: "unsigned_note",
          scribe_encounter_id: nil,
          document_id: nil,
          draft_id: nil,
          note_id: note.id,
          note_revision_id: revision.id,
          unresolved_section_count: nil,
          updated_at: revision.created_at.iso8601(6)
        )
      end
      private_class_method :unsigned_item

      def self.base_item(patient, site_id, clinical_encounter_id)
        {
          patient: { id: patient.id, display_name: patient.display_name, reference: patient.reference },
          site_id: site_id,
          clinical_encounter_id: clinical_encounter_id
        }
      end
      private_class_method :base_item
    end
  end
end
