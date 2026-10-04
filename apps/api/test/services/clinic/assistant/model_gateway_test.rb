require "test_helper"

class Clinic::Assistant::ModelGatewayTest < ActiveSupport::TestCase
  setup do
    @env_names = %w[
      APP_DEPLOYMENT_ENV CLINIC_ASSISTANT_ENABLED CLINIC_ASSISTANT_SYNTHETIC
      CLINIC_ASSISTANT_ALLOW_SYNTHETIC_PROVIDER CLINIC_ASSISTANT_PROVIDER
      OPENROUTER_API_KEY OPENROUTER_ASSISTANT_MODEL CLINIC_ASSISTANT_ACCOUNT_DAILY_CAP
      CLINIC_ASSISTANT_PRACTICE_DAILY_CAP CLINIC_ASSISTANT_USER_DAILY_CAP
    ]
    @prior_env = @env_names.to_h { |name| [ name, ENV[name] ] }
    ENV["APP_DEPLOYMENT_ENV"] = "development"
    ENV["CLINIC_ASSISTANT_ENABLED"] = "1"
    ENV["CLINIC_ASSISTANT_SYNTHETIC"] = "1"
    ENV.delete("CLINIC_ASSISTANT_ALLOW_SYNTHETIC_PROVIDER")
    ENV["CLINIC_ASSISTANT_PROVIDER"] = "openrouter"
    ENV["OPENROUTER_API_KEY"] = "test-openrouter-key"
    ENV.delete("OPENROUTER_ASSISTANT_MODEL")
    ENV["CLINIC_ASSISTANT_ACCOUNT_DAILY_CAP"] = "50"
    ENV["CLINIC_ASSISTANT_PRACTICE_DAILY_CAP"] = "40"
    ENV["CLINIC_ASSISTANT_USER_DAILY_CAP"] = "15"
  end

  teardown do
    @prior_env.each { |name, value| value ? ENV[name] = value : ENV.delete(name) }
  end

  test "verified free model is default and request forwards only booking text plus date context" do
    captured_input = nil
    provider = Object.new
    provider.define_singleton_method(:call) do |input|
      captured_input = input
      { status: "intent", intent: { date: "2026-10-05", time: "09:30", duration_minutes: 30 } }
    end
    reserved = []

    with_stubbed_method(Clinic::Assistant::Providers::OpenRouter, :new, ->(model:) {
      assert_equal "qwen/qwen3.8-27b:free", model
      provider
    }) do
      with_stubbed_method(Clinic::AssistantRequestBudget, :reserve!, ->(**scope) { reserved << scope }) do
        result = gateway.call(request_text: "tomorrow at 09:30 for 30 minutes", current_date: "2026-10-04",
          requested_date: "2026-10-05", timezone: "America/Chicago", user_id: 72, practice_id: 19)

        assert_equal "intent", result.fetch(:status)
        assert_equal %i[current_date request_text requested_date timezone].sort, captured_input.keys.sort
        assert_equal "2026-10-04", captured_input.fetch(:current_date)
        assert_equal "2026-10-05", captured_input.fetch(:requested_date)
        assert_equal "America/Chicago", captured_input.fetch(:timezone)
        assert_equal [ { user_id: 72, practice_id: 19 } ], reserved
      end
    end
  end

  test "built-in OpenRouter free router remains explicitly available" do
    ENV["OPENROUTER_ASSISTANT_MODEL"] = "openrouter/free"
    provider = Object.new
    provider.define_singleton_method(:call) { |_input| { status: "clarify", message: "What date would you prefer?" } }

    with_stubbed_method(Clinic::Assistant::Providers::OpenRouter, :new, ->(model:) {
      assert_equal "openrouter/free", model
      provider
    }) do
      with_stubbed_method(Clinic::AssistantRequestBudget, :reserve!, ->(**) { }) do
        result = gateway.call(request_text: "find openings", current_date: "2026-10-04", timezone: "UTC",
          user_id: 1, practice_id: 1)
        assert_equal "clarify", result.fetch(:status)
      end
    end
  end

  test "free variant must have a free suffix and unsupported paid provider is unavailable" do
    ENV.delete("OPENROUTER_API_KEY")
    error = assert_raises(Clinic::Assistant::ModelGateway::Unavailable) do
      gateway.call(request_text: "find openings", current_date: "2026-10-04", timezone: "UTC", user_id: 1, practice_id: 1)
    end
    assert_includes error.message, "OpenRouter is not configured"
    ENV["OPENROUTER_API_KEY"] = "test-openrouter-key"

    ENV["OPENROUTER_ASSISTANT_MODEL"] = "openai/gpt-example"
    error = assert_raises(Clinic::Assistant::ModelGateway::Unavailable) do
      gateway.call(request_text: "find openings", current_date: "2026-10-04", timezone: "UTC", user_id: 1, practice_id: 1)
    end
    assert_includes error.message, "validated free model variant"

    ENV["OPENROUTER_ASSISTANT_MODEL"] = "provider/model-name:free"
    provider = Object.new
    provider.define_singleton_method(:call) do |_input|
      { status: "clarify", message: "What date would you prefer?" }
    end
    with_stubbed_method(Clinic::Assistant::Providers::OpenRouter, :new, ->(model:) {
      assert_equal "provider/model-name:free", model
      provider
    }) do
      with_stubbed_method(Clinic::AssistantRequestBudget, :reserve!, ->(**) { }) do
        assert_equal "clarify", gateway.call(request_text: "find openings", current_date: "2026-10-04",
          timezone: "UTC", user_id: 1, practice_id: 1).fetch(:status)
      end
    end

    ENV["CLINIC_ASSISTANT_PROVIDER"] = "openai"
    error = assert_raises(Clinic::Assistant::ModelGateway::Unavailable) do
      gateway.call(request_text: "find openings", current_date: "2026-10-04", timezone: "UTC", user_id: 1, practice_id: 1)
    end
    assert_includes error.message, "gated pending approved BAA"
  end

  test "synthetic provider resolves relative dates from the trusted clinic date" do
    ENV["CLINIC_ASSISTANT_PROVIDER"] = "synthetic"
    ENV["CLINIC_ASSISTANT_ALLOW_SYNTHETIC_PROVIDER"] = "1"

    with_stubbed_method(Clinic::AssistantRequestBudget, :reserve!, ->(**) { }) do
      result = gateway.call(request_text: "tomorrow at 09:30 for 30 minutes", current_date: "2026-10-04",
        timezone: "America/Chicago", user_id: 72, practice_id: 19)

      assert_equal({ status: "intent", intent: { date: "2026-10-05", time: "09:30", duration_minutes: 30 } }, result)
    end
  end

  test "provider retry count is bounded and every outbound attempt reserves budget" do
    attempts = 0
    reserves = []
    provider = Object.new
    provider.define_singleton_method(:call) do |_input|
      attempts += 1
      raise Clinic::Assistant::Providers::OpenRouter::RetryableError
    end

    with_stubbed_method(Clinic::Assistant::Providers::OpenRouter, :new, ->(model:) { provider }) do
      with_stubbed_method(Clinic::AssistantRequestBudget, :reserve!, ->(**scope) { reserves << scope }) do
        error = assert_raises(Clinic::Assistant::ModelGateway::ProviderError) do
          gateway.call(request_text: "find openings", current_date: "2026-10-04", timezone: "UTC",
            user_id: 72, practice_id: 19)
        end
        assert_includes error.message, "temporarily unavailable"
      end
    end

    assert_equal 2, attempts
    assert_equal [ { user_id: 72, practice_id: 19 } ] * 2, reserves
  end

  test "local and provider quotas have explicit quota states" do
    calls = 0
    organization = Organization.create!(name: "Synthetic Assistant Gateway Quota Organization")
    practice = Clinic::Practice.create!(name: "Synthetic Assistant Gateway Quota Practice", organization:)
    user = User.create!(email_address: "assistant-gateway-quota@example.invalid", password: SecureRandom.hex(20))
    provider = Object.new
    provider.define_singleton_method(:call) do |_input|
      calls += 1
      raise Clinic::Assistant::Providers::OpenRouter::QuotaError
    end

    with_stubbed_method(Clinic::Assistant::Providers::OpenRouter, :new, ->(model:) { provider }) do
      error = assert_raises(Clinic::Assistant::ModelGateway::ProviderQuotaExceeded) do
        gateway.call(request_text: "find openings", current_date: "2026-10-04", timezone: "UTC",
          user_id: user.id, practice_id: practice.id)
      end
      assert_includes error.message, "request quota is exhausted"
      assert_equal 2, calls
      rows = Clinic::AssistantRequestBudget.where(period_on: Time.current.utc.to_date).to_a
      assert_equal %w[practice provider_account user], rows.map(&:scope_type).sort
      assert_equal [ 2, 2, 2 ], rows.map(&:reserved_count).sort

      with_stubbed_method(Clinic::AssistantRequestBudget, :reserve!, ->(**) {
        raise Clinic::AssistantRequestBudget::Exhausted
      }) do
        error = assert_raises(Clinic::Assistant::ModelGateway::BudgetExceeded) do
          gateway.call(request_text: "find openings", current_date: "2026-10-04", timezone: "UTC",
            user_id: 72, practice_id: 19)
        end
        assert_includes error.message, "today's request limit"
      end
      assert_equal 2, calls
    end
  end

  private

  def gateway
    Clinic::Assistant::ModelGateway.new
  end

  def with_stubbed_method(receiver, name, implementation)
    original = receiver.method(name)
    receiver.define_singleton_method(name) do |*args, **kwargs, &block|
      implementation.call(*args, **kwargs, &block)
    end
    yield
  ensure
    receiver.define_singleton_method(name, original) if original
  end
end
