require "securerandom"

module Qa
  class MuseWrites
    class Denied < StandardError; end
    class Conflict < StandardError; end

    ACTIONS = {
      "workflow_claim" => { scope: "qa.workflow.claim", kind: "muse_workflow_claimed" },
      "verdict" => { scope: "qa.verdict.write", kind: "muse_verdict_recorded" },
      "defect" => { scope: "qa.defect.write", kind: "muse_defect_reported" },
      "test_data" => { scope: "qa.test_data.prepare", kind: "muse_test_data_prepared" },
      "retest" => { scope: "qa.retest.request", kind: "muse_retest_requested" }
    }.freeze
    SHA = WorkflowContract::SHA
    KEY = WorkflowContract::KEY
    WORKFLOW_SNAPSHOT = "muse:workflow:".freeze
    RETEST_SNAPSHOT = "muse:retests".freeze

    def self.claim!(credential:, auth:, input:)
      WorkflowContract.object!(input, %w[workflow_id agent build_pin idempotency_key])
      workflow_id!(input["workflow_id"])
      raise ArgumentError, "agent must match the authenticated Muse identity." unless input["agent"] == "Muse"

      write!(credential:, auth:, input:, action: "workflow_claim") do |build|
        scope = fixture_scope!(input["workflow_id"], credential)
        now = Time.current.iso8601(6)
        workflow = lock_snapshot!("#{WORKFLOW_SNAPSHOT}#{input['workflow_id']}")
        state = workflow.data
        if state["status"] == "in_progress" && state["build_pin"] == input["build_pin"]
          raise Conflict, "This workflow already has an active Muse claim on the pinned build."
        end
        seal_claim!(workflow, build:) if state["status"] == "in_progress"

        receipt = { "workflow_id" => input["workflow_id"], "agent" => "Muse", "status" => "in_progress",
          "build_pin" => input["build_pin"], "claimed_at" => now, "receipt_id" => SecureRandom.uuid }
        workflow.update!(data: { "status" => "in_progress", "build_pin" => input["build_pin"],
          "credential_id" => credential.id, "fixture_scope" => scope, "receipt" => receipt })
        record_coverage!(workflow_id: input["workflow_id"], build:, values: {
          "status" => "in_progress", "result" => "in_progress", "revision" => input["build_pin"],
          "version" => build["version"], "last_version" => build["version"], "last_attempted_at" => now,
          "agent" => "Muse", "evidence" => nil, "evidence_ref" => nil
        })
        receipt
      end
    end

    def self.verdict!(credential:, auth:, input:)
      WorkflowContract.object!(input, %w[workflow_id verdict build_pin evidence idempotency_key])
      workflow_id!(input["workflow_id"])
      raise ArgumentError, "verdict must be pass, fail or blocked." unless %w[pass fail blocked].include?(input["verdict"])
      MuseEvidence.validate!(input["evidence"])

      write!(credential:, auth:, input:, action: "verdict") do |build|
        scope = fixture_scope!(input["workflow_id"], credential)
        archived = MuseEvidence.archive!(input["evidence"], credential:, build_pin: input["build_pin"], workflow_ids: [input["workflow_id"]], fixture_scopes: [scope])
        workflow = lock_snapshot!("#{WORKFLOW_SNAPSHOT}#{input['workflow_id']}")
        claim = workflow.data
        seal_claim!(workflow, build:) if claim["status"] == "in_progress" && claim["build_pin"] != input["build_pin"]

        now = Time.current.iso8601(6)
        receipt = { "workflow_id" => input["workflow_id"], "verdict" => input["verdict"],
          "build_pin" => input["build_pin"], "evidence" => archived, "recorded_at" => now,
          "receipt_id" => SecureRandom.uuid }
        state = claim["build_pin"] == input["build_pin"] ? claim : {}
        workflow.update!(data: state.merge("status" => input["verdict"], "build_pin" => input["build_pin"],
          "credential_id" => credential.id, "fixture_scope" => scope, "verdict" => receipt))
        record_coverage!(workflow_id: input["workflow_id"], build:, values: {
          "status" => input["verdict"], "result" => input["verdict"], "revision" => input["build_pin"],
          "version" => build["version"], "last_version" => build["version"], "last_attempted_at" => now,
          "agent" => "Muse", "evidence" => archived, "evidence_ref" => archived.find { |item| item["kind"] == "screenshot" }&.fetch("url")
        })
        receipt
      end
    end

    def self.defect!(credential:, auth:, input:)
      WorkflowContract.object!(input, %w[build_pin title repro_steps evidence affected_workflow_ids idempotency_key])
      WorkflowContract.text!(input["title"], maximum: 200)
      steps = WorkflowContract.list!(input["repro_steps"], minimum: 1, maximum: 20)
      steps.each { |step| WorkflowContract.text!(step, maximum: 1000) }
      MuseEvidence.validate!(input["evidence"])
      affected = WorkflowContract.strings!(input["affected_workflow_ids"], minimum: 1, maximum: 116)
      affected.each { |id| workflow_id!(id) }
      AgentRoom.reject_credentials!(input)

      write!(credential:, auth:, input:, action: "defect") do |build|
        scopes = affected.sort.map { |id| fixture_scope!(id, credential) }
        archived = MuseEvidence.archive!(input["evidence"], credential:, build_pin: input["build_pin"], workflow_ids: affected, fixture_scopes: scopes)
        ledger = lock_ledger!
        defects = ledger.data.fetch("defects", Workspace.state.fetch("known_issues", []))
        raise Conflict, "The QA defect ledger is invalid." unless defects.is_a?(Array)
        id = defects.filter_map { |item| item["id"] if item.is_a?(Hash) && item["id"].is_a?(Integer) }.max.to_i + 1
        now = Time.current.iso8601(6)
        defect = { "id" => id, "title" => input["title"], "severity" => "unknown", "status" => "open",
          "workflow" => affected.first, "affected_workflow_ids" => affected, "repro_steps" => steps.join("\n"),
          "expected" => nil, "actual" => nil, "evidence" => archived, "evidence_refs" => archived.filter_map { |item| item["id"] }, "repair_attempts" => nil,
          "revision" => input["build_pin"], "version" => build["version"], "last_attempted_at" => now,
          "reported_by" => "Muse" }
        ledger.update!(data: ledger.data.merge("source_label" => "Muse authenticated write API", "defects" => defects + [defect]))
        { "defect_id" => id, "status" => "open", "affected_workflow_ids" => affected, "evidence" => archived,
          "build_pin" => input["build_pin"], "receipt_id" => SecureRandom.uuid }
      end
    end

    def self.prepare_test_data!(credential:, auth:, input:)
      WorkflowContract.object!(input, %w[workflow_id build_pin idempotency_key])
      workflow_id!(input["workflow_id"])

      write!(credential:, auth:, input:, action: "test_data") do |_build|
        scope = fixture_scope!(input["workflow_id"], credential)
        registry = Event.find(scope.fetch("fixture_receipt_id"))
        { "workflow_id" => input["workflow_id"], "build_pin" => input["build_pin"],
          "synthetic_verified" => true, "practice_id" => scope.fetch("practice_id"),
          "fixture_receipt_id" => scope.fetch("fixture_receipt_id"),
          "fixture_keys" => registry.payload.fetch("fixture_keys"), "receipt_id" => SecureRandom.uuid }
      end
    end

    def self.retest!(credential:, auth:, input:)
      WorkflowContract.object!(input, %w[workflow_id build_pin idempotency_key])
      workflow_id!(input["workflow_id"])

      write!(credential:, auth:, input:, action: "retest") do |_build|
        fixture_scope!(input["workflow_id"], credential)
        retests = lock_snapshot!(RETEST_SNAPSHOT)
        entries = retests.data.fetch("requests", [])
        prior = entries.find { |item| item["workflow_id"] == input["workflow_id"] && item["requested_on_build"] == input["build_pin"] }
        next prior if prior

        request = { "workflow_id" => input["workflow_id"], "requested_on_build" => input["build_pin"],
          "status" => "queued_for_next_build", "requested_at" => Time.current.iso8601(6), "receipt_id" => SecureRandom.uuid }
        retests.update!(data: { "requests" => entries + [request] })
        request
      end
    end

    def self.enroll!(user:, input:)
      WorkflowContract.object!(input, %w[fingerprint public_key build_pin idempotency_key])
      WorkflowContract.match!(input["build_pin"], SHA)
      key_text = input["public_key"]
      key = MuseCredential.public_key_for(key_text)
      computed = MuseCredential.fingerprint_for(key_text)
      raise ArgumentError, "Fingerprint does not match the submitted public key." unless computed == input["fingerprint"]
      idempotency_key!(input["idempotency_key"])
      owner!(user)

      pin_locked!(input["build_pin"]) do |build|
        owner!(user.reload)
        request_digest = WorkflowContract.fingerprint(input)
        event_key = "muse:enroll:#{input['idempotency_key']}"
        Event.transaction do
          if (prior = Event.find_by(event_key:))
            assert_replay!(prior, user:, fingerprint: computed, request_digest:)
            next prior.payload.fetch("receipt")
          end

          active = MuseCredential.active.lock.first
          if active && active.fingerprint != computed
            raise Conflict, "Revoke the active Muse key before approving a replacement."
          end
          credential = active || MuseCredential.create!(user:, approved_by: user, identity: "muse", fingerprint: computed,
            public_key_pem: key.public_to_pem, scopes: MuseCredential::SCOPES)
          raise Conflict, "This fingerprint is already bound to a different Muse owner." if credential.user_id != user.id
          receipt = { "identity" => "muse", "fingerprint" => computed, "scopes" => MuseCredential::SCOPES,
            "approved_at" => Time.current.iso8601(6), "build_pin" => build["revision"] }
          Event.create!(user:, event_key:, kind: "muse_key_enrolled", summary: "Approved scoped Muse key #{computed}",
            revision: build["revision"], payload: { "fingerprint" => computed, "request_digest" => request_digest, "receipt" => receipt })
          receipt
        end
      end
    end

    def self.revoke!(user:, input:)
      WorkflowContract.object!(input, %w[fingerprint build_pin idempotency_key])
      raise ArgumentError, "Fingerprint is invalid." unless input["fingerprint"].is_a?(String) && input["fingerprint"].match?(MuseRequestAuthenticator::FINGERPRINT_PATTERN)
      idempotency_key!(input["idempotency_key"])
      owner!(user)

      pin_locked!(input["build_pin"]) do |build|
        owner!(user.reload)
        request_digest = WorkflowContract.fingerprint(input)
        event_key = "muse:revoke:#{input['idempotency_key']}"
        Event.transaction do
          if (prior = Event.find_by(event_key:))
            assert_replay!(prior, user:, fingerprint: input["fingerprint"], request_digest:)
            next prior.payload.fetch("receipt")
          end
          credential = MuseCredential.active.lock.find_by(fingerprint: input["fingerprint"])
          raise Conflict, "No active Muse credential matches that fingerprint." unless credential
          credential.update!(revoked_at: Time.current)
          receipt = { "identity" => "muse", "fingerprint" => credential.fingerprint,
            "revoked_at" => credential.revoked_at.iso8601(6), "build_pin" => build["revision"] }
          Event.create!(user:, event_key:, kind: "muse_key_revoked", summary: "Revoked scoped Muse key #{credential.fingerprint}",
            revision: build["revision"], payload: { "fingerprint" => credential.fingerprint, "request_digest" => request_digest, "receipt" => receipt })
          receipt
        end
      end
    end

    def self.write!(credential:, auth:, input:, action:)
      config = ACTIONS.fetch(action)
      raise Denied, "The Muse key lacks the #{config[:scope]} scope." unless credential.scope?(config[:scope])
      idempotency_key!(input["idempotency_key"])
      WorkflowContract.match!(input["build_pin"], SHA)
      request_digest = WorkflowContract.fingerprint(input)
      event_key = "muse:#{action}:#{credential.fingerprint}:#{input['idempotency_key']}"

      Snapshot.transaction do
        registry_lock!
        credential.with_lock do
          credential.user.lock!
          raise Denied, "Muse credential is no longer active." unless credential.usable? && credential.scope?(config[:scope])
          MuseNonce.where(credential_id: credential.id).where("expires_at <= ?", Time.current).delete_all
          MuseNonce.create!(credential:, nonce: auth.nonce, expires_at: 11.minutes.from_now, created_at: Time.current)
          pin = Snapshot.find_by(key: "pin")
          raise Conflict, "No owner-confirmed build pin is available." unless pin
          pin.with_lock do
            build = exact_build!(input["build_pin"], pin.data)
            if (prior = Event.find_by(event_key:))
              assert_replay!(prior, credential:, fingerprint: credential.fingerprint, request_digest:)
              next prior.payload.fetch("receipt")
            end
            receipt = yield build
            exact_build!(input["build_pin"], pin.reload.data)
            Event.create!(user: credential.user, event_key:, kind: config[:kind], summary: "Muse #{action.tr('_', ' ')} recorded",
              revision: input["build_pin"], payload: { "fingerprint" => credential.fingerprint, "request_digest" => request_digest, "receipt" => receipt })
            credential.update!(last_used_at: Time.current)
            receipt
          end
        end
      end
    rescue ActiveRecord::RecordNotUnique
      raise MuseRequestAuthenticator::Unauthorized, "Muse request nonce was already used."
    end

    def self.exact_build!(requested_pin, confirmed_pin)
      build = Workspace.build
      approver = User.find_by(email_address: confirmed_pin["confirmed_by"], active: true)
      unless requested_pin == confirmed_pin["revision"] && requested_pin == build["revision"] &&
          build["dirty"] == false && build["error"].blank? && approver&.platform_owner?
        raise Conflict, "The exact build pin is stale or the live build is not clean."
      end
      build
    end

    # Called by the existing 15-second grid poll. Expiry retains the original
    # claim pin and appends a seal; it never transfers a claim to a new build.
    def self.expire_stale_claims!(build:)
      Snapshot.transaction do
        registry_lock!
        Snapshot.where("key LIKE ?", "#{WORKFLOW_SNAPSHOT}%").where("data ->> 'status' = 'in_progress'").lock.order(:key).each do |workflow|
          next if workflow.data["build_pin"] == build["revision"] && build["dirty"] == false && build["error"].blank?
          seal_claim!(workflow, build:)
        end
      end
    end

    def self.seal_claim!(workflow, build:)
      state = workflow.data
      receipt = state.fetch("receipt")
      reason = build["revision"].present? && build["revision"] != state["build_pin"] ? "build_changed" : "build_unavailable_or_dirty"
      seal = { "workflow_id" => receipt.fetch("workflow_id"), "build_pin" => state.fetch("build_pin"),
        "observed_build_pin" => build["revision"], "status" => "expired", "reason" => reason,
        "sealed_at" => Time.current.iso8601(6), "claim_receipt_id" => receipt.fetch("receipt_id") }
      credential = MuseCredential.find(state.fetch("credential_id"))
      Event.create!(user: credential.user, event_key: "muse:claim-expired:#{receipt.fetch('receipt_id')}", kind: "muse_workflow_claim_expired",
        summary: "Expired Muse claim #{receipt.fetch('workflow_id')}: #{reason}", revision: state.fetch("build_pin"), payload: seal)
      workflow.update!(data: state.merge("status" => "expired", "seal" => seal))
      ledger = Snapshot.lock.find_by(key: OfficeQa::KEY)
      return unless ledger

      rows = ledger.data.fetch("coverage", []).map do |row|
        if row["id"] == receipt["workflow_id"] && row["revision"] == state["build_pin"] && row["status"] == "in_progress"
          row.merge("status" => "expired", "result" => "expired", "seal" => seal)
        else
          row
        end
      end
      ledger.update!(data: ledger.data.merge("coverage" => rows))
    end

    def self.fixture_scope!(workflow_id, credential)
      WorkflowFixtureRegistry.resolve!(workflow: { "id" => workflow_id, "fixtures" => [] },
        principal: { name: "muse", key: "muse" }, user: credential.user)
    end

    def self.pin_locked!(requested_pin)
      WorkflowContract.match!(requested_pin, SHA)
      pin = Snapshot.find_by(key: "pin")
      raise Conflict, "No owner-confirmed build pin is available." unless pin
      Snapshot.transaction do
        registry_lock!
        pin.with_lock do
          build = exact_build!(requested_pin, pin.data)
          result = yield build
          exact_build!(requested_pin, pin.reload.data)
          result
        end
      end
    end

    # Serializes owner enrollment/revocation with machine writes before either
    # path takes row locks. This prevents lock-order cycles across credential
    # and pin rows while the active identity is replaced or revoked.
    def self.registry_lock!
      ApplicationRecord.connection.execute("SELECT pg_advisory_xact_lock(1297431877)")
    end

    def self.lock_snapshot!(key)
      now = Time.current
      Snapshot.insert_all([{ key:, data: {}, created_at: now, updated_at: now }], unique_by: :key)
      Snapshot.lock.find_by!(key:)
    end

    def self.lock_ledger!
      snapshot = lock_snapshot!(OfficeQa::KEY)
      return snapshot if snapshot.data.present?

      state = Workspace.state
      snapshot.update!(data: { "defects" => state.fetch("known_issues", []), "coverage" => state.fetch("coverage", []),
        "pointer" => state["coverage_pointer"], "batches" => state.fetch("batches", []),
        "source_label" => "Muse authenticated write API" })
      snapshot
    end

    def self.record_coverage!(workflow_id:, build:, values:)
      ledger = lock_ledger!
      rows = ledger.data.fetch("coverage", [])
      raise Conflict, "The QA coverage ledger is invalid." unless rows.is_a?(Array)
      current = rows.find { |item| item.is_a?(Hash) && item["id"] == workflow_id }
      updated = (current || { "id" => workflow_id }).merge(values).merge("historical" => false)
      rows = rows.reject { |item| item.is_a?(Hash) && item["id"] == workflow_id } + [updated]
      rows.sort_by! { |item| item["id"] }
      ledger.update!(data: ledger.data.merge("coverage" => rows, "pointer" => workflow_id,
        "source_label" => "Muse authenticated write API", "last_written_at" => Time.current.iso8601(6)))
    end

    def self.workflow_id!(value)
      WorkflowContract.workflow!(value)
    end

    def self.idempotency_key!(value)
      WorkflowContract.match!(value, KEY)
    end

    def self.owner!(user)
      raise Denied, "An active platform-owner session is required." unless user&.active? && user.platform_owner?
    end

    def self.assert_replay!(event, user: nil, credential: nil, fingerprint:, request_digest:)
      principal = credential ? event.payload["fingerprint"] == credential.fingerprint : event.user_id == user.id && event.payload["fingerprint"] == fingerprint
      raise Conflict, "Idempotency key records different content or identity." unless principal && event.payload["request_digest"] == request_digest
    end

    private_class_method :exact_build!, :pin_locked!, :registry_lock!, :seal_claim!, :fixture_scope!, :lock_snapshot!, :lock_ledger!, :record_coverage!, :workflow_id!, :idempotency_key!, :owner!, :assert_replay!
  end
end
