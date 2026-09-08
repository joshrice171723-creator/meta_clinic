require "base64"
require "digest"

module Clinic
  module Scribe
    class RecordingCapture
      class Conflict < StandardError; end

      MAX_CHUNK_BYTES = 512.kilobytes
      MAX_TOTAL_BYTES = 30.megabytes
      MAX_DURATION_MS = 30.minutes.in_milliseconds
      MAX_CHUNKS = 500
      MIME_TYPES = %w[audio/webm audio/ogg audio/mp4].freeze

      class << self
        def limits
          {
            max_chunk_bytes: MAX_CHUNK_BYTES,
            max_total_bytes: MAX_TOTAL_BYTES,
            max_duration_ms: MAX_DURATION_MS,
            max_chunks: MAX_CHUNKS,
            chunk_interval_ms: 4_000
          }
        end

        def create!(encounter:, actor:, idempotency_key:, expected_encounter_version:, mime_type:,
          telehealth_visit: nil, capture_owner_participant_id: nil, capture_epoch: nil,
          owner_token: nil, capture_source: "microphone", recording_segment_index: nil, source_order: nil)
          authorize!(encounter, actor)
          key = idempotency_key.to_s.strip
          raise ArgumentError, "Recording request key is required." if key.blank? || key.bytesize > 120
          mime_type = normalize_mime_type(mime_type)
          capture_source = capture_source.to_s
          if capture_source == "telehealth_mix"
            raise ArgumentError, "The telehealth visit is required for mixed call audio." unless telehealth_visit
            Clinic::Telehealth::Scribe::ValidateCaptureEpoch.call(visit: telehealth_visit, actor:,
              capture_epoch:, owner_token:)
            unless telehealth_visit.scribe_encounter_id == encounter.id &&
                telehealth_visit.scribe_capture_owner_participant_id == capture_owner_participant_id.to_i
              raise ArgumentError, "The Scribe recording is not bound to this visit and capture owner."
            end
            recording_segment_index = Integer(recording_segment_index, exception: false)
            source_order = Integer(source_order, exception: false)
            unless recording_segment_index && recording_segment_index >= 0
              raise ArgumentError, "The recording segment index is invalid."
            end
            raise ArgumentError, "The recording source order is invalid." unless source_order&.positive?
          elsif capture_source != "microphone" || [ telehealth_visit, capture_owner_participant_id, capture_epoch,
              owner_token, recording_segment_index, source_order ].any?(&:present?)
            raise ArgumentError, "Telehealth capture provenance is valid only for mixed call audio."
          end
          expected_version = Integer(expected_encounter_version, exception: false)
          raise ArgumentError, "Expected encounter version is required." unless expected_version&.between?(0, 2_147_483_647)

          recording = nil
          persist = proc do
            encounter.with_lock do
              ensure_processing_allowed!(encounter)
              raise ActiveRecord::StaleObjectError.new(encounter, "create") unless encounter.lock_version == expected_version
              request_digest = request_digest(encounter:, actor:, mime_type:, expected_version:,
                telehealth_visit:, capture_epoch:, recording_segment_index:, source_order:)
              recording = Recording.find_by(practice_id: encounter.practice_id, idempotency_key: key)
              if recording
                raise Conflict, "That recording request key was already used for different recording data." unless
                  recording.request_digest == request_digest && recording.encounter_id == encounter.id && recording.created_by_id == actor.id
                next
              end

              recording = Recording.create!(practice: encounter.practice, encounter:, created_by: actor,
                idempotency_key: key, request_digest:, mime_type:, status: "recording",
                consent_policy_version: encounter.consent_policy_version, consented_at: encounter.consented_at,
                expected_encounter_version: expected_version, capture_source:,
                telehealth_visit:, capture_owner_participant_id:, capture_epoch:,
                recording_segment_index:, source_order:)
              record_event!(recording, actor, "recording_started",
                telehealth_visit_id: telehealth_visit&.id, capture_owner_participant_id:,
                capture_epoch:, recording_segment_index:, source_order:, capture_source:)
            end
          end
          if telehealth_visit
            telehealth_visit.with_lock do
              Clinic::Telehealth::Scribe::ValidateCaptureEpoch.call(visit: telehealth_visit, actor:,
                capture_epoch:, owner_token:)
              unless telehealth_visit.scribe_encounter_id == encounter.id &&
                  telehealth_visit.scribe_capture_owner_participant_id == capture_owner_participant_id.to_i
                raise ArgumentError, "The Scribe recording is not bound to this visit and capture owner."
              end
              persist.call
            end
          else
            persist.call
          end
          recording.reload
        rescue ActiveRecord::RecordNotUnique
          retry_record = Recording.find_by!(practice_id: encounter.practice_id, idempotency_key: key)
          expected_digest = request_digest(encounter:, actor:, mime_type:, expected_version:,
            telehealth_visit:, capture_epoch:, recording_segment_index:, source_order:)
          raise Conflict, "That recording request key was already used for different recording data." unless
            retry_record.request_digest == expected_digest && retry_record.encounter_id == encounter.id && retry_record.created_by_id == actor.id
          retry_record
        end

        def append_chunk!(recording:, actor:, sequence:, content:, digest:, capture_epoch: nil, owner_token: nil)
          authorize_recording!(recording, actor)
          sequence = Integer(sequence, exception: false)
          raise ArgumentError, "Chunk sequence is invalid." unless sequence&.between?(0, MAX_CHUNKS - 1)
          supplied_digest = digest.to_s.downcase
          raise ArgumentError, "Chunk digest is invalid." unless supplied_digest.match?(/\A[0-9a-f]{64}\z/)
          encoded = content.to_s
          max_encoded_bytes = ((MAX_CHUNK_BYTES + 2) / 3) * 4
          raise ArgumentError, "The recording chunk is too large." if encoded.bytesize > max_encoded_bytes
          bytes = Base64.strict_decode64(encoded)
          raise ArgumentError, "The recording chunk is empty." if bytes.empty?
          raise ArgumentError, "The recording chunk is too large." if bytes.bytesize > MAX_CHUNK_BYTES
          actual_digest = Digest::SHA256.hexdigest(bytes)
          raise ArgumentError, "The recording chunk digest does not match its content." unless
            ActiveSupport::SecurityUtils.secure_compare(actual_digest, supplied_digest)

          chunk = nil
          with_capture_fence(recording, actor, capture_epoch:, owner_token:) do
            recording.encounter.with_lock do
              recording.lock!
              ensure_consent_epoch!(recording)
              existing = recording.chunks.find_by(sequence: sequence)
              if existing
                raise Conflict, "That chunk sequence was already acknowledged with different content." unless
                  existing.status == "acknowledged" && existing.content_digest == actual_digest && existing.byte_size == bytes.bytesize
                chunk = existing
                next
              end
              raise ArgumentError, "This recording no longer accepts chunks." unless recording.status == "recording"
              raise ArgumentError, "The recording has reached its chunk limit." if recording.chunks.count >= MAX_CHUNKS
              raise ArgumentError, "The recording is too large." if recording.total_bytes + bytes.bytesize > MAX_TOTAL_BYTES
              chunk = recording.chunks.create!(practice: recording.practice, sequence:, status: "acknowledged",
                content: Base64.strict_encode64(bytes), content_digest: actual_digest, byte_size: bytes.bytesize,
                acknowledged_at: Time.current)
              recording.update!(total_bytes: recording.total_bytes + bytes.bytesize)
            end
          end
          chunk
        rescue ArgumentError => error
          raise error unless error.message == "invalid base64"
          raise ArgumentError, "The recording chunk content is not valid base64."
        end

        def finalize!(recording:, actor:, total_chunks:, duration_ms:, capture_epoch: nil, owner_token: nil)
          authorize_recording!(recording, actor)
          total_chunks = Integer(total_chunks, exception: false)
          duration_ms = Integer(duration_ms, exception: false)
          raise ArgumentError, "A completed recording must contain at least one chunk." unless total_chunks&.between?(1, MAX_CHUNKS)
          raise ArgumentError, "Recording duration is invalid." unless duration_ms&.between?(1, MAX_DURATION_MS)

          with_capture_fence(recording, actor, capture_epoch:, owner_token:) do
            recording.encounter.with_lock do
              recording.lock!
              ensure_consent_epoch!(recording)
              if recording.status == "completed"
                raise Conflict, "This recording was already finalized with different totals." unless
                  recording.total_chunks == total_chunks && recording.duration_ms == duration_ms
                return recording
              end
              raise ArgumentError, "This recording cannot be finalized." unless recording.status == "recording"
              sequences = recording.chunks.where(status: "acknowledged").order(:sequence).pluck(:sequence)
              raise ArgumentError, "Recording chunks are incomplete. Retry missing uploads before stopping." unless
                sequences == (0...total_chunks).to_a
              recording.update!(status: "completed", total_chunks:, duration_ms:, completed_at: Time.current,
                interrupted_at: nil)
              record_event!(recording, actor, "recording_completed", total_chunks:, duration_ms:,
                total_bytes: recording.total_bytes)
            end
          end
          recording.reload
        end

        def interrupt!(recording:, actor:, capture_epoch: nil, owner_token: nil, bypass_capture_fence: false)
          authorize_recording!(recording, actor)
          operation = proc do
            recording.encounter.with_lock do
              recording.with_lock do
                return recording unless recording.status == "recording"
                recording.update!(status: "interrupted", interrupted_at: Time.current)
                record_event!(recording, actor, "recording_interrupted", acknowledged_chunks: recording.chunks.count)
              end
            end
          end
          bypass_capture_fence ? operation.call :
            with_capture_fence(recording, actor, capture_epoch:, owner_token:, &operation)
          recording.reload
        end

        # A transfer cannot recreate audio that never reached the server. It can,
        # however, seal one contiguous set of acknowledged chunks so the new
        # owner can process that durable evidence without accepting another
        # write from the stale capture epoch.
        def reconcile_interrupted!(recording:, actor:)
          authorize!(recording.encounter, actor)
          recording.encounter.with_lock do
            recording.with_lock do
              return recording.reload if recording.status == "completed"
              return recording.reload if recording.status == "cancelled"

              sequences = recording.chunks.where(status: "acknowledged").order(:sequence).pluck(:sequence)
              contiguous = sequences.present? && sequences == (0...sequences.length).to_a
              unless contiguous
                recording.update!(status: "interrupted", interrupted_at: recording.interrupted_at || Time.current)
                record_event!(recording, actor, "recording_reconciliation_incomplete",
                  acknowledged_chunks: sequences.length)
                return recording.reload
              end

              estimated_duration = [ sequences.length * limits.fetch(:chunk_interval_ms), MAX_DURATION_MS ].min
              recording.update!(status: "completed", total_chunks: sequences.length,
                duration_ms: [ estimated_duration, 1 ].max, completed_at: Time.current, interrupted_at: nil)
              record_event!(recording, actor, "recording_reconciled",
                acknowledged_chunks: sequences.length, duration_estimated: true)
            end
          end
          recording.reload
        end

        def cancel!(recording:, actor:, capture_epoch: nil, owner_token: nil)
          authorize_recording!(recording, actor)
          with_capture_fence(recording, actor, capture_epoch:, owner_token:) do
            recording.encounter.with_lock { scrub_recording!(recording, actor: actor) }
          end
        end

        def scrub_for_encounter!(encounter)
          Recording.where(practice_id: encounter.practice_id, encounter_id: encounter.id).find_each do |recording|
            scrub_recording!(recording, actor: nil)
          end
        end

        private

        def scrub_recording!(recording, actor:)
          recording.with_lock do
            return recording if recording.status == "cancelled" && recording.chunks.where.not(status: "scrubbed").none?
            recording.chunks.where.not(status: "scrubbed").find_each do |chunk|
              chunk.update!(content: nil, status: "scrubbed")
            end
            recording.update!(status: "cancelled", cancelled_at: recording.cancelled_at || Time.current,
              interrupted_at: nil)
            record_event!(recording, actor, "recording_cancelled", content: "scrubbed") if actor
          end
          recording.reload
        end

        def authorize!(encounter, actor)
          Authorization.authorize!(actor:, practice: encounter.practice, action: "scribe.write", site: encounter.site)
        end

        def authorize_recording!(recording, actor)
          authorize!(recording.encounter, actor)
          raise Authorization::Denied, "Only the recording owner can change this recording." unless recording.created_by_id == actor.id
        end

        def ensure_processing_allowed!(encounter)
          raise ArgumentError, "Accepted recording consent is required." unless encounter.processing_allowed?
          raise ArgumentError, "The accepted consent record is incomplete." if encounter.consent_policy_version.blank? || encounter.consented_at.nil?
        end

        def ensure_consent_epoch!(recording)
          encounter = recording.encounter
          ensure_processing_allowed!(encounter)
          same_epoch = encounter.consent_policy_version == recording.consent_policy_version &&
            encounter.consented_at == recording.consented_at
          raise ArgumentError, "Consent changed after this recording started. Start a new recording." unless same_epoch
        end

        def normalize_mime_type(value)
          mime_type = value.to_s.split(";", 2).first.to_s.downcase.strip
          raise ArgumentError, "This browser recording format is not supported." unless MIME_TYPES.include?(mime_type)
          mime_type
        end

        def request_digest(encounter:, actor:, mime_type:, expected_version:, telehealth_visit: nil,
          capture_epoch: nil, recording_segment_index: nil, source_order: nil)
          Digest::SHA256.hexdigest([
            encounter.practice_id, encounter.id, actor.id, mime_type, expected_version,
            encounter.consent_policy_version, encounter.consented_at&.iso8601(6), telehealth_visit&.id,
            capture_epoch, recording_segment_index, source_order
          ].join("\0"))
        end

        def validate_telehealth_capture!(recording, actor, capture_epoch:, owner_token:)
          return unless recording.capture_source == "telehealth_mix"

          Clinic::Telehealth::Scribe::ValidateCaptureEpoch.call(visit: recording.telehealth_visit,
            actor:, capture_epoch:, owner_token:, recording:)
        end

        def with_capture_fence(recording, actor, capture_epoch:, owner_token:)
          return yield unless recording.capture_source == "telehealth_mix"

          recording.telehealth_visit.with_lock do
            validate_telehealth_capture!(recording, actor, capture_epoch:, owner_token:)
            yield
          end
        end

        def record_event!(recording, actor, event_type, metadata = {})
          Event.create!(practice: recording.practice, encounter: recording.encounter, actor: actor || recording.created_by,
            event_type:, resource_type: "Recording", resource_id: recording.id, metadata:, created_at: Time.current)
        end
      end
    end
  end
end
