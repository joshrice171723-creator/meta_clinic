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
        render json: payload(recording: serialize(recording))
      end

      def create
        encounter = scoped_encounter
        input = parameter_hash!(:recording, %i[idempotency_key expected_encounter_version mime_type])
        recording = RecordingCapture.create!(encounter:, actor: current_user,
          idempotency_key: required_string!(input[:idempotency_key], field: :idempotency_key, maximum: 120),
          expected_encounter_version: bounded_integer!(input[:expected_encounter_version], field: :expected_encounter_version,
            min: 0, max: 2_147_483_647),
          mime_type: required_string!(input[:mime_type], field: :mime_type, maximum: 100))
        render json: payload(recording: serialize(recording)), status: :created
      end

      def chunk
        recording = scoped_recording
        input = parameter_hash!(:chunk, %i[sequence content digest])
        accepted = RecordingCapture.append_chunk!(recording:, actor: current_user,
          sequence: bounded_integer!(input[:sequence], field: :sequence, min: 0, max: RecordingCapture::MAX_CHUNKS - 1),
          content: required_string!(input[:content], field: :content,
            maximum: ((RecordingCapture::MAX_CHUNK_BYTES + 2) / 3) * 4),
          digest: required_string!(input[:digest], field: :digest, maximum: 64))
        render json: payload(recording: serialize(recording.reload), chunk: {
          sequence: accepted.sequence, digest: accepted.content_digest, byte_size: accepted.byte_size,
          status: "acknowledged"
        }, next_sequence: accepted.sequence + 1)
      end

      def finalize
        recording = scoped_recording
        input = parameter_hash!(:recording, %i[total_chunks duration_ms])
        completed = RecordingCapture.finalize!(recording:, actor: current_user,
          total_chunks: bounded_integer!(input[:total_chunks], field: :total_chunks, min: 1,
            max: RecordingCapture::MAX_CHUNKS),
          duration_ms: bounded_integer!(input[:duration_ms], field: :duration_ms, min: 1,
            max: RecordingCapture::MAX_DURATION_MS))
        render json: payload(recording: serialize(completed))
      end

      def interrupt
        render json: payload(recording: serialize(RecordingCapture.interrupt!(recording: scoped_recording, actor: current_user)))
      end

      def cancel
        render json: payload(recording: serialize(RecordingCapture.cancel!(recording: scoped_recording, actor: current_user)))
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
        values.merge(limits: RecordingCapture.limits, transcription: {
          status: "unavailable", message: "Transcription is unavailable until a transcription provider is configured."
        })
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
          recoverable: recording.status.in?(%w[recording interrupted])
        }
      end

      def sensitive_read_action
        return "scribe.read" if %w[index show].include?(action_name)
        super
      end
    end
  end
end
