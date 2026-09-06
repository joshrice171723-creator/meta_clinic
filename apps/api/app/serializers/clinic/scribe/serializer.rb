module Clinic
  module Scribe
    module Serializer
      module_function

      def encounter(encounter, detail: true)
        payload = {
          id: encounter.id, patient_id: encounter.patient_id, site_id: encounter.site_id,
          patient: { id: encounter.patient.id, reference: encounter.patient.reference, display_name: encounter.patient.display_name },
          status: encounter.status, consent_status: encounter.consent_status,
          consent_policy_version: encounter.consent_policy_version, consent_method: encounter.consent_method,
          consented_at: encounter.consented_at&.iso8601(6), consent_withdrawn_at: encounter.consent_withdrawn_at&.iso8601(6),
          retention_class: encounter.retention_class, retention_expires_at: encounter.retention_expires_at&.iso8601(6),
          deleted_at: encounter.deleted_at&.iso8601(6), template_id: encounter.template_id, template_version: encounter.template_version,
          created_at: encounter.created_at.iso8601(6), updated_at: encounter.updated_at.iso8601(6), version: encounter.lock_version
        }
        return payload unless detail

        payload.merge(
          context_content: encounter.deleted_at ? nil : encounter.context_content,
          sources: encounter.sources.order(:id).map { |source| source(source) },
          documents: encounter.documents.includes(drafts: [:sections, :exports]).order(:id).map { |document| document(document) },
          drafts: ordered_drafts(encounter).map { |draft| draft(draft) },
          events: encounter.events.order(:created_at, :id).map { |event| event(event) }
        )
      end

      def source(source)
        {
          id: source.id, source_type: source.source_type, status: source.status, content_digest: source.content_digest,
          metadata: source.source_metadata, content: source.status == "deleted" ? nil : source.content,
          segments: source.segments.order(:sequence).map { |segment| segment(segment) }
        }
      end

      def segment(segment)
        {
          id: segment.id, sequence: segment.sequence, speaker: segment.speaker,
          start_ms: segment.start_ms, end_ms: segment.end_ms, content: segment.status == "deleted" ? nil : segment.content,
          quality_flags: segment.quality_flags
        }
      end

      def draft(draft)
        {
          id: draft.id, parent_id: draft.parent_id, source_id: draft.source_id, document_id: draft.document_id,
          revision_number: draft.revision_number, current: draft.current?, stale: !Workflow.fresh?(draft), status: draft.status,
          template_id: draft.template_id, template_version: draft.template_version,
          provider: draft.provider, model: draft.model, model_version: draft.model_version,
          prompt_digest: draft.prompt_digest, input_digest: draft.input_digest, output_digest: draft.output_digest,
          warnings: draft.warnings, input_sources: draft.input_sources, export_state: draft.export_state,
          approved_at: draft.approved_at&.iso8601(6), created_at: draft.created_at&.iso8601(6), version: draft.lock_version,
          sections: draft.sections.order(:id).map { |section| section(section, redacted: draft.status == "deleted") },
          exports: draft.exports.order(:id).map { |export| export(export) }
        }
      end

      def section(section, redacted: false)
        {
          id: section.id, section_key: section.section_key, generated_content: redacted ? nil : section.generated_content,
          human_content: redacted ? nil : section.human_content, effective_content: redacted ? nil : section.effective_content,
          status: section.status, warning_codes: section.warning_codes, evidence_segment_ids: section.evidence_segment_ids,
          edit_revision: section.edit_revision, provenance: section.provenance
        }
      end

      def export(export)
        {
          id: export.id, destination: export.destination, version_checksum: export.version_checksum,
          status: export.status, payload_digest: export.payload_digest, exported_at: export.exported_at&.iso8601(6)
        }
      end

      def event(event)
        {
          id: event.id, event_type: event.event_type, resource_type: event.resource_type,
          resource_id: event.resource_id, metadata: event.metadata, created_at: event.created_at.iso8601(6)
        }
      end

      def document(document)
        {
          id: document.id, encounter_id: document.encounter_id, template_id: document.template_id,
          template_version: document.template_version, status: document.status,
          current_draft_id: document.current_draft_id, version: document.lock_version,
          created_at: document.created_at.iso8601(6), updated_at: document.updated_at.iso8601(6),
          current_revision: document.current_draft && draft(document.current_draft)
        }
      end

      def template(template)
        {
          id: template.template_id, version: template.version, label: template.label,
          note_kind: template.note_kind, status: template.status,
          disabled_reason: template.disabled_reason, sections: template.sections
        }
      end

      def ordered_drafts(encounter)
        values = encounter.drafts.includes(:document, :sections, :exports).to_a
        values.sort_by { |revision| [revision.current? ? 0 : 1, -revision.revision_number, -revision.id] }
      end
    end
  end
end
