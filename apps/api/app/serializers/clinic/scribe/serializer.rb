module Clinic
  module Scribe
    module Serializer
      module_function

      def encounter(encounter, detail: true)
        payload = {
          id: encounter.id, patient_id: encounter.patient_id, site_id: encounter.site_id,
          clinical_encounter_id: encounter.clinical_encounter_id,
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
          sources: encounter.sources.includes(:segments).order(:id).map { |source| source(source) },
          lab_selections: encounter.lab_selections.includes(lab_report_version: :lab_report)
            .order(:lab_report_version_id).map { |selection| lab_selection(selection) },
          documents: encounter.documents.includes(current_draft: [:sections, :exports]).order(:id).map { |document| document(document) },
          drafts: ordered_drafts(encounter).map { |draft| draft(draft) },
          events: encounter.events.order(:created_at, :id).map { |event| event(event) }
        )
      end

      def source(source)
        {
          id: source.id, source_type: source.source_type, status: source.status, content_digest: source.content_digest,
          telehealth_visit_id: source.telehealth_visit_id, telehealth_recording_id: source.telehealth_recording_id,
          capture_epoch: source.capture_epoch, recording_segment_index: source.recording_segment_index,
          source_order: source.source_order, source_set_digest: source.source_set_digest,
          metadata: source.source_metadata, content: source.status == "deleted" ? nil : source.content,
          segments: ordered_segments(source).map { |segment| segment(segment) }
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
          revision_number: draft.revision_number, current: draft.document.current_draft_id == draft.id, stale: !Workflow.fresh?(draft), status: draft.status,
          template_id: draft.template_id, template_version: draft.template_version,
          provider: draft.provider, model: draft.model, model_version: draft.model_version,
          prompt_digest: draft.prompt_digest, input_digest: draft.input_digest, output_digest: draft.output_digest,
          warnings: draft.warnings, input_sources: draft.input_sources, export_state: draft.export_state,
          approved_at: draft.approved_at&.iso8601(6), created_at: draft.created_at&.iso8601(6), version: draft.lock_version,
          sections: ordered_sections(draft).map { |section| section(section, redacted: draft.status == "deleted") },
          exports: ordered_exports(draft).map { |export| export(export) }
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
          status: export.status, payload_digest: export.payload_digest, exported_at: export.exported_at&.iso8601(6),
          encounter_note_id: export.encounter_note_id,
          encounter_note_revision_id: export.encounter_note_revision_id,
          chart_written: export.chart_written?
        }
      end

      def lab_selection(selection)
        version = selection.lab_report_version
        report = version.lab_report
        {
          id: selection.id,
          lab_report_id: report.id,
          lab_report_version_id: version.id,
          current_version_id: report.current_version_id,
          source_name: report.source_name,
          title: version.title,
          status: version.status,
          version_number: version.version_number,
          content_digest: version.content_digest,
          collected_at: version.collected_at&.iso8601(6),
          issued_at: version.issued_at&.iso8601(6),
          reviewed_at: version.reviewed_at&.iso8601(6),
          reviewed_by_membership_id: version.reviewed_by_membership_id,
          results: version.results,
          selected_at: selection.selected_at&.iso8601(6),
          selected_by_id: selection.selected_by_id
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
        values.sort_by { |revision| [revision.document.current_draft_id == revision.id ? 0 : 1, -revision.revision_number, -revision.id] }
      end

      def ordered_segments(source)
        return source.segments.sort_by(&:sequence) if source.association(:segments).loaded?

        source.segments.order(:sequence).to_a
      end

      def ordered_sections(draft)
        return draft.sections.sort_by(&:id) if draft.association(:sections).loaded?

        draft.sections.order(:id).to_a
      end

      def ordered_exports(draft)
        return draft.exports.sort_by(&:id) if draft.association(:exports).loaded?

        draft.exports.order(:id).to_a
      end
    end
  end
end
