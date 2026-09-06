require "test_helper"

class Clinic::Scribe::RecordingProcessorTest < ActiveSupport::TestCase
  setup do
    @actor = User.create!(email_address: "processor-#{SecureRandom.hex(5)}@example.invalid",
      password: "Recording-test-2026!")
    @practice = Clinic::Practice.create!(name: "Recording Processor Clinic", timezone: "UTC")
    membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(membership, "scribe.read", "scribe.write")
    @site = @practice.sites.create!(code: "PROC", name: "Processor site", status: "active")
    patient = @practice.patients.create!(display_name: "Synthetic Processor Patient", reference: "PROC-001")
    @encounter = Clinic::Scribe::Workflow.create_encounter(practice: @practice, actor: @actor,
      patient: patient, site: @site)
    Clinic::Scribe::Workflow.decide_consent(encounter: @encounter, actor: @actor, decision: "accepted")
    @recording = completed_recording("synthetic-webm-audio".b)
  end

  test "creates one source-grounded review draft and replays idempotently" do
    result = process_with_open_router

    assert_equal "ready", result[:status]
    source = @encounter.sources.find(result[:source_id])
    draft = @encounter.drafts.find(result[:draft_id])
    assert_equal @recording.id, source.source_metadata["recording_id"]
    assert_equal "openrouter", source.source_metadata["provider"]
    assert_equal "openrouter", draft.provider
    assert_equal "in_review", draft.status
    assert_equal Clinic::Scribe::Workflow::SECTIONS, draft.sections.order(:id).pluck(:section_key)
    assert draft.sections.all? { |section| section.status == "needs_review" }
    assert_includes draft.sections.find_by!(section_key: "assessment").warning_codes, "provider_uncertainty"

    counts = [@encounter.sources.count, @encounter.drafts.count, @encounter.documents.count]
    replay = Clinic::Scribe::RecordingProcessor.process!(recording: @recording, actor: @actor)
    assert_equal "ready", replay[:status]
    assert_equal counts, [@encounter.sources.count, @encounter.drafts.count, @encounter.documents.count]
  end

  test "keeps completed audio retryable after a provider failure" do
    failure = Clinic::Scribe::OpenRouter::Error.new("synthetic provider failure", code: "provider_rate_limited")
    result = Clinic::Scribe::RecordingProcessor.process!(recording: @recording, actor: @actor,
      provider: provider(error: failure))
    assert_equal "failed", result[:status]
    assert_equal "provider_rate_limited", result[:code]

    assert_equal "completed", @recording.reload.status
    assert_empty @encounter.sources
    assert_equal "failed", Clinic::Scribe::RecordingProcessor.status(@recording)[:status]

    retry_result = process_with_open_router
    assert_equal "ready", retry_result[:status]
    assert_equal 1, @encounter.sources.count
    assert_equal 1, @encounter.drafts.count
  end

  test "does not call a provider when OpenRouter is not configured" do
    result = Clinic::Scribe::RecordingProcessor.process!(recording: @recording, actor: @actor,
      provider: provider(configured: false))
    assert_equal "unavailable", result[:status]
    assert_empty @encounter.sources
  end

  private

  def process_with_open_router
    result = {
      transcript: "Patient reports synthetic knee discomfort. Clinician notes steady gait.",
      sections: {
        "subjective" => "Patient reports synthetic knee discomfort.",
        "objective" => "Clinician notes steady gait.",
        "assessment" => "",
        "plan" => ""
      },
      uncertain_sections: ["assessment"],
      provider: "openrouter",
      model: "synthetic/free-audio",
      model_version: "synthetic/free-audio",
      prompt_digest: Digest::SHA256.hexdigest("synthetic prompt"),
      provider_request_id: "synthetic-request"
    }
    Clinic::Scribe::RecordingProcessor.process!(recording: @recording, actor: @actor,
      provider: provider(result: result))
  end

  def provider(result: nil, error: nil, configured: true)
    Class.new do
      define_singleton_method(:configured?) { configured }
      define_singleton_method(:model) { "synthetic/free-audio" }
      define_singleton_method(:process) do |**|
        raise error if error
        result
      end
    end
  end

  def completed_recording(bytes)
    recording = Clinic::Scribe::RecordingCapture.create!(encounter: @encounter.reload, actor: @actor,
      idempotency_key: SecureRandom.uuid, expected_encounter_version: @encounter.lock_version,
      mime_type: "audio/webm;codecs=opus")
    Clinic::Scribe::RecordingCapture.append_chunk!(recording: recording, actor: @actor, sequence: 0,
      content: Base64.strict_encode64(bytes), digest: Digest::SHA256.hexdigest(bytes))
    Clinic::Scribe::RecordingCapture.finalize!(recording: recording, actor: @actor,
      total_chunks: 1, duration_ms: 1_000)
  end
end
