# Run with Rails runner on the authorized QA API host. No private key is needed.
# This creates a fresh empty QA result workspace; it does not attest that clinical
# workflow scenarios have been executed or populated in another database.
require "digest"
require "json"

fingerprint = ENV.fetch("MUSE_QA_FINGERPRINT")
build_pin = ENV.fetch("MUSE_QA_BUILD_PIN")
expected_database = ENV.fetch("MUSE_QA_DATABASE")
apply = ENV["MUSE_QA_REGISTER"] == "yes"
raise "Wrong database" unless ApplicationRecord.connection.current_database == expected_database
raise "Invalid public fingerprint" unless fingerprint.match?(Qa::MuseRequestAuthenticator::FINGERPRINT_PATTERN)
workflows = (1..116).map { |number| format("WF-%03d", number) }
fixture_keys = ["empty_qa_write_workspace_v1"]
provision_key = "muse:fixture-provision:v1:#{fingerprint}"
registry_key = "muse:fixture-registry:v1:#{fingerprint}"
result = nil

Qa::Snapshot.transaction do
  # The same lock and exact owner/live pin gate used by all Muse writes.
  Qa::MuseWrites.send(:pin_locked!, build_pin) do |build|
    credential = Qa::MuseCredential.active.lock.find_by!(fingerprint: fingerprint)
    credential.user.lock!
    raise "Approved Muse identity is unavailable" unless credential.usable? && credential.identity == "muse" && credential.scopes == Qa::MuseCredential::SCOPES
    raise "Key mismatch" unless Qa::MuseCredential.fingerprint_for(credential.public_key) == fingerprint
    owner = credential.user
    provision = Qa::Event.find_by(event_key: provision_key)
    registry = Qa::Event.find_by(event_key: registry_key)
    raise "Incomplete prior registration" unless provision.present? == registry.present?
    created = registry.nil?

    if created
      # Provenance comes from creation in this transaction, never its display name.
      practice = Clinic::Practice.create!(name: "Muse QA result workspace", timezone: "UTC")
      membership = Clinic::Membership.create!(practice: practice, user: owner, active: true)
      raise "Unexpected populated fixture" unless practice.patients.empty? && membership.role_grants.empty?
      provision = Qa::Event.create!(user: owner, event_key: provision_key,
        kind: "muse_fixture_provisioned", summary: "Server generated an empty Muse QA result workspace",
        revision: build.fetch("revision"), payload: {
          "schema_version" => 1, "origin" => "server_generated_empty_workspace",
          "practice_id" => practice.id, "credential_id" => credential.id,
          "fingerprint" => fingerprint, "fixture_keys" => fixture_keys
        })
      registry = Qa::Event.create!(user: owner, event_key: registry_key,
        kind: Qa::WorkflowFixtureRegistry::KIND, summary: "Verified Muse QA result fixture scope for WF-001 through WF-116",
        revision: build.fetch("revision"), payload: {
          "schema_version" => 1, "practice_id" => practice.id,
          "workflow_ids" => workflows, "principal_keys" => ["muse"], "fixture_keys" => fixture_keys,
          "verification_ref" => "qa:event:#{provision.id}:#{Digest::SHA256.hexdigest(Qa::WorkflowContract.fingerprint(provision.payload))}"
        })
    end

    expected_provenance = { "schema_version" => 1, "origin" => "server_generated_empty_workspace",
      "practice_id" => registry.payload.fetch("practice_id"), "credential_id" => credential.id,
      "fingerprint" => fingerprint, "fixture_keys" => fixture_keys }
    raise "Provenance mismatch" unless provision.kind == "muse_fixture_provisioned" &&
      provision.user_id == owner.id && provision.payload == expected_provenance && registry.user_id == owner.id &&
      registry.payload.fetch("workflow_ids") == workflows && registry.payload.fetch("principal_keys") == ["muse"] &&
      registry.payload.fetch("verification_ref") == "qa:event:#{provision.id}:#{Digest::SHA256.hexdigest(Qa::WorkflowContract.fingerprint(provision.payload))}"
    workflows.each do |workflow_id|
      scope = Qa::WorkflowFixtureRegistry.resolve!(workflow: { "id" => workflow_id, "fixtures" => [] },
        principal: { name: "muse", key: "muse" }, user: owner)
      raise "Registry scope mismatch" unless scope.fetch("fixture_receipt_id") == registry.id && scope.fetch("practice_id") == registry.payload.fetch("practice_id")
    end
    result = { dry_run: !apply, created: created, fingerprint: fingerprint,
      build_pin: build.fetch("revision"), registry_receipt_id: registry.id,
      provenance_receipt_id: provision.id, practice_id: registry.payload.fetch("practice_id"),
      verified_workflows: workflows.length, fixture_keys: fixture_keys }
  end
  raise ActiveRecord::Rollback unless apply
end
puts JSON.generate(result)
