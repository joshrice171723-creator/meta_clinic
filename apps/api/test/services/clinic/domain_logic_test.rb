require "test_helper"
require "digest"

class ClinicDomainLogicTest < ActiveSupport::TestCase
  setup do
    @actor = User.create!(email_address: "domain-actor@example.invalid", password: SecureRandom.hex(20))
    @practice = Clinic::Practice.create!(name: "Domain Logic Clinic", timezone: "UTC")
    @membership = Clinic::Membership.create!(
      practice: @practice,
      user: @actor,
      patients_access: true,
      inventory_access: true,
      staff_access: true,
      **%w[catalog receive adjust hold release count configure].to_h { |action| [ "inventory_#{action}", true ] }
    )
    grant_permissions!(@membership, "patients.read", "patients.write", "staff.read", "staff.write", "inventory.read",
      "inventory.catalog", "inventory.receive", "inventory.adjust", "inventory.hold", "inventory.release", "inventory.count",
      "inventory.configure", "inventory.transfer", "appointments.write", "encounters.write", "notes.read", "notes.write", "notes.sign", "observations.write",
      "messages.write", "documents.read", "billing.write", "roles.manage")
    @patient = Clinic::Care::Patient.create!(practice: @practice, display_name: "Synthetic Patient", reference: "SYN-001")
  end

  test "authorization is tenant-bound and role grants do not OR with legacy flags" do
    legacy_only = User.create!(email_address: "domain-legacy-only@example.invalid", password: SecureRandom.hex(20))
    Clinic::Membership.create!(practice: @practice, user: legacy_only, patients_access: true)
    assert_not Clinic::Authorization.allowed?(actor: legacy_only, practice: @practice, action: "patients.read")
    other_practice = Clinic::Practice.create!(name: "Other Domain Clinic", timezone: "UTC")
    assert_raises(Clinic::Authorization::Denied) do
      Clinic::Authorization.authorize!(actor: @actor, practice: other_practice, action: "patients.read")
    end

    permission = Permission.find_or_create_by!(action_code: "patients.read")
    role = RoleVersion.create!(role_code: "reception", version: 1)
    RoleVersionPermission.create!(role_version: role, permission: permission)
    Clinic::RoleGrant.create!(
      practice: @practice,
      membership: @membership,
      role_version: role,
      scope_kind: "practice",
      effective_from: 1.minute.ago,
      revision: 1
    )

    assert Clinic::Authorization.allowed?(actor: @actor, practice: @practice, action: "patients.read")
    limited = User.create!(email_address: "domain-limited@example.invalid", password: SecureRandom.hex(20))
    limited_membership = Clinic::Membership.create!(practice: @practice, user: limited)
    grant_permissions!(limited_membership, "patients.read")
    assert Clinic::Authorization.allowed?(actor: limited, practice: @practice, action: "patients.read")
    assert_raises(Clinic::Authorization::Denied) { Clinic::Authorization.authorize!(actor: limited, practice: @practice, action: "inventory.receive") }
  end

  test "granting requires a delegable role and revocation takes effect immediately" do
    roles_manage = Permission.find_or_create_by!(action_code: "roles.manage")
    patient_read = Permission.find_or_create_by!(action_code: "patients.read")
    administrator = RoleVersion.create!(role_code: "administrator", version: 1)
    RoleVersionPermission.create!(role_version: administrator, permission: roles_manage)
    RoleVersionPermission.create!(role_version: administrator, permission: patient_read)
    Clinic::RoleGrant.create!(practice: @practice, membership: @membership, role_version: administrator,
      scope_kind: "practice", effective_from: 1.minute.ago, revision: 1)

    target_user = User.create!(email_address: "domain-target@example.invalid", password: SecureRandom.hex(20))
    target_membership = Clinic::Membership.create!(practice: @practice, user: target_user)
    reader = RoleVersion.create!(role_code: "reader", version: 1)
    RoleVersionPermission.create!(role_version: reader, permission: patient_read)

    grant = Clinic::Authorization::GrantAccess.call(grantor: @actor, membership: target_membership, role_version: reader, scope_kind: "practice")
    assert Clinic::Authorization.allowed?(actor: target_user, practice: @practice, action: "patients.read")
    Clinic::Authorization::RevokeAccess.call(grant: grant, grantor: @actor)
    assert_not Clinic::Authorization.allowed?(actor: target_user, practice: @practice, action: "patients.read")
    assert_equal %w[granted revoked], grant.events.order(:grant_revision).pluck(:event_kind)
    role_events = Clinic::AuditEvent.where(action_code: %w[roles.grant roles.revoke]).order(:id).last(2)
    assert_equal %w[roles.grant roles.revoke], role_events.map(&:action_code)
    assert_equal %w[committed committed], role_events.map(&:outcome)
  end

  test "booking permits adjacency, rejects overlap, and encounters support walk-ins" do
    site = Clinic::Site.create!(practice: @practice, code: "MAIN")
    room = Clinic::Room.create!(practice: @practice, site: site, code: "ROOM-1")
    start_time = Time.utc(2026, 8, 31, 9)

    first = Clinic::Scheduling::BookAppointment.call(
      practice: @practice,
      actor: @actor,
      patient: @patient,
      site: site,
      room: room,
      starts_at: start_time,
      ends_at: start_time + 30.minutes
    )
    adjacent = Clinic::Scheduling::BookAppointment.call(
      practice: @practice,
      actor: @actor,
      patient: @patient,
      site: site,
      room: room,
      starts_at: start_time + 30.minutes,
      ends_at: start_time + 1.hour
    )
    assert_equal "scheduled", first.status
    assert_equal start_time + 30.minutes, adjacent.starts_at
    assert_raises(ArgumentError) do
      Clinic::Scheduling::BookAppointment.call(
        practice: @practice,
        actor: @actor,
        patient: @patient,
        site: site,
        room: room,
        starts_at: start_time + 15.minutes,
        ends_at: start_time + 45.minutes
      )
    end

    encounter = Clinic::Scheduling::CreateEncounter.call(practice: @practice, actor: @actor, patient: @patient)
    assert_nil encounter.appointment_id
    assert_raises(ArgumentError) do
      Clinic::Scheduling::CloseEncounter.call(encounter: encounter, actor: @actor,
        ended_at: encounter.started_at + 20.minutes)
    end
    assert_equal "open", encounter.reload.status
    closed = Clinic::Scheduling::CloseEncounter.call(encounter: encounter, actor: @actor,
      ended_at: encounter.started_at + 20.minutes, request_key: "domain-encounter-close")
    assert_equal "completed", closed.status
    assert_raises(ArgumentError) do
      Clinic::Scheduling::CloseEncounter.call(encounter: closed, actor: @actor, request_key: "domain-encounter-close-again")
    end
  end

  test "note workflow serializes revisions, detects stale writers, and signs an exact revision" do
    encounter = Clinic::Scheduling::CreateEncounter.call(practice: @practice, actor: @actor, patient: @patient)
    note = Clinic::Care::CreateEncounterNote.call(practice: @practice, actor: @actor, encounter: encounter,
      encrypted_body: "synthetic-v1", request_key: "domain-note-create-1")
    revision = Clinic::Care::ReviseEncounterNote.call(note: note, actor: @actor, encrypted_body: "synthetic-v2",
      expected_revision: 1, request_key: "domain-note-revise-1")
    assert_equal 2, revision.revision_no
    assert_raises(ActiveRecord::StaleObjectError) do
      Clinic::Care::ReviseEncounterNote.call(note: note, actor: @actor, encrypted_body: "stale", expected_revision: 1,
        request_key: "domain-note-revise-stale")
    end

    signature = Clinic::Care::SignEncounterNote.call(
      note: note,
      actor: @actor,
      revision_no: 2,
      content_digest: Digest::SHA256.hexdigest("synthetic-v2"),
      attestation_version: "synthetic-attestation-v1"
    )
    assert_equal revision.id, signature.revision_id
    replay = Clinic::Care::SignEncounterNote.call(note: note, actor: @actor, revision_no: 2,
      content_digest: Digest::SHA256.hexdigest("synthetic-v2"), attestation_version: "synthetic-attestation-v1")
    assert_equal signature.id, replay.id
    assert_equal 1, note.signatures.count
    assert_raises(ArgumentError) do
      Clinic::Care::ReviseEncounterNote.call(note: note, actor: @actor, encrypted_body: "overwrite", expected_revision: 2,
        request_key: "domain-note-revise-signed")
    end
    assert_raises(ArgumentError) do
      Clinic::Care::SignEncounterNote.call(note: note, actor: @actor, revision_no: 2, content_digest: "wrong", attestation_version: "v1")
    end
  end

  test "SOAP note revisions retain template provenance and encrypt stored content" do
    encounter = Clinic::Scheduling::CreateEncounter.call(practice: @practice, actor: @actor, patient: @patient)
    first_body = Clinic::Care::SoapNotePayload.dump(
      template_id: "adult-physical-exam-detailed",
      template_version: 1,
      sections: { subjective: "Synthetic concern", objective: "Synthetic finding", assessment: "", plan: "" }
    )
    note = Clinic::Care::CreateEncounterNote.call(practice: @practice, actor: @actor,
      encounter: encounter, note_kind: "soap", encrypted_body: first_body, request_key: "domain-soap-create")
    raw = ApplicationRecord.connection.select_value(<<~SQL.squish)
      SELECT encrypted_body FROM clinic_encounter_note_revisions WHERE id = #{note.revisions.sole.id}
    SQL
    assert_not_equal first_body, raw
    assert_not_includes raw, "Synthetic concern"
    assert_equal first_body, note.revisions.sole.encrypted_body

    replacement = Clinic::Care::SoapNotePayload.dump(
      template_id: "adult-physical-exam-detailed",
      template_version: 1,
      sections: { subjective: "Synthetic concern revised", objective: "Synthetic finding", assessment: "", plan: "" }
    )
    revision = Clinic::Care::ReviseEncounterNote.call(note: note, actor: @actor,
      encrypted_body: replacement, expected_revision: 1, request_key: "domain-soap-revise")
    assert_equal "Synthetic concern revised",
      Clinic::Care::SoapNotePayload.load!(revision.encrypted_body).dig(:sections, :subjective)

    assert_raises(ActiveRecord::RecordInvalid) do
      Clinic::Care::CreateEncounterNote.call(practice: @practice, actor: @actor,
        encounter: encounter, note_kind: "soap", encrypted_body: first_body, request_key: "domain-soap-duplicate")
    end
  end

  test "observations and addresses require the same practice and preserve versions" do
    observation = Clinic::Care::RecordObservation.call(
      practice: @practice,
      actor: @actor,
      patient: @patient,
      attributes: {
        code: "synthetic-height",
        code_system: "synthetic",
        code_version: "1",
        value_kind: "numeric",
        numeric_value: "170.5",
        unit_code: "cm",
        observed_at: Time.current,
        recorded_at: Time.current
      },
      request_key: "domain-observation-create"
    )
    assert_equal "numeric", observation.value_kind
    first = Clinic::Care::AddPatientAddress.call(practice: @practice, actor: @actor, patient: @patient, encrypted_address: "synthetic-address-1", make_primary: true)
    second = Clinic::Care::AddPatientAddress.call(practice: @practice, actor: @actor, patient: @patient, encrypted_address: "synthetic-address-2", make_primary: true)
    assert_equal [ 1, 2 ], @patient.address_versions.chronological.pluck(:version)
    assert_equal second.id, @patient.reload.primary_address_version_id
    assert_not_equal first.id, second.id
  end

  test "message delivery is idempotent and does not claim exactly-once transport" do
    intent = Clinic::Messaging::CreateIntent.call(
      practice: @practice,
      actor: @actor,
      patient: @patient,
      request_key: "message-1",
      purpose_code: "synthetic-test",
      encrypted_recipient_snapshot: "recipient",
      encrypted_content: "content"
    )
    assert_equal "pending", intent.outbox.dispatch_state
    first = Clinic::Messaging::RecordDelivery.call(intent: intent, actor: @actor, provider_event_reference: "provider-1", outcome: "unknown")
    assert_equal first, Clinic::Messaging::RecordDelivery.call(intent: intent, actor: @actor, provider_event_reference: "provider-1", outcome: "unknown")
    assert_equal "unknown", intent.outbox.reload.dispatch_state
    Clinic::Messaging::RecordDelivery.call(intent: intent, actor: @actor, provider_event_reference: "provider-2", outcome: "delivered")
    assert_equal "delivered", intent.outbox.reload.dispatch_state
  end

  test "document access reauthorizes the actual version and blocks unscanned content" do
    category = Clinic::DocumentCategory.create!(practice: @practice, code: "lab", name: "Synthetic document")
    pending = Clinic::Document.create!(practice: @practice, patient: @patient, category: category,
      object_key: "private/synthetic-1", object_version: "v1", checksum: "checksum-1", byte_size: 10,
      media_type: "text/plain", scan_state: "pending")
    assert_raises(ArgumentError) { Clinic::Documents::Access.downloadable!(document: pending, actor: @actor) }

    clean = Clinic::Document.create!(practice: @practice, patient: @patient, category: category,
      object_key: "private/synthetic-2", object_version: "v1", checksum: "checksum-2", byte_size: 10,
      media_type: "text/plain", scan_state: "clean")
    assert_difference "Clinic::AuditEvent.count", 1 do
      assert_equal clean, Clinic::Documents::Access.downloadable!(document: clean, actor: @actor)
    end
    event = Clinic::AuditEvent.order(:id).last
    assert_equal "documents.download", event.action_code
    assert_equal "released", event.outcome
    assert_equal "document:#{clean.id}:v1", event.resource_manifests.first.protected_resource_version_ref
  end

  test "denied service authorization creates a denial audit event without changing state" do
    limited = User.create!(email_address: "domain-denied@example.invalid", password: SecureRandom.hex(20))
    Clinic::Membership.create!(practice: @practice, user: limited)
    before = Clinic::AuditEvent.count

    assert_raises(Clinic::Authorization::Denied) do
      Clinic::Scheduling::CreateEncounter.call(practice: @practice, actor: limited, patient: @patient)
    end

    assert_equal before + 1, Clinic::AuditEvent.count
    event = Clinic::AuditEvent.order(:id).last
    assert_equal "encounters.write", event.action_code
    assert_equal "denied", event.outcome
    assert_equal 0, @practice.encounters.count
  end

  test "billing calculates exact line totals and prevents over-allocation" do
    invoice = Clinic::Billing::DraftInvoice.call(
      practice: @practice,
      actor: @actor,
      patient: @patient,
      currency: "USD",
      lines: [ { quantity: "2", unit_amount: "1.67", description_snapshot: "Synthetic service" } ]
    )
    assert_equal BigDecimal("3.34"), invoice.lines.sole.posted_amount
    Clinic::Billing::PostInvoice.call(invoice: invoice, actor: @actor)
    assert_equal "posted", invoice.reload.status

    allocation = Clinic::Billing::AllocatePayment.call(
      practice: @practice,
      actor: @actor,
      patient: @patient,
      invoice: invoice,
      external_event_reference: "payment-1",
      currency: "USD",
      amount: "3.34"
    )
    assert_equal BigDecimal("3.34"), allocation.amount
    assert_raises(ArgumentError) do
      Clinic::Billing::AllocatePayment.call(
        practice: @practice,
        actor: @actor,
        patient: @patient,
        invoice: invoice,
        external_event_reference: "payment-1",
        currency: "USD",
        amount: "0.01"
      )
    end
  end
end
