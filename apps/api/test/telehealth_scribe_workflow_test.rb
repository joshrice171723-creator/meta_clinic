require "test_helper"
require_relative "support/scribe_template_helpers"

class TelehealthScribeWorkflowTest < ActiveSupport::TestCase
  include ScribeTemplateHelpers

  PASSWORD = "Telehealth-scribe-2026!".freeze

  setup do
    @practice = Clinic::Practice.create!(name: "Telehealth Scribe Clinic", timezone: "UTC")
    @host = create_user("host")
    @second_clinician = create_user("second")
    @patient_user = create_user("patient")
    @host_membership = @practice.memberships.create!(user: @host)
    @second_membership = @practice.memberships.create!(user: @second_clinician)
    @host_access_grant = grant_permissions!(@host_membership,
      "telehealth.host", "telehealth.participate", "scribe.read", "patients.read", "notes.read", "notes.write")
    @host_scribe_grant = grant_permissions!(@host_membership,
      "scribe.write", "scribe.approve", "scribe.export")
    grant_permissions!(@second_membership,
      "telehealth.host", "telehealth.participate", "scribe.read", "patients.read", "notes.read", "notes.write")
    @second_scribe_grant = grant_permissions!(@second_membership,
      "scribe.write", "scribe.approve", "scribe.export")
    @site = @practice.sites.create!(code: "THS", name: "Telehealth Scribe Site", status: "active")
    @patient = @practice.patients.create!(display_name: "Synthetic Scribe Patient", reference: "THS-001")
    create_scribe_template_catalog!
    @portal_identity = Clinic::PatientPortal::Identity.create!(practice: @practice, patient: @patient,
      user: @patient_user, status: "active", invited_at: 2.minutes.ago, activated_at: 1.minute.ago)
    @settings = Clinic::Telehealth::Setting.create!(practice: @practice, updated_by_membership: @host_membership,
      provider_code: "daily", provider_account_ref: "test-account", enabled: true, health_status: "ready")
    @policy = @settings.policy_versions.create!(practice: @practice, version: 1, status: "published",
      consent_title: "Video visit consent", consent_body: "Allow treatment by video.",
      content_digest: Digest::SHA256.hexdigest("video consent v1"), locale: "en-US",
      patient_instructions: "Join from a private location.", support_label: "Clinic support",
      join_early_minutes: 15, join_late_minutes: 30, max_room_minutes: 60, grant_ttl_seconds: 120,
      checkin_max_age_minutes: 120, allow_audio_only: true, allow_staff_screen_share: false,
      scribe_enabled: true, require_location: true, require_callback: true,
      scribe_consent_title: "Optional Scribe recording",
      scribe_consent_body: "Allow this visit audio to be recorded and processed for a draft note.",
      scribe_consent_digest: Digest::SHA256.hexdigest("scribe consent v1"),
      created_by_membership: @host_membership, published_by_membership: @host_membership,
      published_at: 1.minute.ago)
    @settings.update!(active_policy_version: @policy)
    @appointment = @practice.appointments.create!(patient: @patient, site: @site,
      starts_at: 5.minutes.ago, ends_at: 55.minutes.from_now, status: "confirmed", visit_modality: "video")
    @clinical_encounter = @practice.encounters.create!(patient: @patient, appointment: @appointment,
      site: @site, started_at: 5.minutes.ago, status: "in_progress")
    @visit = Clinic::Telehealth::Visit.create!(practice: @practice, patient: @patient,
      appointment: @appointment, encounter: @clinical_encounter, policy_version: @policy,
      status: "in_progress", access_generation: 1, first_started_at: 5.minutes.ago,
      created_by_membership: @host_membership)
    @host_participant = admitted_staff(@visit, @host_membership, "clinician")
    @second_participant = admitted_staff(@visit, @second_membership, "assistant")
    @patient_participant = @visit.participants.create!(practice: @practice, role: "patient",
      portal_identity: @portal_identity, status: "admitted", admitted_by_membership: @host_membership,
      admitted_at: 1.minute.ago, admitted_generation: 1)
    [@host_participant, @second_participant, @patient_participant].each { |participant| accept_treatment(participant) }
  end

  test "exact binding and separate current participant consent gate capture" do
    requested = request_scribe
    assert_equal @clinical_encounter.id, requested.scribe_encounter.clinical_encounter_id
    assert_equal @patient.id, requested.scribe_encounter.patient_id
    assert_equal "pending", scribe_snapshot[:state]

    error = assert_raises(Clinic::Telehealth::Error) { claim(@host, "premature-claim") }
    assert_equal "scribe_consent_required", error.code

    record_scribe_consent(@host, @host_participant, "accepted")
    assert_equal "pending", scribe_snapshot[:state]
    record_scribe_consent(@patient_user, @patient_participant, "accepted", portal_identity: @portal_identity)
    assert_equal "pending", scribe_snapshot[:state]
    record_scribe_consent(@second_clinician, @second_participant, "accepted")
    assert_equal "accepted", scribe_snapshot[:state]

    capture = claim(@host, "complete-claim")
    assert capture.owner_token.present?
    assert_not_equal capture.owner_token, capture.visit.scribe_capture_owner_token_digest
    assert_equal @host_participant.id, capture.visit.scribe_capture_owner_participant_id
    assert_operator capture.visit.scribe_capture_epoch, :>, 0
    assert_operator capture.visit.scribe_capture_lease_expires_at, :>, Time.current
    lease_before_renew = capture.visit.scribe_capture_lease_expires_at
    renewed = Clinic::Telehealth::Scribe::RenewScribeCapture.call(visit: @visit.reload, actor: @host,
      request_key: "renew-#{SecureRandom.hex(5)}", expected_version: @visit.lock_version,
      capture_epoch: @visit.scribe_capture_epoch, owner_token: capture.owner_token)
    assert_operator renewed.scribe_capture_lease_expires_at, :>, lease_before_renew
    context = Clinic::Telehealth::Scribe::ScribeContext.call(visit: @visit.reload, actor: @host)
    assert_not context.fetch(:capture).key?(:owner_token)
    assert_raises(Clinic::Telehealth::Error) do
      Clinic::Telehealth::Scribe::RenewScribeCapture.call(visit: @visit.reload, actor: @host,
        request_key: "wrong-token-#{SecureRandom.hex(5)}", expected_version: @visit.lock_version,
        capture_epoch: @visit.scribe_capture_epoch, owner_token: "wrong-owner-token")
    end

    foreign_visit = create_foreign_bound_visit
    foreign_capture = fully_consent_and_claim(foreign_visit)
    assert_raises(ArgumentError) do
      create_recording(visit: foreign_visit, encounter: @visit.scribe_encounter, actor: @host,
        participant: foreign_visit.participants.find_by!(membership_id: @host_membership.id),
        capture: foreign_capture, segment_index: 0, source_order: 1)
    end
  end

  test "takeover and permission revocation fence every stale writer while preserving acknowledged evidence" do
    request_scribe
    accept_all_scribe
    first_capture = claim(@host, "first-owner")
    first_epoch = first_capture.visit.scribe_capture_epoch
    first_recording = create_recording(visit: @visit, encounter: @visit.scribe_encounter, actor: @host,
      participant: @host_participant, capture: first_capture, segment_index: 0, source_order: 1)
    append(first_recording, @host, first_capture, 0, "first owner acknowledged audio")

    takeover = Clinic::Telehealth::Scribe::TakeOverScribeCapture.call(visit: @visit.reload,
      actor: @second_clinician, request_key: "takeover-#{SecureRandom.hex(6)}",
      expected_version: @visit.lock_version, expected_capture_epoch: @visit.scribe_capture_epoch)
    assert_operator takeover.visit.scribe_capture_epoch, :>, first_epoch
    assert_equal @second_participant.id, takeover.visit.scribe_capture_owner_participant_id
    assert_equal "completed", first_recording.reload.status
    assert_equal 1, first_recording.total_chunks

    stale = assert_raises(Clinic::Telehealth::Error) do
      append(first_recording, @host, first_capture, 1, "stale owner audio", epoch: first_epoch)
    end
    assert_includes %w[scribe_capture_stale scribe_capture_not_owned], stale.code

    second_recording = create_recording(visit: @visit.reload, encounter: @visit.scribe_encounter,
      actor: @second_clinician, participant: @second_participant, capture: takeover,
      segment_index: 1, source_order: 2)
    append(second_recording, @second_clinician, takeover, 0, "second owner acknowledged audio")
    epoch_before_revoke = @visit.reload.scribe_capture_epoch
    @second_scribe_grant.update!(revoked_at: Time.current, revision: @second_scribe_grant.revision + 1)
    assert_nil @visit.reload.scribe_capture_owner_participant_id
    assert_operator @visit.scribe_capture_epoch, :>, epoch_before_revoke
    assert_raises(Clinic::Authorization::Denied) do
      append(second_recording, @second_clinician, takeover, 1, "revoked writer audio")
    end
    assert_equal 1, second_recording.reload.chunks.count
  end

  test "participant changes and consent withdrawal invalidate the active capture epoch" do
    request_scribe
    accept_all_scribe
    capture = claim(@host, "participant-change")
    capture_epoch = capture.visit.scribe_capture_epoch
    recording = create_recording(visit: @visit, encounter: @visit.scribe_encounter, actor: @host,
      participant: @host_participant, capture:, segment_index: 0, source_order: 1)

    observer = create_user("observer")
    observer_membership = @practice.memberships.create!(user: observer)
    grant_permissions!(observer_membership, "telehealth.participate", "scribe.read", "scribe.write")
    admitted_staff(@visit, observer_membership, "assistant")
    error = assert_raises(Clinic::Telehealth::Error) do
      append(recording, @host, capture, 0, "audio after participant joined")
    end
    assert_equal "scribe_consent_not_current", error.code

    record_scribe_consent(@patient_user, @patient_participant, "withdrawn", portal_identity: @portal_identity)
    assert_equal "withdrawn", scribe_snapshot[:state]
    assert_nil @visit.reload.scribe_capture_owner_participant_id
    assert_raises(Clinic::Telehealth::Error) do
      Clinic::Telehealth::Scribe::ValidateCaptureEpoch.call(visit: @visit, actor: @host,
        capture_epoch:, owner_token: capture.owner_token, recording:)
    end
  end

  test "ordered segment provenance is frozen into generation and consent gates review approve and exact export" do
    request_scribe
    accept_all_scribe
    capture = claim(@host, "ordered-sources")
    recordings = 2.times.map do |index|
      recording = create_recording(visit: @visit.reload, encounter: @visit.scribe_encounter, actor: @host,
        participant: @host_participant, capture:, segment_index: index, source_order: index + 1)
      append(recording, @host, capture, 0, "acknowledged segment #{index + 1}")
      Clinic::Scribe::RecordingCapture.finalize!(recording:, actor: @host, total_chunks: 1,
        duration_ms: 1_000, capture_epoch: capture.visit.scribe_capture_epoch, owner_token: capture.owner_token)
    end
    recordings.each_with_index do |recording, index|
      result = Clinic::Scribe::RecordingProcessor.process!(recording:, actor: @host,
        provider: transcription_provider("Transcript segment #{index + 1}."),
        capture_epoch: @visit.reload.scribe_capture_epoch)
      assert_equal "ready", result[:status]
    end

    ordered = Clinic::Telehealth::Scribe::OrderedScribeSources.call(encounter: @visit.scribe_encounter)
    assert_equal [1, 2], ordered.sources.map(&:source_order)
    assert_equal recordings.map(&:id), ordered.sources.map(&:telehealth_recording_id)
    ordered.sources.each_with_index do |source, index|
      assert_equal @visit.id, source.telehealth_visit_id
      assert_equal capture.visit.scribe_capture_epoch, source.capture_epoch
      assert_equal index, source.recording_segment_index
      assert_equal index + 1, source.source_order
      assert_equal @visit.id, source.source_metadata.fetch("telehealth_visit_id")
      assert_equal index + 1, source.source_metadata.fetch("source_order")
      assert_equal source.source_set_digest, source.source_metadata.fetch("source_set_digest")
    end
    assert_raises(Clinic::Telehealth::Error) do
      Clinic::Telehealth::Scribe::OrderedScribeSources.call(encounter: @visit.scribe_encounter,
        requested_ids: [ordered.sources.first.id])
    end

    draft, = Clinic::Scribe::Workflow.generate_draft(encounter: @visit.scribe_encounter, actor: @host,
      template_id: "soap", source_ids: ordered.sources.reverse.map(&:id),
      expected_version: @visit.scribe_encounter.reload.lock_version)
    transcript_inputs = draft.input_sources.select { |source| source["kind"] == "transcript" }
    assert_equal ordered.sources.map(&:id), transcript_inputs.map { |source| source.fetch("source_id") }
    assert_equal ordered.digest, draft.source_snapshot_digest
    draft = make_reviewable(draft)
    assert_equal ordered.digest, draft.source_snapshot_digest
    approved = Clinic::Scribe::Workflow.approve!(draft:, actor: @host, expected_version: draft.lock_version)

    record_scribe_consent(@patient_user, @patient_participant, "withdrawn", portal_identity: @portal_identity)
    assert_raises(ArgumentError) do
      Clinic::Scribe::Workflow.generate_draft(encounter: @visit.scribe_encounter, actor: @host,
        template_id: "soap", source_ids: ordered.sources.map(&:id),
        expected_version: @visit.scribe_encounter.reload.lock_version)
    end
    assert_raises(ArgumentError) do
      Clinic::Scribe::Workflow.review!(draft: approved, actor: @host, action: "accept",
        section_key: "subjective", expected_version: approved.lock_version)
    end
    assert_raises(ArgumentError) do
      Clinic::Scribe::Workflow.export!(draft: approved, actor: @host, destination: "parent_record_adapter",
        idempotency_key: "withdrawn-export", confirmed: true, expected_version: approved.lock_version)
    end

    record_scribe_consent(@patient_user, @patient_participant, "accepted", portal_identity: @portal_identity)
    exported = Clinic::Scribe::Workflow.export!(draft: approved.reload, actor: @host,
      destination: "parent_record_adapter", idempotency_key: "exact-export-#{SecureRandom.hex(6)}",
      confirmed: true, expected_version: approved.lock_version)
    assert_equal @clinical_encounter.id, exported.encounter_note.encounter_id
    assert_equal @visit.scribe_encounter_id, exported.draft.encounter_id
    assert_equal 1, @clinical_encounter.notes.where(note_kind: "soap").count
  end

  private

  def create_user(label)
    User.create!(email_address: "telehealth-scribe-#{label}-#{SecureRandom.hex(5)}@example.invalid", password: PASSWORD)
  end

  def admitted_staff(visit, membership, role)
    visit.participants.create!(practice: @practice, role:, membership:, status: "admitted",
      admitted_by_membership: @host_membership, admitted_at: 1.minute.ago, admitted_generation: 1)
  end

  def accept_treatment(participant)
    @visit.consents.create!(practice: @practice, participant:, policy_version: @policy, purpose: "telehealth",
      decision: "accepted", sequence: 1, decided_at: 1.minute.ago,
      method: participant.patient? ? "portal_authenticated" : "staff_authenticated",
      policy_content_digest: @policy.content_digest)
  end

  def request_scribe(visit = @visit)
    Clinic::Telehealth::Scribe::RequestScribe.call(visit: visit.reload, actor: @host,
      request_key: "request-#{visit.id}-#{SecureRandom.hex(5)}", expected_version: visit.lock_version)
  end

  def record_scribe_consent(actor, participant, decision, portal_identity: nil, visit: @visit)
    Clinic::Telehealth::Scribe::RecordScribeConsent.call(visit: visit.reload, actor:, decision:,
      request_key: "consent-#{participant.id}-#{SecureRandom.hex(5)}", expected_version: visit.lock_version,
      portal_identity:)
  end

  def accept_all_scribe(visit = @visit)
    visit.participants.active_record.where(status: "admitted").order(:id).each do |participant|
      next if Clinic::Telehealth::Scribe::Support.latest_recording_consents(visit, [participant])
        .fetch(participant.id, nil)&.accepted?
      if participant.patient?
        identity = participant.portal_identity
        record_scribe_consent(identity.user, participant, "accepted", portal_identity: identity, visit:)
      else
        actor = participant.membership_id == @host_membership.id ? @host : @second_clinician
        record_scribe_consent(actor, participant, "accepted", visit:)
      end
    end
  end

  def scribe_snapshot(visit = @visit)
    Clinic::Telehealth::Scribe::Support.consent_snapshot(visit.reload)
  end

  def claim(actor, label, visit: @visit)
    Clinic::Telehealth::Scribe::ClaimScribeCapture.call(visit: visit.reload, actor:,
      request_key: "#{label}-#{SecureRandom.hex(5)}", expected_version: visit.lock_version,
      expected_capture_epoch: visit.scribe_capture_epoch)
  end

  def fully_consent_and_claim(visit)
    request_scribe(visit)
    accept_all_scribe(visit)
    claim(@host, "foreign-claim", visit:)
  end

  def create_recording(visit:, encounter:, actor:, participant:, capture:, segment_index:, source_order:)
    Clinic::Scribe::RecordingCapture.create!(encounter:, actor:, idempotency_key: SecureRandom.uuid,
      expected_encounter_version: encounter.reload.lock_version, mime_type: "audio/webm;codecs=opus",
      telehealth_visit: visit.reload, capture_owner_participant_id: participant.id,
      capture_epoch: capture.visit.scribe_capture_epoch, owner_token: capture.owner_token,
      capture_source: "telehealth_mix", recording_segment_index: segment_index, source_order:)
  end

  def append(recording, actor, capture, sequence, content, epoch: nil)
    Clinic::Scribe::RecordingCapture.append_chunk!(recording:, actor:, sequence:,
      content: Base64.strict_encode64(content), digest: Digest::SHA256.hexdigest(content),
      capture_epoch: epoch || capture.visit.scribe_capture_epoch, owner_token: capture.owner_token)
  end

  def transcription_provider(transcript)
    Class.new do
      define_singleton_method(:configured?) { true }
      define_singleton_method(:model) { "test/audio" }
      define_singleton_method(:process) do |**_inputs|
        {
          transcript:, provider: "test", model: "test/audio", model_version: "1",
          provider_request_id: SecureRandom.uuid
        }
      end
    end
  end

  def make_reviewable(draft)
    content = Clinic::Scribe::Workflow::SECTIONS.index_with { |section| "Reviewed #{section} content." }
    current = Clinic::Scribe::Workflow.save_sections!(draft:, actor: @host, sections: content,
      expected_version: draft.lock_version)
    Clinic::Scribe::Workflow::SECTIONS.each do |section|
      current = Clinic::Scribe::Workflow.review!(draft: current, actor: @host, action: "accept",
        section_key: section, expected_version: current.reload.lock_version)
    end
    current
  end

  def create_foreign_bound_visit
    patient = @practice.patients.create!(display_name: "Other Synthetic Patient", reference: "THS-002")
    appointment = @practice.appointments.create!(patient:, site: @site, starts_at: 10.minutes.ago,
      ends_at: 50.minutes.from_now, status: "confirmed", visit_modality: "video")
    encounter = @practice.encounters.create!(patient:, appointment:, site: @site,
      started_at: 10.minutes.ago, status: "in_progress")
    visit = Clinic::Telehealth::Visit.create!(practice: @practice, patient:, appointment:, encounter:,
      policy_version: @policy, status: "in_progress", access_generation: 1,
      first_started_at: 10.minutes.ago, created_by_membership: @host_membership)
    admitted_staff(visit, @host_membership, "clinician")
    identity = Clinic::PatientPortal::Identity.create!(practice: @practice, patient:,
      user: create_user("foreign-patient"), status: "active", invited_at: 2.minutes.ago, activated_at: 1.minute.ago)
    patient_participant = visit.participants.create!(practice: @practice, role: "patient", portal_identity: identity,
      status: "admitted", admitted_by_membership: @host_membership, admitted_at: 1.minute.ago, admitted_generation: 1)
    [visit.participants.find_by!(membership_id: @host_membership.id), patient_participant].each do |participant|
      visit.consents.create!(practice: @practice, participant:, policy_version: @policy, purpose: "telehealth",
        decision: "accepted", sequence: 1, decided_at: 1.minute.ago,
        method: participant.patient? ? "portal_authenticated" : "staff_authenticated",
        policy_content_digest: @policy.content_digest)
    end
    visit
  end
end
