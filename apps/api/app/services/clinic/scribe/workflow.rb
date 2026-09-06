require "digest"

module Clinic
  module Scribe
    class Workflow
      CONSENT_POLICY_VERSION = "scribe-consent-v1"
      TEMPLATE_ID = "documentation-summary"
      TEMPLATE_VERSION = 1
      SECTIONS = %w[subjective objective assessment plan].freeze

      class << self
        def create_encounter(practice:, actor:, patient:, site: nil)
          Authorization.authorize!(actor: actor, practice: practice, action: "scribe.write", site: site)
          encounter = Encounter.create!(practice: practice, patient: patient, site: site, created_by: actor,
            template_id: TEMPLATE_ID, template_version: TEMPLATE_VERSION)
          record_event!(encounter, actor, "encounter_created", "Encounter", encounter.id)
          encounter
        end

        def decide_consent(encounter:, actor:, decision:, method: "in_person")
          authorize!(encounter, actor, "scribe.write")
          decision = decision.to_s
          raise ArgumentError, "Consent decision is not supported." unless %w[accepted declined withdrawn].include?(decision)
          encounter.with_lock do
            if decision == "accepted"
              raise ArgumentError, "Consent cannot be accepted after deletion." if encounter.deleted_at
              encounter.update!(consent_status: "accepted", consent_policy_version: CONSENT_POLICY_VERSION,
                consent_method: method, consented_at: Time.current, consent_withdrawn_at: nil, status: "consented")
            elsif decision == "withdrawn"
              encounter.update!(consent_status: "withdrawn", consent_withdrawn_at: Time.current, status: "consent_withdrawn")
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

        def ingest_transcript(encounter:, actor:, content:, segments: [], metadata: {})
          authorize!(encounter, actor, "scribe.write")
          ensure_processing_allowed!(encounter)
          content = content.to_s.strip
          raise ArgumentError, "A transcript is required." if content.blank?
          raise ArgumentError, "The transcript is too large." if content.bytesize > 250_000
          digest = Digest::SHA256.hexdigest(content)
          source = nil
          encounter.with_lock do
            source = encounter.sources.find_by(content_digest: digest, status: %w[ready incomplete])
            unless source
              source = encounter.sources.create!(practice: encounter.practice, imported_by: actor, source_type: "transcript",
                status: "ready", content: content, content_digest: digest, source_metadata: safe_metadata(metadata))
              normalized_segments = normalize_segments(segments, content)
              normalized_segments.each do |segment|
                source.segments.create!(practice: encounter.practice, sequence: segment.fetch(:sequence),
                  speaker: segment.fetch(:speaker), start_ms: segment.fetch(:start_ms), end_ms: segment.fetch(:end_ms),
                  content: segment.fetch(:content), quality_flags: segment.fetch(:quality_flags))
              end
              encounter.update!(status: "source_ready")
              record_event!(encounter, actor, "source_ingested", "Source", source.id,
                source_type: "transcript", content_digest: digest, segment_count: normalized_segments.length)
            end
          end
          source
        end

        def generate_draft(encounter:, actor:)
          authorize!(encounter, actor, "scribe.write")
          ensure_processing_allowed!(encounter)
          source = encounter.sources.where(status: "ready").order(:id).last || raise(ArgumentError, "A ready transcript is required.")
          source_segments = source.segments.order(:sequence).to_a
          sections = DraftGenerator.call(source_segments)
          output_digest = Digest::SHA256.hexdigest(sections.values.map { |value| value.fetch(:content).to_s }.join("\u0000"))
          draft = nil
          encounter.with_lock do
            encounter.drafts.where(status: %w[draft in_review]).update_all(status: "superseded")
            draft = encounter.drafts.create!(practice: encounter.practice, source: source, created_by: actor, status: "in_review",
              template_id: encounter.template_id, template_version: encounter.template_version,
              provider: "synthetic-local", model: "grounded-section-abstainer", model_version: "1",
              prompt_digest: Digest::SHA256.hexdigest("scribe-template:#{encounter.template_id}:#{encounter.template_version}"),
              input_digest: source.content_digest, output_digest: output_digest,
              warnings: sections.values.flat_map { |section| section.fetch(:warning_codes) }.uniq)
            sections.each do |key, section|
              draft.sections.create!(practice: encounter.practice, section_key: key, generated_content: section.fetch(:content),
                status: section.fetch(:status), warning_codes: section.fetch(:warning_codes), evidence_segment_ids: section.fetch(:evidence_segment_ids))
            end
            encounter.update!(status: "in_review")
            record_event!(encounter, actor, "draft_generated", "Draft", draft.id,
              provider: draft.provider, model: draft.model, model_version: draft.model_version,
              input_digest: draft.input_digest, output_digest: draft.output_digest, template_version: draft.template_version)
          end
          draft
        end

        def review!(draft:, actor:, action:, section_key:, content: nil, expected_version: nil)
          authorize!(draft.encounter, actor, "scribe.write")
          raise ArgumentError, "Unknown draft section." unless SECTIONS.include?(section_key.to_s)
          action = action.to_s
          result = nil
          draft.encounter.with_lock do
            draft.with_lock do
              ensure_processing_allowed!(draft.encounter)
              verify_expected_version!(draft, expected_version)
              raise ArgumentError, "Only a draft in review can be changed." unless %w[draft in_review].include?(draft.status)
              section = draft.sections.find_by!(section_key: section_key)
              if action == "edit"
                raise ArgumentError, "Section content is required." if content.to_s.strip.blank?
                result = clone_draft!(draft, actor)
                new_section = result.sections.find_by!(section_key: section_key)
                new_section.update!(human_content: content.to_s.strip, status: "edited", warning_codes: [], edit_revision: section.edit_revision + 1)
                finalize_draft_digest!(result)
                draft.update!(status: "superseded")
                record_event!(draft.encounter, actor, "section_edited", "Draft", result.id,
                  parent_draft_id: draft.id, section_key: section_key, edit_revision: new_section.edit_revision)
              elsif %w[accept reject].include?(action)
                raise ArgumentError, "Only a section with no warnings can be accepted." if action == "accept" && (section.warning_codes.present? || section.effective_content.blank?)
                section.update!(status: action == "accept" ? "accepted" : "rejected")
                draft.touch
                record_event!(draft.encounter, actor, "section_#{action}ed", "DraftSection", section.id,
                  draft_id: draft.id, section_key: section_key)
                result = draft.reload
              else
                raise ArgumentError, "Review action is not supported."
              end
            end
          end
          result
        end

        def approve!(draft:, actor:, expected_version: nil)
          authorize!(draft.encounter, actor, "scribe.approve")
          draft.encounter.with_lock do
            draft.with_lock do
              ensure_processing_allowed!(draft.encounter)
              verify_expected_version!(draft, expected_version)
              raise ArgumentError, "Only a draft in review can be approved." unless %w[draft in_review].include?(draft.status)
              raise ArgumentError, "Resolve every section before approval." unless draft.sections.size == SECTIONS.size &&
                draft.sections.all? { |section| %w[accepted edited].include?(section.status) && section.warning_codes.blank? && section.effective_content.present? }
              draft.update!(status: "approved", approved_by: actor, approved_at: Time.current)
              draft.encounter.update!(status: "approved")
              record_event!(draft.encounter, actor, "draft_approved", "Draft", draft.id, checksum: checksum(draft))
            end
          end
          draft.reload
        end

        def export!(draft:, actor:, destination:, idempotency_key:, confirmed:, expected_version: nil)
          authorize!(draft.encounter, actor, "scribe.export")
          raise ArgumentError, "Export confirmation is required." unless confirmed == true
          raise ArgumentError, "The export destination is not supported." unless destination.to_s == "parent_record_adapter"
          export = nil
          draft.encounter.with_lock do
            draft.with_lock do
              payload_digest = Digest::SHA256.hexdigest(draft.effective_sections.to_json)
              export = Export.find_or_initialize_by(practice_id: draft.practice_id, idempotency_key: idempotency_key.to_s)
              if export.persisted?
                requested_checksum = expected_version.nil? ? export.version_checksum : checksum(draft, version: expected_version)
                same_request = export.draft_id == draft.id && export.destination == destination.to_s &&
                  export.version_checksum == requested_checksum && export.payload_digest == payload_digest
                raise ArgumentError, "The export key was already used for another version." unless same_request
                next
              end
              ensure_processing_allowed!(draft.encounter)
              verify_expected_version!(draft, expected_version)
              raise ArgumentError, "Only an approved current draft can be exported." unless draft.status == "approved"
              version_checksum = checksum(draft)
              export.assign_attributes(draft: draft, actor: actor, destination: destination, version_checksum: version_checksum,
                status: "exported", payload_digest: payload_digest, exported_at: Time.current)
              export.save!
              draft.update!(status: "exported", export_state: "exported")
              draft.encounter.update!(status: "exported")
              record_event!(draft.encounter, actor, "draft_exported", "Export", export.id,
                destination: destination, version_checksum: version_checksum, payload_digest: payload_digest)
            end
          end
          export
        end

        private

        def authorize!(encounter, actor, action)
          Authorization.authorize!(actor: actor, practice: encounter.practice, action: action, site: encounter.site)
        end

        def ensure_processing_allowed!(encounter)
          raise ArgumentError, "Current consent does not allow processing." unless encounter.processing_allowed?
        end

        def verify_expected_version!(draft, expected_version)
          return if expected_version.nil?
          raise ActiveRecord::StaleObjectError.new(draft, "update") unless draft.lock_version == expected_version
        end

        def normalize_segments(segments, content)
          supplied = Array(segments)
          supplied = [{ "speaker" => "unknown", "start_ms" => 0, "end_ms" => 0, "content" => content }] if supplied.empty?
          supplied.each_with_index.map do |raw, index|
            value = raw.respond_to?(:to_h) ? raw.to_h : {}
            text = value["content"] || value[:content]
            raise ArgumentError, "Every transcript segment needs content." if text.to_s.strip.blank?
            {
              sequence: index + 1,
              speaker: %w[patient clinician caregiver unknown].include?((value["speaker"] || value[:speaker]).to_s) ? (value["speaker"] || value[:speaker]).to_s : "unknown",
              start_ms: [Integer(value["start_ms"] || value[:start_ms] || 0), 0].max,
              end_ms: [Integer(value["end_ms"] || value[:end_ms] || 0), 0].max,
              content: text.to_s.strip,
              quality_flags: value["quality_flags"] || value[:quality_flags] || {}
            }
          end
        end

        def safe_metadata(metadata)
          value = metadata.respond_to?(:to_h) ? metadata.to_h : {}
          value.slice("filename", "locale", "duration_ms", "source_label").stringify_keys
        end

        def clone_draft!(draft, actor)
          copy = draft.dup
          copy.parent = draft
          copy.created_by = actor
          copy.status = "in_review"
          copy.approved_by = nil
          copy.approved_at = nil
          copy.export_state = "not_exported"
          copy.save!
          draft.sections.order(:id).each do |section|
            copy.sections.create!(practice: draft.practice, section_key: section.section_key,
              generated_content: section.generated_content, human_content: section.human_content, status: section.status,
              warning_codes: section.warning_codes, evidence_segment_ids: section.evidence_segment_ids, edit_revision: section.edit_revision)
          end
          copy
        end

        def finalize_draft_digest!(draft)
          draft.update!(output_digest: Digest::SHA256.hexdigest(draft.effective_sections.values.join("\u0000")))
        end

        def checksum(draft, version: draft.lock_version)
          Digest::SHA256.hexdigest([draft.id, version, draft.output_digest, draft.effective_sections.to_json].join("\u0000"))
        end

        def record_event!(encounter, actor, event_type, resource_type, resource_id, metadata = {})
          Event.create!(practice: encounter.practice, encounter: encounter, actor: actor,
            draft_id: metadata.delete(:draft_id), event_type: event_type, resource_type: resource_type,
            resource_id: resource_id, metadata: metadata.stringify_keys, created_at: Time.current)
          Clinic::AuditRecorder.record!(practice: encounter.practice, actor: actor,
            action_code: "scribe.#{event_type}", outcome: :committed, resource_version_ref: "#{resource_type}/#{resource_id}")
        end
      end
    end
  end
end
