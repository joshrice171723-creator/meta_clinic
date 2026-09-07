require "digest"

module Clinic
  module Scribe
    class Workflow
      CONSENT_POLICY_VERSION = "scribe-consent-v1"
      DEFAULT_TEMPLATE_ID = "soap"
      CHART_NOTE_TEMPLATE_ID = "scribe-reviewed-soap"
      CHART_NOTE_TEMPLATE_VERSION = 1
      REVIEWED_LAB_STATUSES = %w[final amended corrected].freeze
      SECTIONS = %w[subjective objective assessment plan].freeze

      class << self
        def create_encounter(practice:, actor:, patient:, site: nil, clinical_encounter: nil, context: nil)
          validate_clinical_encounter!(practice, patient, site, clinical_encounter) if clinical_encounter
          site ||= clinical_encounter&.site
          Authorization.authorize!(actor: actor, practice: practice, action: "scribe.write", site: site)
          authorize_chart_write!(clinical_encounter, actor) if clinical_encounter
          template = TemplateCatalog.fetch_active!(DEFAULT_TEMPLATE_ID)
          encounter = Encounter.transaction do
            value = Encounter.create!(practice: practice, patient: patient, site: site, created_by: actor,
              clinical_encounter: clinical_encounter, template_id: template.template_id, template_version: template.version)
            record_event!(value, actor, "encounter_created", "Encounter", value.id,
              clinical_encounter_id: clinical_encounter&.id)
            save_context!(encounter: value, actor: actor, content: context.fetch(:content),
              source_type: context.fetch(:source_type), expected_version: value.lock_version) if context.present?
            value
          end
          encounter.reload
        end

        def bind_clinical_encounter!(encounter:, actor:, clinical_encounter:, expected_version:)
          authorize!(encounter, actor, "scribe.write")
          validate_clinical_encounter!(encounter.practice, encounter.patient, encounter.site, clinical_encounter)
          authorize_chart_write!(clinical_encounter, actor)
          encounter.with_lock do
            verify_expected_version!(encounter, expected_version)
            if encounter.deleted_at || encounter.consent_status == "withdrawn"
              raise ArgumentError, "This Scribe session cannot be bound."
            end
            return encounter.reload if encounter.clinical_encounter_id == clinical_encounter.id
            if encounter.drafts.joins(:exports).exists?
              raise ArgumentError, "A Scribe session cannot be rebound after a chart export."
            end

            encounter.update!(clinical_encounter: clinical_encounter, site: encounter.site || clinical_encounter.site)
            record_event!(encounter, actor, "clinical_encounter_bound", "Encounter", encounter.id,
              clinical_encounter_id: clinical_encounter.id)
          end
          encounter.reload
        end

        def replace_lab_selections!(encounter:, actor:, lab_report_versions:, expected_version:)
          authorize!(encounter, actor, "scribe.write")
          Authorization.authorize!(actor: actor, practice: encounter.practice, action: "patients.read",
            subject: encounter.patient)
          Authorization.authorize!(actor: actor, practice: encounter.practice, action: "notes.read", any_site: true)
          versions = Array(lab_report_versions)
          raise ArgumentError, "Choose each lab report version once." unless versions.map(&:id).uniq.size == versions.size

          encounter.with_lock do
            verify_expected_version!(encounter, expected_version)
            ensure_processing_allowed!(encounter)
            versions.sort_by { |version| [version.lab_report_id, version.id] }.each do |version|
              version.lab_report.lock!
              validate_lab_version!(encounter, version)
            end
            encounter.lab_selections.destroy_all
            versions.each do |version|
              encounter.lab_selections.create!(practice: encounter.practice, patient: encounter.patient,
                lab_report_version: version, selected_by: actor, selected_at: Current.business_time)
            end
            encounter.touch
            record_event!(encounter, actor, "lab_selections_replaced", "Encounter", encounter.id,
              lab_report_version_ids: versions.map(&:id).sort)
          end
          encounter.reload
        end

        def save_context!(encounter:, actor:, content:, source_type:, expected_version:)
          authorize!(encounter, actor, "scribe.write")
          raise ArgumentError, "Context source must be reviewer_authored." unless source_type.to_s == "reviewer_authored"
          normalized = content.to_s.strip
          raise ArgumentError, "The encounter context is too large." if normalized.bytesize > 100_000
          encounter.with_lock do
            verify_expected_version!(encounter, expected_version)
            raise ArgumentError, "Context cannot be changed after deletion." if encounter.deleted_at
            attributes = normalized.blank? ?
              { context_content: nil, context_digest: nil, context_source_type: nil, context_authored_by: nil, context_updated_at: Current.business_time } :
              { context_content: normalized, context_digest: Digest::SHA256.hexdigest(normalized), context_source_type: "reviewer_authored",
                context_authored_by: actor, context_updated_at: Current.business_time }
            encounter.update!(attributes)
            record_event!(encounter, actor, normalized.blank? ? "context_cleared" : "context_saved", "Encounter", encounter.id,
              context_digest: encounter.context_digest, provenance: encounter.context_source_type)
          end
          encounter.reload
        end

        def decide_consent(encounter:, actor:, decision:, method: "in_person")
          authorize!(encounter, actor, "scribe.write")
          decision = decision.to_s
          raise ArgumentError, "Consent decision is not supported." unless %w[accepted declined withdrawn].include?(decision)
          encounter.with_lock do
            if decision == "accepted"
              raise ArgumentError, "Consent cannot be accepted after deletion." if encounter.deleted_at
              encounter.update!(consent_status: "accepted", consent_policy_version: CONSENT_POLICY_VERSION,
                consent_method: method, consented_at: Current.business_time, consent_withdrawn_at: nil, status: "consented")
            elsif decision == "withdrawn"
              encounter.update!(consent_status: "withdrawn", consent_withdrawn_at: Current.business_time, status: "consent_withdrawn")
              Retention.scrub!(encounter)
            else
              encounter.update!(consent_status: "declined", consent_policy_version: CONSENT_POLICY_VERSION,
                consent_method: method, status: "consent_declined")
            end
            record_event!(encounter, actor, "consent_#{decision}", "Encounter", encounter.id,
              policy_version: CONSENT_POLICY_VERSION, method: method)
          end
          encounter.reload
        end

        def ingest_transcript(encounter:, actor:, content:, segments: [], metadata: {}, trusted_metadata: {})
          authorize!(encounter, actor, "scribe.write")
          content = content.to_s.strip
          raise ArgumentError, "A transcript is required." if content.blank?
          raise ArgumentError, "The transcript is too large." if content.bytesize > 250_000
          digest = Digest::SHA256.hexdigest(content)
          source = nil
          encounter.with_lock do
            ensure_processing_allowed!(encounter)
            source = encounter.sources.find_by(content_digest: digest, status: %w[ready incomplete])
            unless source
              source = encounter.sources.create!(practice: encounter.practice, imported_by: actor, source_type: "transcript",
                status: "ready", content: content, content_digest: digest,
                source_metadata: safe_metadata(metadata).merge(safe_trusted_metadata(trusted_metadata)))
              normalize_segments(segments, content).each do |segment|
                source.segments.create!(practice: encounter.practice, sequence: segment[:sequence], speaker: segment[:speaker],
                  start_ms: segment[:start_ms], end_ms: segment[:end_ms], content: segment[:content], quality_flags: segment[:quality_flags])
              end
              encounter.update!(status: "source_ready")
              record_event!(encounter, actor, "source_ingested", "Source", source.id,
                source_type: "transcript", content_digest: digest, segment_count: source.segments.size)
            end
          end
          source
        end

        def generate_draft(encounter:, actor:, template_id: DEFAULT_TEMPLATE_ID, document_id: nil, expected_version: nil)
          authorize!(encounter, actor, "scribe.write")
          template = TemplateCatalog.fetch_active!(template_id)
          draft = document = nil
          encounter.with_lock do
            ensure_processing_allowed!(encounter)
            if document_id.present?
              document = encounter.documents.find(document_id)
              document.with_lock do
                verify_expected_version!(document, expected_version)
                raise ArgumentError, "The selected template does not match this document." unless document.template_id == template.template_id
                draft = generate_for_document!(encounter, document, template, actor)
              end
            else
              verify_expected_version!(encounter, expected_version)
              document = encounter.documents.create!(practice: encounter.practice, created_by: actor,
                template_id: template.template_id, template_version: template.version)
              draft = generate_for_document!(encounter, document, template, actor)
            end
          end
          [draft, document.reload]
        end

        def generate_provider_draft!(encounter:, actor:, source:, sections:, uncertain_sections:, provider:, model:,
          model_version:, prompt_digest:, template_id: DEFAULT_TEMPLATE_ID)
          authorize!(encounter, actor, "scribe.write")
          template = TemplateCatalog.fetch_active!(template_id)
          normalized = normalize_provider_sections(sections)
          uncertain = Array(uncertain_sections).map(&:to_s) & SECTIONS
          draft = document = nil
          encounter.with_lock do
            ensure_processing_allowed!(encounter)
            raise ArgumentError, "The transcript source does not belong to this encounter." unless
              source.encounter_id == encounter.id && source.practice_id == encounter.practice_id && source.status == "ready"
            state = input_state(encounter, template_id: template.template_id, template_version: template.version,
              lock_labs: true)
            raise ActiveRecord::StaleObjectError.new(source, "generate") unless state[:source]&.id == source.id
            ensure_selected_labs_current!(encounter, state[:lab_versions])
            normalized = DraftGenerator.append_lab_results(normalized, state[:lab_versions])
            document = encounter.documents.create!(practice: encounter.practice, created_by: actor,
              template_id: template.template_id, template_version: template.version)
            evidence_ids = source.segments.order(:sequence).pluck(:id)
            warnings = uncertain.map { |key| "provider_uncertainty_#{key}" }
            draft = document.drafts.create!(practice: encounter.practice, encounter: encounter, source: source,
              created_by: actor, status: "in_review", revision_number: next_revision(document),
              template_id: template.template_id, template_version: template.version,
              provider: provider.to_s, model: model.to_s, model_version: model_version.to_s,
              prompt_digest: prompt_digest.to_s, input_digest: state[:digest], source_snapshot_digest: source.content_digest,
              context_snapshot_digest: encounter.context_digest, input_sources: state[:sources],
              output_digest: Digest::SHA256.hexdigest(SECTIONS.map { |key| normalized.fetch(key) }.join("\0")), warnings: warnings)
            SECTIONS.each do |key|
              section_warnings = []
              section_warnings << "missing_source_evidence" if normalized.fetch(key).blank?
              section_warnings << "provider_uncertainty" if uncertain.include?(key)
              draft.sections.create!(practice: encounter.practice, section_key: key,
                generated_content: normalized.fetch(key), status: "needs_review", warning_codes: section_warnings,
                evidence_segment_ids: evidence_ids,
                provenance: provider_section_provenance(key, source, provider, model, state[:lab_versions]))
            end
            promote_revision!(document, nil, draft)
            encounter.update!(status: "in_review", template_id: template.template_id, template_version: template.version)
            record_event!(encounter, actor, "draft_generated", "Draft", draft.id,
              draft_id: draft.id, document_id: document.id, revision_number: draft.revision_number,
              provider: draft.provider, model: draft.model, model_version: draft.model_version,
              input_digest: draft.input_digest, output_digest: draft.output_digest, template_version: draft.template_version)
          end
          [draft, document.reload]
        end

        def review!(draft:, actor:, action:, section_key:, content: nil, expected_version: nil)
          authorize!(draft.encounter, actor, "scribe.write")
          raise ArgumentError, "Unknown draft section." unless SECTIONS.include?(section_key.to_s)
          result = nil
          draft.encounter.with_lock do
            draft.document.with_lock do
              draft.with_lock do
                ensure_processing_allowed!(draft.encounter)
                ensure_current!(draft)
                verify_expected_version!(draft, expected_version)
                raise ArgumentError, "Only a draft in review can be changed." unless %w[draft in_review].include?(draft.status)
                section = draft.sections.find_by!(section_key: section_key)
                if action.to_s == "edit"
                  raise ArgumentError, "Section content is required." if content.to_s.strip.blank?
                  result = clone_draft!(draft, actor)
                  edited = result.sections.find_by!(section_key: section_key)
                  edited.update!(human_content: content.to_s.strip, status: "edited", warning_codes: [],
                    edit_revision: section.edit_revision + 1, provenance: { "kind" => "reviewer_authored_section" })
                  finalize_draft_digest!(result)
                  promote_revision!(draft.document, draft, result)
                  record_event!(draft.encounter, actor, "section_edited", "Draft", result.id,
                    draft_id: result.id, parent_draft_id: draft.id, document_id: draft.document_id, section_key: section_key)
                elsif %w[accept reject].include?(action.to_s)
                  raise ArgumentError, "Only a section with no warnings can be accepted." if action.to_s == "accept" && (section.warning_codes.present? || section.effective_content.blank?)
                  section.update!(status: action.to_s == "accept" ? "accepted" : "rejected")
                  draft.touch
                  record_event!(draft.encounter, actor, "section_#{action}ed", "DraftSection", section.id,
                    draft_id: draft.id, document_id: draft.document_id, section_key: section_key)
                  result = draft.reload
                else
                  raise ArgumentError, "Review action is not supported."
                end
              end
            end
          end
          result
        end

        def save_sections!(draft:, actor:, sections:, expected_version:)
          authorize!(draft.encounter, actor, "scribe.write")
          normalized = normalize_manual_sections(sections)
          result = nil
          draft.encounter.with_lock do
            draft.document.with_lock do
              draft.with_lock do
                ensure_processing_allowed!(draft.encounter)
                ensure_current!(draft)
                verify_expected_version!(draft, expected_version)
                result = clone_draft!(draft, actor, current_inputs: true)
                result.sections.each do |section|
                  section.update!(generated_content: nil, human_content: normalized.fetch(section.section_key), status: "needs_review",
                    warning_codes: [], evidence_segment_ids: [], provenance: { "kind" => "reviewer_authored_section" },
                    edit_revision: section.edit_revision + 1)
                end
                finalize_draft_digest!(result)
                promote_revision!(draft.document, draft, result)
                record_event!(draft.encounter, actor, "sections_saved", "Draft", result.id,
                  draft_id: result.id, parent_draft_id: draft.id, document_id: draft.document_id, revision_number: result.revision_number)
              end
            end
          end
          result
        end

        def restore!(draft:, actor:, expected_version:)
          authorize!(draft.encounter, actor, "scribe.write")
          result = nil
          draft.encounter.with_lock do
            draft.document.with_lock do
              current = draft.document.current_draft || raise(ArgumentError, "This document has no current revision.")
              current.with_lock do
                ensure_processing_allowed!(draft.encounter)
                verify_expected_version!(current, expected_version)
                result = clone_draft!(draft, actor, preserve_review: false)
                result.sections.each do |section|
                  exact_content = section.effective_content
                  original = draft.sections.find_by!(section_key: section.section_key)
                  section.update!(generated_content: nil, human_content: exact_content, status: "needs_review",
                    warning_codes: original.warning_codes,
                    provenance: { "kind" => "restored_revision", "revision_id" => draft.id })
                end
                finalize_draft_digest!(result)
                promote_revision!(draft.document, current, result)
                record_event!(draft.encounter, actor, "revision_restored", "Draft", result.id,
                  draft_id: result.id, restored_from_draft_id: draft.id, document_id: draft.document_id,
                  revision_number: result.revision_number)
              end
            end
          end
          result
        end

        def approve!(draft:, actor:, expected_version: nil)
          authorize!(draft.encounter, actor, "scribe.approve")
          draft.encounter.with_lock do
            draft.document.with_lock do
              draft.with_lock do
                ensure_processing_allowed!(draft.encounter)
                ensure_current!(draft)
                ensure_fresh!(draft)
                verify_expected_version!(draft, expected_version)
                raise ArgumentError, "Only a draft in review can be approved." unless %w[draft in_review].include?(draft.status)
                raise ArgumentError, "Resolve every section before approval." unless draft.sections.size == SECTIONS.size &&
                  draft.sections.all? { |section| %w[accepted edited].include?(section.status) && section.warning_codes.blank? && section.effective_content.present? }
                draft.update!(status: "approved", approved_by: actor, approved_at: Current.business_time)
                draft.encounter.update!(status: "approved")
                record_event!(draft.encounter, actor, "draft_approved", "Draft", draft.id,
                  draft_id: draft.id, document_id: draft.document_id, checksum: checksum(draft))
              end
            end
          end
          draft.reload
        end

        def export!(draft:, actor:, destination:, idempotency_key:, confirmed:, expected_version: nil,
          existing_note_action: nil, encounter_note_id: nil, expected_note_revision_id: nil,
          expected_note_revision: nil, correction_reason: nil)
          authorize!(draft.encounter, actor, "scribe.export")
          raise ArgumentError, "Export confirmation is required." unless confirmed == true
          raise ArgumentError, "The export destination is not supported." unless destination.to_s == "parent_record_adapter"
          existing_note_request = normalize_existing_note_request!(
            action: existing_note_action,
            encounter_note_id: encounter_note_id,
            expected_note_revision_id: expected_note_revision_id,
            expected_note_revision: expected_note_revision,
            correction_reason: correction_reason
          )
          export = nil
          draft.encounter.with_lock do
            clinical_encounter = draft.encounter.clinical_encounter ||
              raise(ArgumentError, "Bind this Scribe session to a clinical encounter before exporting.")
            authorize_chart_write!(clinical_encounter, actor)
            draft.document.with_lock do
              draft.with_lock do
                payload_digest = Digest::SHA256.hexdigest(draft.effective_sections.to_json)
                export = Export.find_or_initialize_by(practice_id: draft.practice_id, idempotency_key: idempotency_key.to_s)
                if export.persisted?
                  requested_checksum = expected_version.nil? ? export.version_checksum : checksum(draft, version: expected_version)
                  same_request = export.draft_id == draft.id && export.destination == destination.to_s &&
                    export.version_checksum == requested_checksum && export.payload_digest == payload_digest &&
                    export_request_matches?(export, draft, existing_note_request)
                  raise Clinic::Idempotency::Conflict, "The export key was already used for another version." unless same_request
                  next
                end
                ensure_processing_allowed!(draft.encounter)
                ensure_current!(draft)
                ensure_fresh!(draft)
                verify_expected_version!(draft, expected_version)
                raise ArgumentError, "Only an approved current draft can be exported." unless draft.status == "approved"
                version_checksum = checksum(draft)
                encounter_note = clinical_encounter.notes.where(note_kind: "soap").first
                if encounter_note
                  unless existing_note_request
                    raise ArgumentError,
                      "This clinical encounter already has a SOAP note. Open the existing chart note to continue; Scribe export will not overwrite it."
                  end
                  unless encounter_note.id == existing_note_request.fetch(:encounter_note_id)
                    raise ActiveRecord::StaleObjectError.new(encounter_note, "correction")
                  end
                  encounter_note_revision = Clinic::Care::CorrectEncounterNote.call(
                    note: encounter_note,
                    actor: actor,
                    encrypted_body: chart_note_correction_payload(draft, existing_note_request),
                    corrected_revision_id: existing_note_request.fetch(:expected_note_revision_id),
                    expected_revision: existing_note_request.fetch(:expected_note_revision),
                    payload_version: Clinic::Care::SoapNotePayload::CORRECTION_VERSION,
                    required_template_id: CHART_NOTE_TEMPLATE_ID,
                    request_key: chart_note_correction_request_key(idempotency_key)
                  )
                else
                  if existing_note_request
                    raise ActiveRecord::StaleObjectError.new(clinical_encounter, "correction")
                  end
                  encounter_note = Clinic::Care::CreateEncounterNote.call(
                    practice: draft.practice,
                    actor: actor,
                    encounter: clinical_encounter,
                    note_kind: "soap",
                    encrypted_body: chart_note_payload(draft),
                    payload_version: Clinic::Care::SoapNotePayload::VERSION,
                    request_key: chart_note_request_key(idempotency_key)
                  )
                  encounter_note_revision = encounter_note.revisions.order(revision_no: :desc).first!
                end
                export.assign_attributes(draft: draft, actor: actor, destination: destination, version_checksum: version_checksum,
                  status: "exported", payload_digest: payload_digest, exported_at: Current.business_time,
                  encounter_note: encounter_note, encounter_note_revision: encounter_note_revision)
                export.save!
                draft.update!(status: "exported", export_state: "exported")
                draft.encounter.update!(status: "exported")
                record_event!(draft.encounter, actor, "draft_exported", "Export", export.id,
                  draft_id: draft.id, document_id: draft.document_id, destination: destination,
                  version_checksum: version_checksum, payload_digest: payload_digest,
                  clinical_encounter_id: clinical_encounter.id, encounter_note_id: encounter_note.id,
                  encounter_note_revision_id: encounter_note_revision.id)
              end
            end
          end
          export
        end

        def fresh?(draft, lock_labs: false)
          state = input_state(draft.encounter, template_id: draft.template_id, template_version: draft.template_version,
            lock_labs: lock_labs)
          return true if legacy_fresh?(draft, state)

          draft.input_digest == state.fetch(:digest)
        end

        private

        def generate_for_document!(encounter, document, template, actor)
          state = input_state(encounter, template_id: template.template_id, template_version: template.version,
            lock_labs: true)
          if state[:source].nil? && encounter.context_content.blank? && state[:lab_versions].empty?
            raise ArgumentError, "Add a transcript, reviewer-authored context, or reviewed lab results before generating a note."
          end
          ensure_selected_labs_current!(encounter, state[:lab_versions])
          segments = state[:source]&.segments&.order(:sequence)&.to_a || []
          provenance = encounter.context_digest && { "kind" => "reviewer_authored_context",
            "authored_by_id" => encounter.context_authored_by_id, "digest" => encounter.context_digest }
          sections = DraftGenerator.call(segments, context: encounter.context_content, context_provenance: provenance,
            lab_versions: state[:lab_versions])
          draft = document.drafts.create!(practice: encounter.practice, encounter: encounter, source: state[:source],
            created_by: actor, parent: document.current_draft, status: "in_review", revision_number: next_revision(document),
            template_id: template.template_id, template_version: template.version,
            provider: "local-rule-based", model: "grounded-section-abstainer", model_version: "1",
            prompt_digest: Digest::SHA256.hexdigest("scribe-template:#{template.template_id}:#{template.version}"),
            input_digest: state[:digest], source_snapshot_digest: state[:source]&.content_digest,
            context_snapshot_digest: encounter.context_digest, input_sources: state[:sources],
            output_digest: Digest::SHA256.hexdigest(sections.values.map { |value| value[:content].to_s }.join("\u0000")),
            warnings: sections.values.flat_map { |section| section[:warning_codes] }.uniq)
          sections.each do |key, section|
            draft.sections.create!(practice: encounter.practice, section_key: key, generated_content: section[:content],
              status: section[:status], warning_codes: section[:warning_codes], evidence_segment_ids: section[:evidence_segment_ids],
              provenance: section[:provenance])
          end
          promote_revision!(document, document.current_draft, draft)
          encounter.update!(status: "in_review", template_id: template.template_id, template_version: template.version)
          record_event!(encounter, actor, "draft_generated", "Draft", draft.id,
            draft_id: draft.id, document_id: document.id, revision_number: draft.revision_number,
            provider: draft.provider, model: draft.model, model_version: draft.model_version,
            input_digest: draft.input_digest, output_digest: draft.output_digest, template_version: draft.template_version)
          draft
        end

        def authorize!(encounter, actor, action)
          Authorization.authorize!(actor: actor, practice: encounter.practice, action: action, site: encounter.site)
        end

        def ensure_processing_allowed!(encounter)
          raise ArgumentError, "Current consent does not allow processing." unless encounter.processing_allowed?
        end

        def ensure_current!(draft)
          raise ActiveRecord::StaleObjectError.new(draft, "update") unless draft.current?
        end

        def ensure_fresh!(draft)
          raise ActiveRecord::StaleObjectError.new(draft, "update") unless fresh?(draft, lock_labs: true)
        end

        def verify_expected_version!(record, expected_version)
          return if expected_version.nil?
          raise ActiveRecord::StaleObjectError.new(record, "update") unless record.lock_version == expected_version.to_i
        end

        def input_state(encounter, template_id:, template_version:, lock_labs: false)
          source = encounter.sources.where(status: "ready").order(:id).last
          sources = []
          sources << { "kind" => "transcript", "source_id" => source.id, "digest" => source.content_digest } if source
          if encounter.context_digest
            sources << { "kind" => "reviewer_authored_context", "authored_by_id" => encounter.context_authored_by_id,
              "digest" => encounter.context_digest }
          end
          lab_versions = encounter.lab_selections.includes(:lab_report_version).order(:lab_report_version_id)
            .map(&:lab_report_version)
          reports = Clinic::Care::LabReport.where(id: lab_versions.map(&:lab_report_id).uniq).includes(:current_version).order(:id)
          reports = reports.lock if lock_labs
          reports_by_id = reports.index_by(&:id)
          lab_versions.each do |version|
            version.association(:lab_report).target = reports_by_id.fetch(version.lab_report_id)
          end
          lab_versions.each do |version|
            report = version.lab_report
            current = report.current_version
            sources << {
              "kind" => "lab_report_version",
              "lab_report_id" => report.id,
              "lab_report_version_id" => version.id,
              "digest" => version.content_digest,
              "status" => version.status,
              "report_current_version_id" => report.current_version_id,
              "report_current_status" => current&.status
            }
          end
          values = [source&.content_digest.to_s, encounter.context_digest.to_s, encounter.clinical_encounter_id.to_s,
            template_id.to_s, template_version.to_i, JSON.generate(sources.select { |value| value["kind"] == "lab_report_version" })]
          { source: source, lab_versions: lab_versions, sources: sources,
            digest: Digest::SHA256.hexdigest(values.join("\u0000")) }
        end

        def legacy_fresh?(draft, state)
          draft.input_sources.empty? && draft.source_snapshot_digest.nil? && draft.context_snapshot_digest.nil? &&
            draft.encounter.context_digest.nil? && draft.encounter.clinical_encounter_id.nil? && state[:lab_versions].empty? &&
            state[:source]&.id == draft.source_id &&
            draft.input_digest == state[:source]&.content_digest
        end

        def validate_clinical_encounter!(practice, patient, site, clinical_encounter)
          valid = clinical_encounter.practice_id == practice.id && clinical_encounter.patient_id == patient.id
          valid &&= site.nil? || clinical_encounter.site_id == site.id
          raise ArgumentError, "The clinical encounter must belong to this practice, patient, and site." unless valid
        end

        def authorize_chart_write!(clinical_encounter, actor)
          Authorization.authorize!(actor: actor, practice: clinical_encounter.practice, action: "notes.write",
            site: clinical_encounter.site)
        end

        def validate_lab_version!(encounter, version)
          report = version.lab_report
          unless version.practice_id == encounter.practice_id && version.patient_id == encounter.patient_id &&
              report.practice_id == encounter.practice_id && report.patient_id == encounter.patient_id
            raise ArgumentError, "Every selected lab report must belong to this practice and patient."
          end
          unless report.current_version_id == version.id
            raise ArgumentError, "Choose the current version of each lab report."
          end
          unless version.reviewed_at.present? && version.reviewed_by_membership_id.present?
            raise ArgumentError, "Every selected lab report version must be reviewed."
          end
          unless REVIEWED_LAB_STATUSES.include?(version.status)
            raise ArgumentError, "Only final, amended, or corrected lab results can be selected."
          end
        end

        def ensure_selected_labs_current!(encounter, versions)
          versions.each { |version| validate_lab_version!(encounter, version) }
        end

        def provider_section_provenance(section_key, source, provider, model, lab_versions)
          value = { "kind" => "provider_audio_transcription", "source_id" => source.id,
            "provider" => provider.to_s, "model" => model.to_s }
          value["lab_report_version_ids"] = lab_versions.map(&:id) if section_key == "objective" && lab_versions.any?
          value
        end

        def chart_note_payload(draft)
          Clinic::Care::SoapNotePayload.dump(
            template_id: CHART_NOTE_TEMPLATE_ID,
            template_version: CHART_NOTE_TEMPLATE_VERSION,
            sections: draft.effective_sections.symbolize_keys
          )
        end

        def chart_note_correction_payload(draft, request)
          Clinic::Care::SoapNotePayload.dump_correction(
            template_id: CHART_NOTE_TEMPLATE_ID,
            template_version: CHART_NOTE_TEMPLATE_VERSION,
            sections: draft.effective_sections.symbolize_keys,
            corrected_revision_id: request.fetch(:expected_note_revision_id),
            corrected_revision_no: request.fetch(:expected_note_revision),
            reason: request.fetch(:correction_reason),
            source: { kind: "scribe_export", draft_id: draft.id, output_digest: draft.output_digest }
          )
        end

        def chart_note_request_key(idempotency_key)
          "scribe-chart-note:#{Digest::SHA256.hexdigest(idempotency_key.to_s)}"
        end

        def chart_note_correction_request_key(idempotency_key)
          "scribe-chart-correction:#{Digest::SHA256.hexdigest(idempotency_key.to_s)}"
        end

        def normalize_existing_note_request!(action:, encounter_note_id:, expected_note_revision_id:,
          expected_note_revision:, correction_reason:)
          values = [encounter_note_id, expected_note_revision_id, expected_note_revision, correction_reason]
          if action.to_s.blank?
            if values.any?(&:present?)
              raise ArgumentError, "Choose append_correction before supplying an existing chart note."
            end
            return nil
          end
          raise ArgumentError, "The existing note action is not supported." unless action.to_s == "append_correction"

          note_id = positive_integer!(encounter_note_id, "Choose the existing chart note.")
          revision_id = positive_integer!(expected_note_revision_id, "Choose the signed chart note revision.")
          revision_no = positive_integer!(expected_note_revision, "Choose the signed chart note revision.")
          reason = correction_reason.to_s.strip
          raise ArgumentError, "Enter a correction reason." if reason.blank?
          if reason.length > Clinic::Care::SoapNotePayload::MAX_CORRECTION_REASON_LENGTH
            raise ArgumentError, "The correction reason is too long."
          end

          {
            action: "append_correction",
            encounter_note_id: note_id,
            expected_note_revision_id: revision_id,
            expected_note_revision: revision_no,
            correction_reason: reason
          }
        end

        def positive_integer!(value, message)
          integer = Integer(value)
          return integer if integer.positive?

          raise ArgumentError, message
        rescue TypeError, ArgumentError
          raise ArgumentError, message
        end

        def export_request_matches?(export, draft, request)
          revision = export.encounter_note_revision
          return request.nil? unless revision

          correction = Clinic::Care::SoapNotePayload.load!(revision.encrypted_body)[:correction]
          return correction.nil? unless request

          source = correction&.fetch(:source, nil)
          export.encounter_note_id == request.fetch(:encounter_note_id) &&
            correction&.values_at(:corrected_revision_id, :corrected_revision_no, :reason) ==
              request.values_at(:expected_note_revision_id, :expected_note_revision, :correction_reason) &&
            source&.values_at(:kind, :draft_id, :output_digest) ==
              ["scribe_export", draft.id, draft.output_digest]
        rescue ArgumentError
          false
        end

        def normalize_segments(segments, content)
          supplied = Array(segments)
          supplied = [{ "speaker" => "unknown", "start_ms" => 0, "end_ms" => 0, "content" => content }] if supplied.empty?
          supplied.each_with_index.map do |raw, index|
            value = raw.respond_to?(:to_h) ? raw.to_h : {}
            text = value["content"] || value[:content]
            raise ArgumentError, "Every transcript segment needs content." if text.to_s.strip.blank?
            start_ms = [Integer(value["start_ms"] || value[:start_ms] || 0), 0].max
            { sequence: index + 1, speaker: normalized_speaker(value), start_ms: start_ms,
              end_ms: [Integer(value["end_ms"] || value[:end_ms] || 0), start_ms].max,
              content: text.to_s.strip, quality_flags: value["quality_flags"] || value[:quality_flags] || {} }
          end
        end

        def normalized_speaker(value)
          speaker = (value["speaker"] || value[:speaker]).to_s
          %w[patient clinician caregiver unknown].include?(speaker) ? speaker : "unknown"
        end

        def safe_metadata(metadata)
          value = metadata.respond_to?(:to_h) ? metadata.to_h : {}
          value.slice("filename", "locale", "duration_ms", "source_label").stringify_keys
        end

        def safe_trusted_metadata(metadata)
          value = metadata.respond_to?(:to_h) ? metadata.to_h.stringify_keys : {}
          value.slice("recording_id", "provider", "model", "model_version")
        end

        def normalize_provider_sections(sections)
          values = sections.respond_to?(:to_h) ? sections.to_h.stringify_keys : {}
          raise ArgumentError, "The provider must return all four SOAP sections." unless (values.keys & SECTIONS).sort == SECTIONS.sort
          normalized = SECTIONS.to_h do |key|
            value = values.fetch(key).to_s.strip
            raise ArgumentError, "#{key.humanize} is too long." if value.bytesize > 50_000
            [key, value]
          end
          raise ArgumentError, "The provider returned an empty SOAP draft." if normalized.values.all?(&:blank?)
          normalized
        end

        def clone_draft!(draft, actor, current_inputs: false, preserve_review: true)
          copy = draft.dup
          copy.parent = draft
          copy.created_by = actor
          copy.status = "in_review"
          copy.revision_number = next_revision(draft.document)
          copy.approved_by = nil
          copy.approved_at = nil
          copy.export_state = "not_exported"
          if current_inputs
            state = input_state(draft.encounter, template_id: draft.template_id, template_version: draft.template_version,
              lock_labs: true)
            copy.source = state[:source]
            copy.source_snapshot_digest = state[:source]&.content_digest
            copy.context_snapshot_digest = draft.encounter.context_digest
            copy.input_sources = state[:sources]
            copy.input_digest = state[:digest]
          end
          copy.save!
          draft.sections.order(:id).each do |section|
            copy.sections.create!(practice: draft.practice, section_key: section.section_key,
              generated_content: section.generated_content, human_content: section.human_content,
              status: preserve_review ? section.status : "needs_review",
              warning_codes: preserve_review ? section.warning_codes : [], evidence_segment_ids: section.evidence_segment_ids,
              edit_revision: section.edit_revision, provenance: section.provenance)
          end
          copy
        end

        def promote_revision!(document, prior, current)
          prior.update!(status: "superseded") if prior && prior.status != "deleted"
          document.update!(current_draft: current)
        end

        def next_revision(document)
          document.drafts.maximum(:revision_number).to_i + 1
        end

        def normalize_manual_sections(sections)
          values = sections.respond_to?(:to_h) ? sections.to_h.stringify_keys : {}
          raise ArgumentError, "Save all four SOAP sections together." unless (values.keys & SECTIONS).sort == SECTIONS.sort
          normalized = SECTIONS.to_h do |key|
            value = values.fetch(key).to_s
            raise ArgumentError, "#{key.humanize} is too long." if value.length > 50_000
            [key, value]
          end
          raise ArgumentError, "Enter note content before saving." if normalized.values.all?(&:blank?)
          normalized
        end

        def finalize_draft_digest!(draft)
          draft.update!(output_digest: Digest::SHA256.hexdigest(draft.effective_sections.values.join("\u0000")))
        end

        def checksum(draft, version: draft.lock_version)
          Digest::SHA256.hexdigest([draft.id, version, draft.output_digest, draft.effective_sections.to_json].join("\u0000"))
        end

        def record_event!(encounter, actor, event_type, resource_type, resource_id, metadata = {})
          values = metadata.stringify_keys
          Event.create!(practice: encounter.practice, encounter: encounter, actor: actor,
            draft_id: values.delete("draft_id"), event_type: event_type, resource_type: resource_type,
            resource_id: resource_id, metadata: values, created_at: Time.current)
          Clinic::AuditRecorder.record!(practice: encounter.practice, actor: actor,
            action_code: "scribe.#{event_type}", outcome: :committed, resource_version_ref: "#{resource_type}/#{resource_id}")
        end
      end
    end
  end
end
