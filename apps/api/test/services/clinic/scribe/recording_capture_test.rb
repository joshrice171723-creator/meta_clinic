require "test_helper"

class Clinic::Scribe::RecordingCaptureTest < ActiveSupport::TestCase
  setup do
    @actor = User.create!(email_address: "recording-#{SecureRandom.hex(5)}@example.invalid", password: "Recording-test-2026!")
    @practice = Clinic::Practice.create!(name: "Recording Capture Clinic", timezone: "UTC")
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "scribe.read", "scribe.write")
    @site = @practice.sites.create!(code: "REC", name: "Recording site", status: "active")
    @patient = @practice.patients.create!(display_name: "Synthetic Recording Patient", reference: "REC-001")
    @encounter = Clinic::Scribe::Workflow.create_encounter(practice: @practice, actor: @actor,
      patient: @patient, site: @site)
    Clinic::Scribe::Workflow.decide_consent(encounter: @encounter, actor: @actor, decision: "accepted")
    @encounter.reload
  end

  test "create and chunk retries are idempotent while mismatched sequence content conflicts" do
    recording = create_recording(key: "same-create")
    assert_equal recording.id, create_recording(key: "same-create").id

    accepted = append(recording, sequence: 0, bytes: "synthetic-audio-one".b)
    replay = append(recording, sequence: 0, bytes: "synthetic-audio-one".b)
    assert_equal accepted.id, replay.id
    assert_equal 1, recording.chunks.count
    assert_equal accepted.byte_size, recording.reload.total_bytes

    assert_raises(Clinic::Scribe::RecordingCapture::Conflict) do
      append(recording, sequence: 0, bytes: "different-synthetic-audio".b)
    end
  end

  test "finalize rejects gaps and exact finalization replay is idempotent" do
    recording = create_recording
    append(recording, sequence: 1, bytes: "second".b)
    error = assert_raises(ArgumentError) do
      Clinic::Scribe::RecordingCapture.finalize!(recording: recording, actor: @actor, total_chunks: 2, duration_ms: 2_000)
    end
    assert_includes error.message, "incomplete"

    append(recording, sequence: 0, bytes: "first".b)
    completed = Clinic::Scribe::RecordingCapture.finalize!(recording: recording, actor: @actor,
      total_chunks: 2, duration_ms: 2_000)
    replay = Clinic::Scribe::RecordingCapture.finalize!(recording: recording, actor: @actor,
      total_chunks: 2, duration_ms: 2_000)
    assert_equal "completed", completed.status
    assert_equal completed.id, replay.id
    assert_raises(Clinic::Scribe::RecordingCapture::Conflict) do
      Clinic::Scribe::RecordingCapture.finalize!(recording: recording, actor: @actor,
        total_chunks: 2, duration_ms: 2_001)
    end
  end

  test "withdrawal and later reacceptance cannot revive the old consent epoch" do
    recording = create_recording
    Clinic::Scribe::Workflow.decide_consent(encounter: @encounter, actor: @actor, decision: "withdrawn")
    assert_raises(ArgumentError) { append(recording, sequence: 0, bytes: "late".b) }

    Clinic::Scribe::Workflow.decide_consent(encounter: @encounter, actor: @actor, decision: "accepted")
    error = assert_raises(ArgumentError) { append(recording, sequence: 0, bytes: "still-late".b) }
    assert_includes error.message, "Consent changed"
  end

  test "a different authorized user cannot mutate another actor's recording" do
    recording = create_recording
    other = User.create!(email_address: "other-recording-#{SecureRandom.hex(5)}@example.invalid", password: "Recording-test-2026!")
    other_membership = @practice.memberships.create!(user: other)
    grant_permissions!(other_membership, "scribe.read", "scribe.write")

    assert_raises(Clinic::Authorization::Denied) do
      Clinic::Scribe::RecordingCapture.interrupt!(recording: recording, actor: other)
    end
    assert_equal "recording", recording.reload.status

    foreign_practice = Clinic::Practice.create!(name: "Foreign Recording Clinic", timezone: "UTC")
    foreign_actor = User.create!(email_address: "foreign-recording-#{SecureRandom.hex(5)}@example.invalid",
      password: "Recording-test-2026!")
    foreign_membership = foreign_practice.memberships.create!(user: foreign_actor)
    grant_permissions!(foreign_membership, "scribe.read", "scribe.write")
    assert_raises(Clinic::Authorization::Denied) do
      Clinic::Scribe::RecordingCapture.interrupt!(recording: recording, actor: foreign_actor)
    end
    assert_equal "recording", recording.reload.status
  end

  test "cancel scrubs encrypted chunk content and size boundaries fail before persistence" do
    recording = create_recording
    chunk = append(recording, sequence: 0, bytes: "protected-synthetic-audio".b)
    ciphertext = ApplicationRecord.connection.select_value(
      "SELECT content FROM clinic_scribe_recording_chunks WHERE id = #{Integer(chunk.id)}"
    )
    assert_not_includes ciphertext, "protected-synthetic-audio"

    Clinic::Scribe::RecordingCapture.cancel!(recording: recording, actor: @actor)
    assert_equal "cancelled", recording.reload.status
    assert_equal "scrubbed", chunk.reload.status
    assert_nil chunk.content
    assert_nil ApplicationRecord.connection.select_value(
      "SELECT content FROM clinic_scribe_recording_chunks WHERE id = #{Integer(chunk.id)}"
    )

    oversized = create_recording(key: "oversized")
    bytes = "a" * (Clinic::Scribe::RecordingCapture::MAX_CHUNK_BYTES + 1)
    assert_raises(ArgumentError) { append(oversized, sequence: 0, bytes: bytes) }
    assert_empty oversized.chunks
  end

  private

  def create_recording(key: SecureRandom.uuid)
    Clinic::Scribe::RecordingCapture.create!(encounter: @encounter, actor: @actor, idempotency_key: key,
      expected_encounter_version: @encounter.reload.lock_version, mime_type: "audio/webm;codecs=opus")
  end

  def append(recording, sequence:, bytes:)
    Clinic::Scribe::RecordingCapture.append_chunk!(recording: recording, actor: @actor, sequence: sequence,
      content: Base64.strict_encode64(bytes), digest: Digest::SHA256.hexdigest(bytes))
  end
end
