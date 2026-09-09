require "test_helper"

class ClinicAuditAndIdempotencyTest < ActiveSupport::TestCase
  setup do
    @organization = Organization.create!(name: "Synthetic Audit Organization")
    @practice = Clinic::Practice.create!(name: "Synthetic Audit Practice", organization: @organization)
    @actor = User.create!(email_address: "audit-actor@example.invalid", password: SecureRandom.hex(20))
    @membership = @practice.memberships.create!(user: @actor)
    @patient = @practice.patients.create!(display_name: "SYN_Audit, Avery", reference: "SYN-AUDIT-001")
  end

  def with_idempotency_config(active_key_id:, keyring:)
    original_active_key_id = Clinic::Idempotency.method(:active_digest_key_id)
    original_keyring = Clinic::Idempotency.method(:digest_keyring)
    Clinic::Idempotency.define_singleton_method(:active_digest_key_id) { active_key_id }
    Clinic::Idempotency.define_singleton_method(:digest_keyring) { keyring }
    yield
  ensure
    Clinic::Idempotency.define_singleton_method(:active_digest_key_id, original_active_key_id) if original_active_key_id
    Clinic::Idempotency.define_singleton_method(:digest_keyring, original_keyring) if original_keyring
  end

  test "future clinical actions are catalog-only and do not authorize a model" do
    Ability::FUTURE_CLINICAL_ACTIONS.each do |action_code|
      assert Ability.future_clinical_action?(action_code)
      assert_nil Ability.rule_for(action_code)
      permission = Permission.create!(action_code: action_code)
      assert_empty permission.role_versions
    end
  end

  test "unmapped future clinical action is denied and records the denial" do
    assert_raises(Clinic::Authorization::Denied) do
      Clinic::Authorization.authorize!(actor: @actor, practice: @practice, action: "intake.write")
    end

    event = @practice.audit_events.order(:id).last
    assert_equal "intake.write", event.action_code
    assert_equal "denied", event.outcome
  end

  test "a denial cannot proceed when its required audit evidence is unavailable" do
    original_record = Clinic::AuditRecorder.method(:record!)
    Clinic::AuditRecorder.define_singleton_method(:record!) { |**| raise Clinic::AuditRecorder::Unavailable }

    assert_raises(Clinic::AuditRecorder::Unavailable) do
      Clinic::Authorization.authorize!(actor: @actor, practice: @practice, action: "intake.write")
    end
  ensure
    Clinic::AuditRecorder.define_singleton_method(:record!, original_record) if original_record
  end

  test "same actor and practice key replays the committed receipt without payload storage" do
    payload = { patient_id: @patient.id, value: "Synthetic protected value" }
    first = Clinic::Idempotency.execute(
      practice: @practice, actor: @actor, operation_code: "synthetic.update", request_key: "retry-001", payload: payload,
      resource: @patient
    ) do
      @patient.update!(display_name: "SYN_Audit, Updated")
      @patient
    end

    second = Clinic::Idempotency.execute(
      practice: @practice, actor: @actor, operation_code: "synthetic.update", request_key: "retry-001", payload: payload,
      resource: @patient
    ) { flunk "a same-key replay must not execute the mutation block" }

    assert_not first.replayed
    assert second.replayed
    assert_equal first.receipt.id, second.receipt.id
    assert_equal @patient, first.value
    assert_nil second.value
    assert_equal "committed", second.receipt.outcome
    assert_not_includes second.receipt.attributes.to_json, "Synthetic protected value"
    assert_equal 1, Clinic::OperationReceipt.where(practice: @practice, request_key: "retry-001").count
  end

  test "new receipt digests are keyed and do not equal low-entropy SHA-256 guesses" do
    payload = { status: "yes" }
    receipt = Clinic::Idempotency.execute(
      practice: @practice, actor: @actor, operation_code: "synthetic.keyed", request_key: "retry-keyed",
      payload: payload
    ) { :committed }.receipt

    assert_equal "hmac-sha256-v1", receipt.digest_algorithm
    refute_equal Digest::SHA256.hexdigest(JSON.generate(payload)), receipt.payload_digest
    refute_equal Digest::SHA256.hexdigest("yes"), receipt.payload_digest
    assert_not_includes receipt.payload_digest, Clinic::Idempotency::DIGEST_KEY_PURPOSE
    assert_equal Clinic::Idempotency::DEFAULT_DIGEST_KEY_ID, receipt.digest_key_id
  end

  test "a receipt keeps replaying after active HMAC key rotation when the old key is retained" do
    old_secret = "synthetic-old-secret-key"
    new_secret = "synthetic-new-secret-key"
    payload = { status: "rotated" }

    first = with_idempotency_config(active_key_id: "old-key", keyring: { "old-key" => old_secret, "new-key" => new_secret }) do
      Clinic::Idempotency.execute(
        practice: @practice, actor: @actor, operation_code: "synthetic.rotation", request_key: "retry-rotation",
        payload: payload
      ) { :committed }
    end

    replay = with_idempotency_config(active_key_id: "new-key", keyring: { "old-key" => old_secret, "new-key" => new_secret }) do
      Clinic::Idempotency.execute(
        practice: @practice, actor: @actor, operation_code: "synthetic.rotation", request_key: "retry-rotation",
        payload: payload
      ) { flunk "a rotated receipt must not execute the mutation block" }
    end

    assert_not first.replayed
    assert replay.replayed
    assert_equal "old-key", replay.receipt.digest_key_id
  end

  test "a retained key reproduces receipts created by the legacy Rails key generator" do
    payload = { status: "legacy-key-generator" }
    canonical_payload = JSON.generate(payload)
    legacy_key = Rails.application.key_generator.generate_key(Clinic::Idempotency::DIGEST_KEY_PURPOSE, 32)
    receipt = Data.define(:operation_code, :payload_digest, :digest_algorithm, :digest_key_id).new(
      "synthetic.legacy-key-generator",
      OpenSSL::HMAC.hexdigest(OpenSSL::Digest.new("SHA256"), legacy_key, canonical_payload),
      Clinic::Idempotency::DIGEST_ALGORITHM,
      "retained-key"
    )

    with_idempotency_config(
      active_key_id: "new-key",
      keyring: { "retained-key" => Rails.application.secret_key_base, "new-key" => "synthetic-new-secret" }
    ) do
      assert_nothing_raised do
        Clinic::Idempotency.send(
          :verify_replay!, receipt, "synthetic.legacy-key-generator", canonical_payload
        )
      end
    end
  end

  test "a receipt with an unavailable verification key fails closed before mutation" do
    receipt = Clinic::OperationReceipt.create!(
      practice: @practice, actor_membership: @membership, operation_code: "synthetic.missing-key",
      request_key: "retry-missing-key", payload_digest: "0" * 64,
      digest_algorithm: Clinic::Idempotency::DIGEST_ALGORITHM, digest_key_id: "retired-key", outcome: :committed
    )

    assert_raises(Clinic::Idempotency::InvalidRequest) do
      with_idempotency_config(
        active_key_id: Clinic::Idempotency::DEFAULT_DIGEST_KEY_ID,
        keyring: { Clinic::Idempotency::DEFAULT_DIGEST_KEY_ID => "synthetic-current" }
      ) do
        Clinic::Idempotency.send(
          :verify_replay!, receipt, "synthetic.missing-key", JSON.generate({ status: "missing-key" })
        )
      end
    end
  end

  test "HMAC receipts require an immutable key identifier" do
    receipt = Clinic::OperationReceipt.new(
      practice: @practice, actor_membership: @membership, operation_code: "synthetic.validation",
      request_key: "retry-validation", payload_digest: "0" * 64,
      digest_algorithm: Clinic::Idempotency::DIGEST_ALGORITHM, outcome: :committed
    )

    assert_not receipt.valid?
    assert_includes receipt.errors[:digest_key_id], "can't be blank"
  end

  test "a legacy SHA-256 receipt remains replayable by its recorded algorithm" do
    payload = { status: "legacy" }
    receipt = Clinic::OperationReceipt.create!(
      practice: @practice, actor_membership: @membership, operation_code: "synthetic.legacy",
      request_key: "retry-legacy", payload_digest: Clinic::Idempotency.payload_digest(
        payload, algorithm: Clinic::Idempotency::LEGACY_DIGEST_ALGORITHM
      ), digest_algorithm: Clinic::Idempotency::LEGACY_DIGEST_ALGORITHM, outcome: :committed
    )

    replay = Clinic::Idempotency.execute(
      practice: @practice, actor: @actor, operation_code: "synthetic.legacy", request_key: "retry-legacy",
      payload: payload
    ) { flunk "a legacy receipt must replay without executing the mutation block" }

    assert replay.replayed
    assert_equal receipt.id, replay.receipt.id
    assert_equal Clinic::Idempotency::LEGACY_DIGEST_ALGORITHM, replay.receipt.digest_algorithm
  end

  test "an unknown receipt digest algorithm fails safely before mutation" do
    receipt = Data.define(:operation_code, :payload_digest, :digest_algorithm).new(
      "synthetic.unknown", "0" * 64, "unknown-v99"
    )

    assert_raises(Clinic::Idempotency::InvalidRequest) do
      Clinic::Idempotency.send(:verify_replay!, receipt, "synthetic.unknown", JSON.generate({ status: "unknown" }))
    end
  end

  test "same key with a different payload or operation is a conflict without a second write" do
    payload = { patient_id: @patient.id, value: "Synthetic one" }
    Clinic::Idempotency.execute(
      practice: @practice, actor: @actor, operation_code: "synthetic.update", request_key: "retry-002", payload: payload
    ) { :committed }

    assert_raises(Clinic::Idempotency::Conflict) do
      Clinic::Idempotency.execute(
        practice: @practice, actor: @actor, operation_code: "synthetic.update", request_key: "retry-002",
        payload: payload.merge(value: "Synthetic two")
      ) { flunk "a changed payload must not execute" }
    end
    assert_raises(Clinic::Idempotency::Conflict) do
      Clinic::Idempotency.execute(
        practice: @practice, actor: @actor, operation_code: "synthetic.other", request_key: "retry-002", payload: payload
      ) { flunk "a changed operation must not execute" }
    end
    assert_equal 1, Clinic::OperationReceipt.where(practice: @practice, request_key: "retry-002").count
  end

  test "an unconfirmed outcome is durable and never replays as committed" do
    result = Clinic::Idempotency.execute(
      practice: @practice, actor: @actor, operation_code: "synthetic.external", request_key: "retry-unknown",
      payload: { operation: "synthetic" }
    ) { raise Clinic::Idempotency::OutcomeUnconfirmed }

    assert_not result.replayed
    assert result.receipt.outcome_outcome_unconfirmed?
    replay = Clinic::Idempotency.execute(
      practice: @practice, actor: @actor, operation_code: "synthetic.external", request_key: "retry-unknown",
      payload: { operation: "synthetic" }
    ) { flunk "an unconfirmed operation must not run automatically on lookup" }
    assert replay.replayed
    assert replay.receipt.outcome_outcome_unconfirmed?
  end

  test "operation receipts are append-only at the database boundary" do
    receipt = Clinic::Idempotency.execute(
      practice: @practice, actor: @actor, operation_code: "synthetic.immutable", request_key: "retry-immutable",
      payload: {}
    ) { :committed }.receipt

    assert_raises(ActiveRecord::StatementInvalid) do
      ApplicationRecord.connection.execute("UPDATE clinic_operation_receipts SET operation_code = 'synthetic.changed' WHERE id = #{receipt.id}")
    end
    assert_raises(ActiveRecord::StatementInvalid) do
      ApplicationRecord.connection.execute("DELETE FROM clinic_operation_receipts WHERE id = #{receipt.id}")
    end
  end

  test "concurrent same-key attempts commit once and replay once" do
    ready = Queue.new
    release = Queue.new
    outcomes = Queue.new

    threads = 2.times.map do
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          ready << true
          release.pop
          outcomes << Clinic::Idempotency.execute(
            practice: @practice, actor: @actor, operation_code: "synthetic.concurrent", request_key: "retry-003",
            payload: { operation: "synthetic" }
          ) { sleep 0.05; :committed }
        end
      end
    end
    2.times { ready.pop }
    2.times { release << true }
    threads.each(&:join)

    results = 2.times.map { outcomes.pop }
    assert_equal [ false, true ], results.map(&:replayed).sort_by(&:to_s)
    assert_equal 1, Clinic::OperationReceipt.where(practice: @practice, request_key: "retry-003").count
  ensure
    threads&.each { |thread| thread.kill unless thread.stop? || !thread.alive? }
  end

  test "inactive or foreign clinic actor cannot claim a receipt" do
    @membership.update!(active: false)
    assert_raises(Clinic::Idempotency::InvalidRequest) do
      Clinic::Idempotency.execute(practice: @practice, actor: @actor, operation_code: "synthetic.read",
        request_key: "retry-004", payload: {}) { :unreachable }
    end

    foreign_practice = Clinic::Practice.create!(name: "Synthetic Foreign Practice", organization: @organization)
    @membership.update!(active: true)
    assert_raises(Clinic::Idempotency::InvalidRequest) do
      Clinic::Idempotency.execute(practice: foreign_practice, actor: @actor, operation_code: "synthetic.read",
        request_key: "retry-005", payload: {}) { :unreachable }
    end

    foreign_patient = foreign_practice.patients.create!(display_name: "SYN_Foreign, Patient", reference: "SYN-FOREIGN-001")
    assert_raises(Clinic::Idempotency::InvalidRequest) do
      Clinic::Idempotency.execute(practice: @practice, actor: @actor, operation_code: "synthetic.read",
        request_key: "retry-005b", payload: {}, resource: foreign_patient) { :unreachable }
    end
  end

  test "membership revocation between preflight and receipt lock is rejected" do
    membership = @membership
    original_lock = Clinic::Idempotency.method(:lock_request!)
    Clinic::Idempotency.define_singleton_method(:lock_request!) do |practice_id, membership_id, request_key|
      membership.update!(active: false)
      original_lock.call(practice_id, membership_id, request_key)
    end

    assert_raises(Clinic::Idempotency::InvalidRequest) do
      Clinic::Idempotency.execute(
        practice: @practice, actor: @actor, operation_code: "synthetic.revocation", request_key: "retry-revoked",
        payload: {}
      ) { flunk "a revoked membership must not execute" }
    end
    assert_not Clinic::OperationReceipt.exists?(practice: @practice, request_key: "retry-revoked")
  ensure
    Clinic::Idempotency.define_singleton_method(:lock_request!, original_lock) if original_lock
  end

  test "encounter close rechecks the exact permission after the receipt lock" do
    grant_permissions!(@membership, "encounters.write")
    encounter = @practice.encounters.create!(patient: @patient, started_at: Time.utc(2026, 9, 2, 14), status: "open")
    grant = permission_grant!(@membership, "encounters.write")
    original_lock = Clinic::Idempotency.method(:lock_request!)
    Clinic::Idempotency.define_singleton_method(:lock_request!) do |practice_id, membership_id, request_key|
      grant.update_columns(revoked_at: Time.current, revision: grant.revision + 1)
      original_lock.call(practice_id, membership_id, request_key)
    end

    assert_raises(Clinic::Authorization::Denied) do
      Clinic::Scheduling::CloseEncounter.call(
        encounter: encounter, actor: @actor, ended_at: encounter.started_at + 30.minutes, request_key: "retry-permission-revoked"
      )
    end
    assert_equal "open", encounter.reload.status
    assert_not Clinic::OperationReceipt.exists?(practice: @practice, request_key: "retry-permission-revoked")
    assert @practice.audit_events.where(action_code: "encounters.write", outcome: "denied").exists?
  ensure
    Clinic::Idempotency.define_singleton_method(:lock_request!, original_lock) if original_lock
  end

  test "different close keys serialize on the encounter and only one commits" do
    grant_permissions!(@membership, "encounters.write")
    encounter = @practice.encounters.create!(patient: @patient, started_at: Time.current - 1.hour, status: "open")
    ready = Queue.new
    release = Queue.new
    results = Queue.new

    workers = 2.times.map do |index|
      Thread.new do
        ApplicationRecord.connection_pool.with_connection do
          ready << true
          release.pop
          begin
            Clinic::Scheduling::CloseEncounter.call(
              encounter: Clinic::Encounter.find(encounter.id), actor: @actor,
              request_key: "concurrent-close-#{index}"
            )
            results << :committed
          rescue ArgumentError
            results << :already_closed
          end
        end
      end
    end
    2.times { ready.pop }
    2.times { release << true }
    workers.each(&:join)

    assert_equal [ :already_closed, :committed ], 2.times.map { results.pop }.sort_by(&:to_s)
    assert_equal "completed", encounter.reload.status
    assert_equal 1, Clinic::OperationReceipt.where(practice: @practice,
      operation_code: "encounters.close", request_key: %w[concurrent-close-0 concurrent-close-1]).count
    assert_equal 1, @practice.audit_events.where(action_code: "encounters.close", outcome: "committed").count
  ensure
    workers&.each { |worker| worker.kill if worker.alive? }
  end

  test "encounter note creation rechecks notes.write after the receipt lock" do
    site = @practice.sites.create!(code: "NOTE-RACE")
    encounter = @practice.encounters.create!(patient: @patient, site: site,
      started_at: Time.utc(2026, 9, 2, 14), status: "open")
    grant_permissions!(@membership, "notes.write")
    grant = permission_grant!(@membership, "notes.write")
    original_lock = Clinic::Idempotency.method(:lock_request!)
    Clinic::Idempotency.define_singleton_method(:lock_request!) do |practice_id, membership_id, request_key|
      grant.update_columns(revoked_at: Time.current, revision: grant.revision + 1)
      original_lock.call(practice_id, membership_id, request_key)
    end

    assert_raises(Clinic::Authorization::Denied) do
      Clinic::Care::CreateEncounterNote.call(
        practice: @practice,
        actor: @actor,
        encounter: encounter,
        encrypted_body: "Synthetic note race",
        request_key: "note-permission-revoked"
      )
    end
    assert_empty encounter.notes
    assert_not Clinic::OperationReceipt.exists?(practice: @practice, request_key: "note-permission-revoked")
    assert @practice.audit_events.where(action_code: "notes.write", outcome: "denied").exists?
  ensure
    Clinic::Idempotency.define_singleton_method(:lock_request!, original_lock) if original_lock
  end

  test "encounter note revision preserves denial evidence after a locked permission revoke" do
    site = @practice.sites.create!(code: "NOTE-REV-RACE")
    encounter = @practice.encounters.create!(patient: @patient, site: site,
      started_at: Time.utc(2026, 9, 2, 14), status: "open")
    grant_permissions!(@membership, "notes.write")
    note = Clinic::Care::CreateEncounterNote.call(
      practice: @practice, actor: @actor, encounter: encounter, encrypted_body: "Synthetic initial note",
      request_key: "note-revision-race-create"
    )
    grant = permission_grant!(@membership, "notes.write")
    original_lock = Clinic::Idempotency.method(:lock_request!)
    Clinic::Idempotency.define_singleton_method(:lock_request!) do |practice_id, membership_id, request_key|
      grant.update_columns(revoked_at: Time.current, revision: grant.revision + 1)
      original_lock.call(practice_id, membership_id, request_key)
    end

    assert_raises(Clinic::Authorization::Denied) do
      Clinic::Care::ReviseEncounterNote.call(
        note: note, actor: @actor, encrypted_body: "Synthetic denied revision", expected_revision: 1,
        request_key: "note-revision-permission-revoked"
      )
    end
    assert_equal 1, note.revisions.reload.count
    assert_not Clinic::OperationReceipt.exists?(practice: @practice, request_key: "note-revision-permission-revoked")
    assert @practice.audit_events.where(action_code: "notes.write", outcome: "denied").exists?
  ensure
    Clinic::Idempotency.define_singleton_method(:lock_request!, original_lock) if original_lock
  end

  test "required audit failure rolls back the protected mutation and receipt" do
    assert_raises(Clinic::AuditRecorder::Unavailable) do
      Clinic::Idempotency.execute(
        practice: @practice, actor: @actor, operation_code: "synthetic.protected_update", request_key: "retry-006",
        payload: { display_name: "Synthetic changed" }, resource: @patient
      ) do
        @patient.update!(display_name: "SYN_Audit, Must Roll Back")
        Clinic::AuditRecorder.record!(practice: @practice, actor: @actor,
          action_code: "synthetic.protected_update", outcome: "not-a-valid-outcome")
      end
    end
    assert_equal "SYN_Audit, Avery", @patient.reload.display_name
    assert_not Clinic::OperationReceipt.exists?(practice: @practice, request_key: "retry-006")
  end

  test "strict audit recording does not expose failure details" do
    error = assert_raises(Clinic::AuditRecorder::Unavailable) do
      Clinic::AuditRecorder.record!(practice: nil, actor: @actor, action_code: "synthetic.audit", outcome: :committed)
    end
    assert_equal "Required clinic audit evidence is unavailable.", error.message

    assert_raises(Clinic::AuditRecorder::Unavailable) do
      Clinic::AuditRecorder.record!(practice: @practice, actor: @actor,
        action_code: "synthetic.audit", outcome: "not-a-valid-outcome")
    end
  end
end
