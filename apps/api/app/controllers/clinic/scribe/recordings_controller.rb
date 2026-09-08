module Clinic
  module Scribe
    class RecordingsController < Clinic::ApiController
      rescue_from RecordingCapture::Conflict do |error|
        render json: { error: error.message, code: "recording_conflict" }, status: :conflict
      end

      def index
        encounter = scoped_encounter
        authorize_encounter!(encounter, "scribe.read")
        recordings = Recording.where(practice_id: current_practice.id, encounter_id: encounter.id)
          .order(created_at: :desc, id: :desc).limit(25)
        render json: payload(recordings: recordings.map { |recording| serialize(recording) })
      end

      def show
        recording = scoped_recording
        authorize_encounter!(recording.encounter, "scribe.read")
        render json: payload(recording: serialize(recording), transcription: RecordingProcessor.status(recording))
      end

      def create
        encounter = scoped_encounter
        input = parameter_hash!(:recording, %i[idempotency_key expected_encounter_version mime_type
          telehealth_visit_public_id capture_owner_participant_id capture_epoch capture_source
          recording_segment_index source_order])
        capture = telehealth_capture_authority
        telehealth_visit = if input[:telehealth_visit_public_id].present?
          Clinic::Telehealth::Visit.find_by!(practice_id: current_practice.id,
            public_id: input[:telehealth_visit_public_id])
        end
        recording = RecordingCapture.create!(encounter:, actor: current_user,
          idempotency_key: required_string!(input[:idempotency_key], field: :idempotency_key, maximum: 120),
          expected_encounter_version: bounded_integer!(input[:expected_encounter_version], field: :expected_encounter_version,
            min: 0, max: 2_147_483_647),
          mime_type: required_string!(input[:mime_type], field: :mime_type, maximum: 100),
          telehealth_visit:, capture_owner_participant_id: optional_id(input[:capture_owner_participant_id],
            :capture_owner_participant_id), capture_epoch: optional_integer(input[:capture_epoch], :capture_epoch),
          owner_token: capture[:owner_token], capture_source: input[:capture_source].presence || "microphone",
          recording_segment_index: optional_integer(input[:recording_segment_index], :recording_segment_index),
          source_order: optional_integer(input[:source_order], :source_order))
        render json: payload(recording: serialize(recording)), status: :created
      end

      def chunk
        recording = scoped_recording
        input = parameter_hash!(:chunk, %i[sequence content digest])
        accepted = RecordingCapture.append_chunk!(recording:, actor: current_user,
          sequence: bounded_integer!(input[:sequence], field: :sequence, min: 0, max: RecordingCapture::MAX_CHUNKS - 1),
          content: required_string!(input[:content], field: :content,
            maximum: ((RecordingCapture::MAX_CHUNK_BYTES + 2) / 3) * 4),
          digest: required_string!(input[:digest], field: :digest, maximum: 64),
          **capture_arguments(recording))
        render json: payload(recording: serialize(recording.reload), chunk: {
          sequence: accepted.sequence, digest: accepted.content_digest, byte_size: accepted.byte_size,
          status: "acknowledged"
        }, next_sequence: accepted.sequence + 1)
      end

      def finalize
        recording = scoped_recording
        input = parameter_hash!(:recording, %i[total_chunks duration_ms defer_processing])
        completed = RecordingCapture.finalize!(recording:, actor: current_user,
          total_chunks: bounded_integer!(input[:total_chunks], field: :total_chunks, min: 1,
            max: RecordingCapture::MAX_CHUNKS),
          duration_ms: bounded_integer!(input[:duration_ms], field: :duration_ms, min: 1,
            max: RecordingCapture::MAX_DURATION_MS), **capture_arguments(recording))
        defer_processing = input[:defer_processing] == true
        unless !defer_processing || completed.capture_source == "telehealth_mix"
          raise ArgumentError, "Deferred processing is available only for an in-call Scribe segment."
        end
        transcription = defer_processing ? RecordingProcessor.availability :
          RecordingProcessor.process!(recording: completed, actor: current_user)
        render json: payload(recording: serialize(completed.reload), transcription: transcription)
      end

      def transcribe
        recording = scoped_recording
        transcription = RecordingProcessor.process!(recording: recording, actor: current_user,
          capture_epoch: capture_arguments(recording)[:capture_epoch])
        render json: payload(recording: serialize(recording.reload), transcription: transcription)
      end

      def interrupt
        recording = scoped_recording
        render json: payload(recording: serialize(RecordingCapture.interrupt!(recording:, actor: current_user,
          **capture_arguments(recording))))
      end

      def cancel
        recording = scoped_recording
        render json: payload(recording: serialize(RecordingCapture.cancel!(recording:, actor: current_user,
          **capture_arguments(recording))))
      end

      private

      def scoped_encounter
        current_practice.scribe_encounters.find(requested_id!(params[:encounter_id], :encounter_id))
      end

      def scoped_recording
        Recording.where(practice_id: current_practice.id).includes(:encounter).find(requested_id!(params[:id], :id))
      end

      def authorize_encounter!(encounter, action)
        Authorization.authorize!(actor: current_user, practice: current_practice, action:, site: encounter.site)
      end

      def payload(**values)
        values[:transcription] ||= RecordingProcessor.availability
        values.merge(limits: RecordingCapture.limits)
      end

      def serialize(recording)
        {
          id: recording.id, encounter_id: recording.encounter_id, status: recording.status,
          mime_type: recording.mime_type, total_bytes: recording.total_bytes,
          acknowledged_chunks: recording.chunks.where(status: "acknowledged").count,
          total_chunks: recording.total_chunks, duration_ms: recording.duration_ms,
          created_at: recording.created_at.iso8601(6), completed_at: recording.completed_at&.iso8601(6),
          interrupted_at: recording.interrupted_at&.iso8601(6), cancelled_at: recording.cancelled_at&.iso8601(6),
          owned_by_current_user: recording.created_by_id == current_user.id,
          recoverable: recording.status.in?(%w[recording interrupted]),
          capture_source: recording.capture_source,
          telehealth_visit_id: recording.telehealth_visit_id,
          capture_epoch: recording.capture_epoch,
          recording_segment_index: recording.try(:recording_segment_index),
          source_order: recording.try(:source_order)
        }
      end

      def telehealth_capture_authority
        return {} unless params[:telehealth_capture].present?

        parameter_hash!(:telehealth_capture,
          %i[visit_public_id capture_owner_participant_id capture_epoch owner_token])
      end

      def capture_arguments(recording)
        return {} unless recording.capture_source == "telehealth_mix"

        input = telehealth_capture_authority
        {
          capture_epoch: bounded_integer!(input[:capture_epoch], field: :capture_epoch, min: 1,
            max: 2_147_483_647),
          owner_token: optional_string(input[:owner_token], field: :owner_token, maximum: 256)
        }
      end

      def optional_integer(value, field)
        value.nil? ? nil : bounded_integer!(value, field:, min: 0, max: 2_147_483_647)
      end

      def sensitive_read_action
        return "scribe.read" if %w[index show].include?(action_name)
        super
      end
    end
  end
end
