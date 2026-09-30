require "minitest/autorun"
require_relative "../../../app/services/qa/office_actor_policy"

class OfficeActorPolicyTest < Minitest::Test
  User = Struct.new(:id, :active, :platform_owner) do
    alias_method :active?, :active
    alias_method :platform_owner?, :platform_owner
  end
  Token = Struct.new(:id, :user_id, :recipient, :revoked_at) do
    def office? = true
  end
  def setup
    @config = { "QA_OFFICE_ACTORS_ENABLED" => "1", "QA_OFFICE_JOSH_USER_ID" => "10",
      "QA_OFFICE_MUSE_TOKEN_ID" => "20", "QA_OFFICE_DOT_TOKEN_ID" => "30" }
    @owner = User.new(10, true, true)
  end

  def actor(token = nil, config: @config, user: @owner)
    Qa::OfficeActorPolicy.actor(config:, user:, token:)
  end

  def test_disabled_by_default_even_for_owner
    assert_raises(Qa::OfficeActorPolicy::Denied) { actor(config: {}) }
  end

  def test_designated_owner_session_controls_only_josh
    assert_equal "josh", actor
    assert_raises(Qa::OfficeActorPolicy::Denied) { actor(user: User.new(11, true, true)) }
    assert_raises(Qa::OfficeActorPolicy::Denied) { actor(user: nil) }
  end

  def test_dedicated_tokens_control_only_their_server_mapped_actor
    assert_equal "muse", actor(Token.new(20, 10, "muse", nil))
    assert_equal "dot", actor(Token.new(30, 10, "codex", nil))
  end

  def test_recipient_labels_and_shared_owner_do_not_select_muse
    assert_raises(Qa::OfficeActorPolicy::Denied) { actor(Token.new(21, 10, "muse", nil)) }
    assert_raises(Qa::OfficeActorPolicy::Denied) { actor(Token.new(20, 10, "codex", nil)) }
    assert_raises(Qa::OfficeActorPolicy::Denied) { actor(Token.new(30, 10, "muse", nil)) }
  end

  def test_revoked_inactive_nonowner_or_wrong_user_principals_fail_closed
    assert_raises(Qa::OfficeActorPolicy::Denied) { actor(Token.new(20, 10, "muse", Time.now)) }
    assert_raises(Qa::OfficeActorPolicy::Denied) { actor(Token.new(20, 11, "muse", nil)) }
    assert_raises(Qa::OfficeActorPolicy::Denied) { actor(user: User.new(10, false, true)) }
    assert_raises(Qa::OfficeActorPolicy::Denied) { actor(user: User.new(10, true, false)) }
  end

  def test_duplicate_token_binding_is_rejected
    assert_raises(Qa::OfficeActorPolicy::Denied) { actor(Token.new(20, 10, "muse", nil), config: @config.merge("QA_OFFICE_DOT_TOKEN_ID" => "20")) }
  end

  def test_binding_ids_are_strict_nonsecret_positive_references
    [ nil, "", "0", "-1", "1x", "1.0", " 20", "qa_secret", 20 ].each { |value| assert_nil Qa::OfficeActorPolicy.positive_id(value) }
    assert_equal 20, Qa::OfficeActorPolicy.positive_id("20")
  end

  def test_position_input_accepts_only_bounds_revision_and_idempotency_key
    input = { "x" => 5, "y" => 4, "expected_revision" => 0, "request_key" => "synthetic-123" }
    assert_equal input, Qa::OfficeActorPolicy.input(input, kind: "position")
    [ { "actor" => "muse" }, { "receivedAtMs" => 1 }, { "x" => 10 }, { "y" => 0 }, { "x" => "5" }, { "expected_revision" => -1 }, { "request_key" => "Bearer secret" } ].each do |change|
      assert_raises(ArgumentError) { Qa::OfficeActorPolicy.input(input.merge(change), kind: "position") }
    end
  end

  def test_check_in_does_not_accept_client_time_or_principal
    input = { "expected_revision" => 0, "request_key" => "synthetic-123" }
    assert_equal input, Qa::OfficeActorPolicy.input(input, kind: "check_in")
    %w[actor principal_id receipt receivedAtMs cadence].each do |key|
      assert_raises(ArgumentError) { Qa::OfficeActorPolicy.input(input.merge(key => "forged"), kind: "check_in") }
    end
  end

  def test_missing_cadence_remains_unknown_and_invalid_values_never_create_schedule
    [ nil, "", "0", "9", "86401", "60s" ].each { |value| assert_nil Qa::OfficeActorPolicy.cadence({ "QA_OFFICE_MUSE_CADENCE_SECONDS" => value }) }
    assert_equal 60_000, Qa::OfficeActorPolicy.cadence({ "QA_OFFICE_MUSE_CADENCE_SECONDS" => "60" })
  end
end
