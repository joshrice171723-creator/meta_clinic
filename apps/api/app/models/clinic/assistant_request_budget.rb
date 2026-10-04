module Clinic
  class AssistantRequestBudget < ApplicationRecord
    self.table_name = "clinic_assistant_request_budgets"

    class Exhausted < StandardError; end
    class InvalidConfiguration < StandardError; end

    MAX_DAILY_REQUESTS = 50
    ACCOUNT_SCOPE = "provider_account"

    class << self
      def reserve!(user_id:, practice_id:, now: Time.current)
        user_id = positive_id!(user_id)
        practice_id = positive_id!(practice_id)
        caps = daily_caps
        period_on = now.utc.to_date
        rows = [
          { scope_type: ACCOUNT_SCOPE, user_id: nil, practice_id: nil, daily_limit: caps.fetch(:account) },
          { scope_type: "practice", user_id: nil, practice_id:, daily_limit: caps.fetch(:practice) },
          { scope_type: "user", user_id:, practice_id: nil, daily_limit: caps.fetch(:user) }
        ]
        timestamp = now.utc

        transaction do
          insert_all(rows.map do |row|
            row.merge(period_on:, reserved_count: 0, created_at: timestamp, updated_at: timestamp)
          end)

          scopes = where(period_on:)
            .where(scope_type: ACCOUNT_SCOPE).or(where(period_on:, scope_type: "practice", practice_id:))
            .or(where(period_on:, scope_type: "user", user_id:))
            .order(:scope_type, :id).lock.to_a
          raise InvalidConfiguration, "Assistant budget reservation rows are incomplete." unless scopes.length == rows.length

          caps_by_scope = { ACCOUNT_SCOPE => caps.fetch(:account), "practice" => caps.fetch(:practice), "user" => caps.fetch(:user) }
          scopes.each do |budget|
            limit = [ budget.daily_limit, caps_by_scope.fetch(budget.scope_type) ].min
            raise Exhausted, "The assistant request budget for today is exhausted." if budget.reserved_count >= limit

            budget.update!(daily_limit: limit, reserved_count: budget.reserved_count + 1)
          end
        end
      end

      def daily_caps
        {
          account: configured_limit("CLINIC_ASSISTANT_ACCOUNT_DAILY_CAP", default: MAX_DAILY_REQUESTS),
          practice: configured_limit("CLINIC_ASSISTANT_PRACTICE_DAILY_CAP", default: 40),
          user: configured_limit("CLINIC_ASSISTANT_USER_DAILY_CAP", default: 15)
        }
      end

      private

      def configured_limit(name, default:)
        value = ENV[name].presence ? Integer(ENV.fetch(name), 10) : default
        return value if value.between?(1, MAX_DAILY_REQUESTS)

        raise InvalidConfiguration, "#{name} must be between 1 and #{MAX_DAILY_REQUESTS}."
      rescue ArgumentError
        raise InvalidConfiguration, "#{name} must be a whole number between 1 and #{MAX_DAILY_REQUESTS}."
      end

      def positive_id!(value)
        id = Integer(value)
        return id if id.positive?

        raise InvalidConfiguration, "Assistant budget identity is invalid."
      rescue ArgumentError, TypeError
        raise InvalidConfiguration, "Assistant budget identity is invalid."
      end
    end
  end
end
