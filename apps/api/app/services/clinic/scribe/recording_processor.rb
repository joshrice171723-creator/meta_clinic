require "base64"
require "digest"

module Clinic
  module Scribe
    class RecordingProcessor
      class << self
        def availability
          return { status: "not_started", message: "The recording will be sent for transcription after it is finalized." } if OpenRouter.configured?

          { status: "unavailable", message: "AI transcription is unavailable until OpenRouter is configured." }
        end

        def status(recording)
          source = source_for(recording)
          if source
            draft = recording.encounter.drafts.where(source_id: source.id).order(:revision_number, :id).last
            message = recording.capture_source == "telehealth_mix" ?
              "The acknowledged transcript segment is ready. Generate the encounter draft from the ordered source set." :
              "Transcript and SOAP draft are ready for review."
            return {
              status: "ready", message:,
              source_id: source.id, draft_id: draft&.id
            }
          end

          event = recording.encounter.events.where(resource_type: "Recording", resource_id: recording.id)
            .where(event_type: %w[recording_processing recording_processing_failed]).order(created_at: :desc, id: :desc).first
          return availability unless event
          return { status: "processing", message: "OpenRouter is transcribing the recording and preparing the SOAP draft." } if
            event.event_type == "recording_processing"

          { status: "failed", message: "The AI note could not be created. The saved recording is available for an explicit retry.",
            code: event.metadata["code"] }
        end

        def process!(recording:, actor:, provider: OpenRouter, capture_epoch: nil)
          authorize!(recording, actor)
          ensure_processable!(recording, actor:, capture_epoch:)
          ready = status(recording)
          return ready if ready[:status] == "ready"
          return availability unless provider.configured?

          audio = assembled_audio(recording, actor:, capture_epoch:)
          provider_inputs = Workflow.capture_provider_inputs!(encounter: recording.encounter, actor: actor)
          record_event!(recording, actor, "recording_processing", model: provider.model)
          result = provider.process(audio: audio, format: audio_format(recording.mime_type), duration_ms: recording.duration_ms,
            reviewer_context: provider_inputs[:reviewer_context], lab_reports: provider_inputs[:lab_reports])
          source = draft = nil
          Recording.transaction do
            recording.encounter.lock!
            recording.lock!
            ensure_processable!(recording, actor:, capture_epoch:)
            existing = source_for(recording)
            if existing
              source = existing
              draft = recording.encounter.drafts.where(source_id: source.id).order(:revision_number, :id).last
            else
              source_attributes = telehealth_source_attributes(recording)
              source = Workflow.ingest_transcript(encounter: recording.encounter, actor: actor,
                content: result.fetch(:transcript), metadata: { "duration_ms" => recording.duration_ms },
                trusted_metadata: {
                  "recording_id" => recording.id, "provider" => result.fetch(:provider),
                  "model" => result.fetch(:model), "model_version" => result.fetch(:model_version),
                  "capture_source" => recording.capture_source,
                  "telehealth_visit_id" => source_attributes[:telehealth_visit]&.id,
                  "capture_epoch" => source_attributes[:capture_epoch],
                  "recording_segment_index" => source_attributes[:recording_segment_index],
                  "source_order" => source_attributes[:source_order],
                  "source_set_digest" => source_attributes[:source_set_digest]
                }, trusted_source_attributes: source_attributes)
              unless recording.capture_source == "telehealth_mix"
                draft, = Workflow.generate_provider_draft!(encounter: recording.encounter, actor: actor,
                  source: source, sections: result.fetch(:sections),
                  uncertain_sections: result.fetch(:uncertain_sections), provider: result.fetch(:provider),
                  model: result.fetch(:model), model_version: result.fetch(:model_version),
                  prompt_digest: result.fetch(:prompt_digest),
                  expected_provider_input_digest: provider_inputs.fetch(:digest))
              end
              record_event!(recording, actor, "recording_processing_ready", source_id: source.id,
                draft_id: draft&.id, provider: result.fetch(:provider), model: result.fetch(:model),
                provider_request_id: result[:provider_request_id])
            end
          end
          message = recording.capture_source == "telehealth_mix" ?
            "The acknowledged transcript segment is ready. Generate the encounter draft from the ordered source set." :
            "Transcript and SOAP draft are ready for review."
          { status: "ready", message:, source_id: source.id, draft_id: draft&.id }
        rescue OpenRouter::Error => error
          record_failure(recording, actor, error.code,
            http_status: error.http_status, provider_code: error.provider_code)
        rescue ActiveRecord::StaleObjectError
          record_failure(recording, actor, "provider_inputs_changed")
        rescue ArgumentError => error
          record_failure(recording, actor, "recording_invalid")
        end

        private

        def assembled_audio(recording, actor:, capture_epoch:)
          ensure_processable!(recording, actor:, capture_epoch:)
          chunks = recording.chunks.where(status: "acknowledged").order(:sequence).to_a
          raise ArgumentError, "Recording chunks are incomplete." unless chunks.map(&:sequence) == (0...recording.total_chunks).to_a

          chunks.each_with_object(+"".b) do |chunk, audio|
            bytes = Base64.strict_decode64(chunk.content)
            raise ArgumentError, "A stored recording chunk failed its integrity check." unless
              ActiveSupport::SecurityUtils.secure_compare(Digest::SHA256.hexdigest(bytes), chunk.content_digest)
            audio << bytes
          end
        rescue ArgumentError
          raise ArgumentError, "The saved recording could not be assembled."
        end

        def ensure_processable!(recording, actor: nil, capture_epoch: nil)
          encounter = recording.encounter
          raise ArgumentError, "Only a completed recording can be transcribed." unless recording.status == "completed"
          raise ArgumentError, "The recording is incomplete." unless recording.total_chunks.to_i.positive? && recording.duration_ms.to_i.positive?
          if recording.capture_source == "telehealth_mix"
            Clinic::Telehealth::Scribe::ValidateCaptureEpoch.processing!(visit: recording.telehealth_visit,
              actor:, recording:, capture_epoch: capture_epoch || recording.capture_epoch)
            same_consent = encounter.consent_policy_version == recording.consent_policy_version &&
              encounter.consented_at == recording.consented_at
            unless same_consent
              raise Clinic::Telehealth::Error.new("Consent changed after this recording segment was captured.",
                code: "scribe_consent_not_current", status: :conflict)
            end
          else
            raise ArgumentError, "Current consent does not allow processing." unless encounter.processing_allowed?
            same_consent = encounter.consent_policy_version == recording.consent_policy_version &&
              encounter.consented_at == recording.consented_at
            raise ArgumentError, "Consent changed after this recording was made." unless same_consent
          end
        end

        def telehealth_source_attributes(recording)
          return {} unless recording.capture_source == "telehealth_mix"

          ordered = Clinic::Scribe::Recording.where(practice_id: recording.practice_id,
            telehealth_visit_id: recording.telehealth_visit_id, status: "completed")
            .order(:capture_epoch, :source_order, :id).map do |item|
              [ item.id, item.capture_epoch, item.recording_segment_index, item.source_order,
                item.total_chunks, item.total_bytes, item.duration_ms ]
            end
          {
            telehealth_visit: recording.telehealth_visit,
            telehealth_recording: recording,
            capture_epoch: recording.capture_epoch,
            recording_segment_index: recording.recording_segment_index,
            source_order: recording.source_order,
            source_set_digest: Digest::SHA256.hexdigest(ordered.flatten.join("\0"))
          }
        end

        def authorize!(recording, actor)
          Authorization.authorize!(actor: actor, practice: recording.practice, action: "scribe.write", site: recording.encounter.site)
          return if recording.capture_source == "telehealth_mix"

          raise Authorization::Denied, "Only the recording owner can process this recording." unless recording.created_by_id == actor.id
        end

        def source_for(recording)
          recording.encounter.sources.where(status: "ready").order(:id).detect do |source|
            source.source_metadata.to_h["recording_id"].to_i == recording.id
          end
        end

        def audio_format(mime_type)
          base_type = mime_type.to_s.split(";", 2).first
          { "audio/webm" => "webm", "audio/ogg" => "ogg", "audio/mp4" => "m4a" }.fetch(base_type)
        end

        def record_failure(recording, actor, code, details = {})
          metadata = { code: code }.merge(details).compact
          record_event!(recording, actor, "recording_processing_failed", metadata)
          Rails.logger.warn("scribe_recording_processing_failed recording_id=#{recording.id} " \
            "code=#{code} http_status=#{details[:http_status]} provider_code=#{details[:provider_code]}")
          { status: "failed", message: "The AI note could not be created. The saved recording is available for an explicit retry.", code: code }
        end

        def record_event!(recording, actor, event_type, metadata = {})
          Event.create!(practice: recording.practice, encounter: recording.encounter, actor: actor,
            event_type: event_type, resource_type: "Recording", resource_id: recording.id,
            metadata: metadata.compact, created_at: Time.current)
        end
      end
    end
  end
end
