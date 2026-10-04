require "test_helper"

class Clinic::AssistantRequestBudgetTest < ActiveSupport::TestCase
  setup do
    @env_names = %w[
      CLINIC_ASSISTANT_ACCOUNT_DAILY_CAP CLINIC_ASSISTANT_PRACTICE_DAILY_CAP
      CLINIC_ASSISTANT_USER_DAILY_CAP
    ]
    @prior_env = @env_names.to_h { |name| [ name, ENV[name] ] }
    @organization = Organization.create!(name: "Synthetic Assistant Budget Organization")
    @practice = Clinic::Practice.create!(name: "Synthetic Assistant Budget Practice", organization: @organization)
    @user = User.create!(email_address: "assistant-budget@example.invalid", password: SecureRandom.hex(20))
  end

  teardown do
    @prior_env.each { |name, value| value ? ENV[name] = value : ENV.delete(name) }
  end

  test "account cap defaults to 50 and cannot be configured above 50" do
    assert_equal 50, Clinic::AssistantRequestBudget.daily_caps.fetch(:account)
    ENV["CLINIC_ASSISTANT_ACCOUNT_DAILY_CAP"] = "51"
    assert_raises(Clinic::AssistantRequestBudget::InvalidConfiguration) do
      Clinic::AssistantRequestBudget.daily_caps
    end
  end

  test "account, practice and user caps independently stop new reservations" do
    set_caps(account: 50, practice: 1, user: 50)
    first_date = Time.utc(2040, 1, 1)
    Clinic::AssistantRequestBudget.reserve!(user_id: @user.id, practice_id: @practice.id, now: first_date)
    second_user = User.create!(email_address: "assistant-budget-two@example.invalid", password: SecureRandom.hex(20))

    assert_raises(Clinic::AssistantRequestBudget::Exhausted) do
      Clinic::AssistantRequestBudget.reserve!(user_id: second_user.id, practice_id: @practice.id, now: first_date)
    end
    assert_equal 1, budget_count(first_date, "provider_account")
    assert_equal 1, budget_count(first_date, "practice")

    set_caps(account: 50, practice: 50, user: 1)
    second_practice = Clinic::Practice.create!(name: "Synthetic Assistant Budget Practice Two", organization: @organization)
    user_date = Time.utc(2040, 1, 2)
    Clinic::AssistantRequestBudget.reserve!(user_id: @user.id, practice_id: @practice.id, now: user_date)

    assert_raises(Clinic::AssistantRequestBudget::Exhausted) do
      Clinic::AssistantRequestBudget.reserve!(user_id: @user.id, practice_id: second_practice.id, now: user_date)
    end
    assert_equal 1, budget_count(user_date, "provider_account")
    assert_equal 1, budget_count(user_date, "user")

    set_caps(account: 1, practice: 50, user: 50)
    account_date = Time.utc(2040, 1, 3)
    Clinic::AssistantRequestBudget.reserve!(user_id: @user.id, practice_id: @practice.id, now: account_date)
    assert_raises(Clinic::AssistantRequestBudget::Exhausted) do
      Clinic::AssistantRequestBudget.reserve!(user_id: second_user.id, practice_id: second_practice.id, now: account_date)
    end
    assert_equal 1, budget_count(account_date, "provider_account")
  end

  test "concurrent reservations cannot exceed the shared account cap" do
    set_caps(account: 1, practice: 50, user: 50)
    now = Time.utc(2040, 2, 1)
    ready = Queue.new
    start = Queue.new
    outcomes = Queue.new

    threads = 2.times.map do
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          ready << true
          start.pop
          outcome = begin
            Clinic::AssistantRequestBudget.reserve!(user_id: @user.id, practice_id: @practice.id, now:)
            :reserved
          rescue Clinic::AssistantRequestBudget::Exhausted
            :exhausted
          end
          outcomes << outcome
        end
      end
    end
    2.times { ready.pop }
    2.times { start << true }
    threads.each(&:value)

    assert_equal [ :exhausted, :reserved ], 2.times.map { outcomes.pop }.sort_by(&:to_s)
    assert_equal 1, budget_count(now, "provider_account")
  ensure
    threads&.each { |thread| thread.kill if thread.alive? }
  end

  private

  def set_caps(account:, practice:, user:)
    ENV["CLINIC_ASSISTANT_ACCOUNT_DAILY_CAP"] = account.to_s
    ENV["CLINIC_ASSISTANT_PRACTICE_DAILY_CAP"] = practice.to_s
    ENV["CLINIC_ASSISTANT_USER_DAILY_CAP"] = user.to_s
  end

  def budget_count(now, scope_type)
    Clinic::AssistantRequestBudget.find_by!(period_on: now.utc.to_date, scope_type:).reserved_count
  end
end
