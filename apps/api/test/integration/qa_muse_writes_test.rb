require "test_helper"
require_relative "../support/qa_workflow_contract_fixtures"

class QaMuseWritesTest < ActionDispatch::IntegrationTest
  include QaWorkflowContractFixtures

  setup do
    @owner = User.create!(email_address: "muse-api-owner@example.invalid", password: "Synthetic-workflow-only!", platform_owner: true, active: true)
    @key = OpenSSL::PKey.generate_key("ED25519")
    @credential = Qa::MuseCredential.create!(user: @owner, approved_by: @owner, identity: "muse",
      public_key_pem: @key.public_to_pem, fingerprint: Qa::MuseCredential.fingerprint_for(@key), scopes: Qa::MuseCredential::SCOPES)
    @revision = "d" * 40
    @build = { "revision" => @revision, "dirty" => false, "version" => "synthetic-test" }
    Qa::Snapshot.put("pin", { "revision" => @revision, "confirmed_by" => @owner.email_address })
    Qa::Snapshot.put(Qa::OfficeQa::KEY, { "defects" => [], "coverage" => [], "batches" => [] })
    @practice = Clinic::Practice.create!(name: "Independently synthetic Muse acceptance")
    Clinic::Membership.create!(practice: @practice, user: @owner)
    @registry = Qa::Event.create!(user: @owner, event_key: "muse-api-independent-fixtures", kind: "workflow_fixture_verified", summary: "Independent synthetic acceptance fixture provenance",
      payload: { schema_version: 1, practice_id: @practice.id, workflow_ids: %w[WF-001 WF-002], principal_keys: ["muse"], fixture_keys: ["empty_board"], verification_ref: "independently-created-test-records" })
    @observation = { "kind" => "observation", "text" => "  Verbatim observation.\nSecond line: ✓  " }
  end

  def with_build(&block)
    with_qa_method(Qa::Workspace, :build, -> { @build.dup }, &block)
  end

  def csrf_headers
    get "/api/csrf"
    { "X-CSRF-Token" => response.parsed_body.fetch("csrf_token"), "Origin" => "http://www.example.com" }
  end

  def body(fields = {})
    { "workflow_id" => "WF-001", "build_pin" => @revision, "idempotency_key" => SecureRandom.uuid }.merge(fields)
  end

  def verdict(fields = {})
    body("verdict" => "pass", "evidence" => [@observation]).merge(fields)
  end

  def headers_for(path, raw, nonce: SecureRandom.urlsafe_base64(24), timestamp: Time.current.to_i.to_s)
    canonical = ["POST", path, timestamp, nonce, Digest::SHA256.hexdigest(raw)].join("\n")
    { "CONTENT_TYPE" => "application/json", "X-Muse-Key-Fingerprint" => @credential.fingerprint,
      "X-Muse-Timestamp" => timestamp, "X-Muse-Nonce" => nonce,
      "X-Muse-Signature" => Base64.urlsafe_encode64(@key.sign(nil, canonical), padding: false) }
  end

  def signed_post(path, input, **options)
    raw = JSON.generate(input)
    post path, params: raw, headers: headers_for(path, raw, **options)
  end

  test "direct verdict is visible on the next grid read and observations stay verbatim" do
    with_build do
      signed_post "/qa/api/verdict", verdict
      assert_response :created
      receipt = response.parsed_body
      assert_equal [@observation], receipt["evidence"]
      get "/api/qa/office/qa"
      assert_response :success
      row = response.parsed_body.dig("coverage", "workflows").find { |item| item["id"] == "WF-001" }
      assert_equal "pass", row["status"]
      assert_equal @revision, row["revision"]
      assert_equal [@observation], row["evidence"]
      assert_equal false, row["stale_build"]
    end
  end

  test "screenshot bytes are archived atomically and successful retries do not fetch again" do
    png = "\x89PNG\r\n\x1a\n".b + "independent-synthetic-image"
    input = verdict("evidence" => [@observation, { "kind" => "screenshot", "url" => "https://files.example.invalid/image.png?temporary=expired-later" }])
    with_build do
      with_qa_method(Qa::MuseEvidence, :download!, ->(_url) { [png, "image/png"] }) do
        assert_difference "Qa::Evidence.count", 1 do
          signed_post "/qa/api/verdict", input
          assert_response :created
        end
      end
      receipt = response.parsed_body
      image = receipt["evidence"].last
      assert_equal Digest::SHA256.hexdigest(png), image["sha256"]
      assert_equal png, Qa::Evidence.find(image["id"]).image
      assert_not_includes Qa::Event.last.payload.to_json, "temporary=expired-later"
      with_qa_method(Qa::MuseEvidence, :download!, ->(_url) { raise "Expired URL must never be fetched on a replay" }) do
        assert_no_difference ["Qa::Evidence.count", "Qa::Event.count"] do
          signed_post "/qa/api/verdict", input
          assert_response :created
          assert_equal receipt, response.parsed_body
        end
      end
      get image["url"]
      assert_response :success
      assert_equal png, response.body.b
      signed_post "/qa/api/verdict", verdict("evidence" => [{ "kind" => "qa_evidence_id", "id" => image["id"] }])
      assert_response :created
      signed_post "/qa/api/verdict", verdict("workflow_id" => "WF-002", "evidence" => [{ "kind" => "qa_evidence_id", "id" => image["id"] }])
      assert_response :forbidden
    end
  end

  test "failed archive rolls back but deployment during archive records a boundary" do
    input = verdict("evidence" => [{ "kind" => "screenshot", "url" => "https://files.example.invalid/image.png" }])
    with_build do
      with_qa_method(Qa::MuseEvidence, :download!, ->(_url) { raise Qa::MuseEvidence::ArchiveFailed, "Expired file" }) do
        assert_no_difference ["Qa::Evidence.count", "Qa::Event.count", "Qa::Snapshot.count"] do
          signed_post "/qa/api/verdict", input
          assert_response :unprocessable_entity
          assert_equal "screenshot_archive_failed", response.parsed_body["code"]
        end
      end
      with_qa_method(Qa::MuseEvidence, :download!, ->(_url) { @build["revision"] = "e" * 40; ["\x89PNG\r\n\x1a\n".b, "image/png"] }) do
        assert_difference "Qa::Evidence.count", 1 do
          signed_post "/qa/api/verdict", input
          assert_response :created
          observations = response.parsed_body.fetch("server_build_observations")
          assert_equal [@revision, "e" * 40, "e" * 40], observations.map { |item| item["revision"] }
          assert_equal "deployment_changed", observations.last["boundary"]
          assert_equal @revision, response.parsed_body.fetch("evidence").first.fetch("build_pin")
          assert_equal true, response.parsed_body["mixed_build"]
          get "/api/qa/office/qa"
          assert_equal true, response.parsed_body.dig("coverage", "workflows").first["stale_build"]
        end
      end
    end
  end

  test "every machine action records stale reported builds but rejects unverified synthetic scope" do
    actions = {
      "/qa/api/workflow/claim" => body("agent" => "Muse"), "/qa/api/verdict" => verdict,
      "/qa/api/defect" => { "build_pin" => @revision, "idempotency_key" => SecureRandom.uuid, "title" => "Synthetic defect", "repro_steps" => ["Open board"], "evidence" => [@observation], "affected_workflow_ids" => ["WF-001"] },
      "/qa/api/test-data/prepare" => body, "/qa/api/retest-request" => body
    }
    with_build do
      actions.each do |path, input|
        signed_post path, input.merge("build_pin" => "e" * 40)
        assert_response :created
        observation = response.parsed_body.fetch("server_build_observations").first
        assert_equal @revision, observation["revision"]
        assert_equal "e" * 40, observation["reported_revision"]
        assert_equal "deployment_changed", observation["boundary"]
      end
      Qa::Event.create!(user: @owner, event_key: "muse-fixture-revoked", kind: "workflow_fixture_revoked", summary: "Revoke synthetic registry", payload: { fixture_receipt_id: @registry.id })
      actions.each do |path, input|
        assert_no_difference ["Qa::Event.count", "Qa::Snapshot.count", "Qa::Evidence.count"] do
          signed_post path, input.merge("idempotency_key" => SecureRandom.uuid)
          assert_response :forbidden
        end
      end
    end
  end

  test "dirty absent metadata and absent legacy pins do not block authenticated verdicts" do
    with_build do
      Qa::Snapshot.find_by!(key: "pin").destroy!
      [true, nil].each do |dirty|
        @build["dirty"] = dirty
        signed_post "/qa/api/verdict", verdict
        assert_response :created
        assert_equal dirty, response.parsed_body.dig("server_build_observations", 0, "dirty")
      end
      @build["revision"] = nil
      signed_post "/qa/api/verdict", verdict("build_pin" => nil)
      assert_response :created
      assert_equal "unobserved", response.parsed_body["build_pin"]
      assert_equal "unavailable", response.parsed_body.dig("server_build_observations", 0, "status")
    end
  end

  test "historical screenshot reuse cannot imply current build acceptance" do
    with_build do
      artifact = Qa::Evidence.create!(user: @owner, issue_number: nil, workflow_ids: ["WF-001"], revision: @revision,
        caption: "Synthetic older screenshot", content_type: "image/png", phase: "observation",
        image: "\x89PNG\r\n\x1a\n".b, digest: "e" * 64,
        context: { "fixture_scopes" => [Qa::MuseWrites.send(:fixture_scope!, "WF-001", @credential)] })
      @build["revision"] = "e" * 40
      signed_post "/qa/api/verdict", verdict("build_pin" => "e" * 40, "evidence" => [{ "kind" => "qa_evidence_id", "id" => artifact.id }])
      assert_response :created
      assert_equal @revision, response.parsed_body.fetch("evidence").first.fetch("build_pin")
      assert_equal true, response.parsed_body["mixed_build"]
      assert_equal [@revision], response.parsed_body["evidence_revisions"]
      get "/api/qa/office/qa"
      assert_equal true, response.parsed_body.dig("coverage", "workflows").first["stale_build"]
      assert_equal @revision, artifact.reload.revision
    end
  end

  test "deployment retains an active claim and records subsequent verdict observations" do
    with_build do
      signed_post "/qa/api/workflow/claim", body("agent" => "Muse")
      assert_response :created
      claim = response.parsed_body
      @build["revision"] = "e" * 40
      get "/api/qa/office/qa"
      assert_response :success
      row = response.parsed_body.dig("coverage", "workflows").first
      assert_equal "in_progress", row["status"]
      assert_equal @revision, row["revision"]
      assert_nil Qa::Event.find_by(event_key: "muse:claim-expired:#{claim['receipt_id']}")
      signed_post "/qa/api/workflow/claim", body("agent" => "Muse", "build_pin" => "e" * 40)
      assert_response :conflict
      signed_post "/qa/api/verdict", verdict
      assert_response :created
      assert_equal "e" * 40, response.parsed_body.dig("server_build_observations", 0, "revision")
      assert_equal @revision, response.parsed_body["build_pin"]
    end
  end

  test "only an elapsed lease expires a claim while retaining its original revision" do
    freeze_time do
      with_build do
        signed_post "/qa/api/workflow/claim", body("agent" => "Muse")
        assert_response :created
        claim = response.parsed_body
        travel 16.minutes
        get "/api/qa/office/qa"
        assert_response :success
        row = response.parsed_body.dig("coverage", "workflows").first
        assert_equal "expired", row["status"]
        assert_equal @revision, row["revision"]
        assert_equal "lease_expired", row.dig("seal", "reason")
        assert_equal @revision, Qa::Event.find_by!(event_key: "muse:claim-expired:#{claim['receipt_id']}").revision
      end
    end
  end

  test "replayed nonces conflicting keys tampering and out of scope paths cannot write" do
    with_build do
      input = verdict
      nonce = SecureRandom.urlsafe_base64(24)
      signed_post("/qa/api/verdict", input, nonce: nonce)
      assert_response :created
      assert_no_difference "Qa::Event.count" do
        signed_post("/qa/api/verdict", input, nonce: nonce)
        assert_response :unauthorized
        signed_post "/qa/api/verdict", input.merge("verdict" => "fail")
        assert_response :conflict
        raw = JSON.generate(input)
        post "/qa/api/verdict", params: JSON.generate(input.merge("verdict" => "blocked")), headers: headers_for("/qa/api/verdict", raw)
        assert_response :unauthorized
        %w[/api/qa/state /api/qa/room/messages /api/clinic/facilities /qa/api/enrollment/approve].each do |path|
          signed_post path, input
          assert_response :forbidden
        end
      end
      @credential.update!(revoked_at: Time.current)
      signed_post "/qa/api/verdict", verdict
      assert_response :unauthorized
    end
  end

  test "clock tolerance is inclusive plus or minus 300 seconds" do
    freeze_time do
      with_build do
        [-300, 300].each do |delta|
          signed_post "/qa/api/verdict", verdict, timestamp: (Time.current.to_i + delta).to_s
          assert_response :created
        end
        [-301, 301].each do |delta|
          signed_post "/qa/api/verdict", verdict, timestamp: (Time.current.to_i + delta).to_s
          assert_response :unauthorized
        end
      end
    end
  end

  test "defect test data and retest writes have receipts and are retry safe" do
    with_build do
      signed_post "/qa/api/test-data/prepare", body
      assert_response :created
      assert_equal true, response.parsed_body["synthetic_verified"]
      assert_equal @registry.id, response.parsed_body["fixture_receipt_id"]
      defect = { "build_pin" => @revision, "idempotency_key" => SecureRandom.uuid, "title" => "Synthetic broken board", "repro_steps" => ["Open board", "Observe result"], "evidence" => [@observation], "affected_workflow_ids" => ["WF-001"] }
      signed_post "/qa/api/defect", defect
      assert_response :created
      receipt = response.parsed_body
      signed_post "/qa/api/defect", defect
      assert_response :created
      assert_equal receipt, response.parsed_body
      assert_equal 1, Qa::Snapshot.find_by!(key: Qa::OfficeQa::KEY).data["defects"].length
      input = body
      signed_post "/qa/api/retest-request", input
      assert_response :created
      receipt = response.parsed_body
      signed_post "/qa/api/retest-request", input
      assert_response :created
      assert_equal receipt, response.parsed_body
      get "/api/qa/office/qa"
      assert_equal true, response.parsed_body["retest_requests"].first["ready"]
      @build["revision"] = "e" * 40
      Qa::Snapshot.put("pin", { "revision" => @build["revision"], "confirmed_by" => @owner.email_address })
      get "/api/qa/office/qa"
      assert_equal true, response.parsed_body["retest_requests"].first["ready"]
    end
  end

  test "signed bodies reject extra fields duplicate keys and untyped evidence" do
    with_build do
      [verdict("synthetic" => true), verdict("evidence" => ["https://example.invalid/image.png"]), verdict("evidence" => [{ "kind" => "observation", "text" => "observed", "accepted" => true }])].each do |input|
        signed_post "/qa/api/verdict", input
        assert_response :unprocessable_entity
      end
      raw = JSON.generate(verdict).sub('"verdict":"pass"', '"verdict":"pass","verdict":"fail"')
      post "/qa/api/verdict", params: raw, headers: headers_for("/qa/api/verdict", raw)
      assert_response :unprocessable_entity
    end
  end

  test "OpenSSH and PEM use the same familiar fingerprint" do
    public_key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINYZy72OJGCrypyIGsbsN0eqcrjeeqrJ+ZwuCye7+7b3 muse-qa-writer"
    expected = "SHA256:6cyhnqQS0FA8R8kDxav9GUZgijkQx5QRd5DYb+Qs+E4"
    key = Qa::MuseCredential.public_key_for(public_key)
    assert_equal expected, Qa::MuseCredential.fingerprint_for(public_key)
    assert_equal expected, Qa::MuseCredential.fingerprint_for(key.public_to_pem)
    assert_match Qa::MuseRequestAuthenticator::FINGERPRINT_PATTERN, expected
    assert_raises(ArgumentError) { Qa::MuseCredential.public_key_for(@key.private_to_pem) }
    assert_raises(ArgumentError) { Qa::MuseCredential.public_key_for("ssh-ed25519 AAAA") }
  end

  test "enrollment checks the fingerprint owner session fixed scopes and revocation" do
    new_key = OpenSSL::PKey.generate_key("ED25519")
    input = { "fingerprint" => Qa::MuseCredential.fingerprint_for(new_key), "public_key" => new_key.public_to_pem,
      "build_pin" => @revision, "idempotency_key" => SecureRandom.uuid }
    with_build do
      post "/qa/api/enrollment/approve", params: input, headers: csrf_headers, as: :json
      assert_response :forbidden
      post "/api/session", params: { email_address: @owner.email_address, password: "Synthetic-workflow-only!" }, headers: csrf_headers, as: :json
      assert_response :success
      revoke = { "fingerprint" => @credential.fingerprint, "build_pin" => @revision, "idempotency_key" => SecureRandom.uuid }
      post "/qa/api/enrollment/revoke", params: revoke, headers: csrf_headers, as: :json
      assert_response :success
      post "/qa/api/enrollment/approve", params: input.merge("fingerprint" => @credential.fingerprint), headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
      post "/qa/api/enrollment/approve", params: input, headers: csrf_headers, as: :json
      assert_response :created
      assert_equal Qa::MuseCredential::SCOPES, response.parsed_body["scopes"]
      assert_no_difference "Qa::MuseCredential.count" do
        post "/qa/api/enrollment/approve", params: input, headers: csrf_headers, as: :json
        assert_response :created
      end
    end
  end

  test "archive fetch rejects private destinations even when a host is configured" do
    prior = ENV["QA_MUSE_EVIDENCE_HOSTS"]
    ENV["QA_MUSE_EVIDENCE_HOSTS"] = "files.example.invalid"
    with_qa_method(Resolv, :getaddresses, ->(_host) { ["127.0.0.1"] }) do
      assert_raises(Qa::MuseEvidence::ArchiveFailed) { Qa::MuseEvidence.download!("https://files.example.invalid/image.png") }
    end
    assert_raises(Qa::MuseEvidence::ArchiveFailed) { Qa::MuseEvidence.download!("https://unapproved.example.invalid/image.png") }
  ensure
    ENV["QA_MUSE_EVIDENCE_HOSTS"] = prior
  end
end
