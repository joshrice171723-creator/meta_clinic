module Clinic
  module Inventory
    module Access
      ACTIONS = %w[catalog receive adjust hold release count configure transfer].freeze

      def self.with(practice_id, actor, action)
        raise ArgumentError, "Unsupported inventory action." unless ACTIONS.include?(action)
        Clinic::Practice.transaction do
          # Configuration/revocation serialize against these shared locks. All
          # inventory writes acquire locks in this order before product/stock rows.
          practice = Clinic::Practice.lock("FOR SHARE").find(practice_id)
          user = User.lock("FOR SHARE").find(actor.id)
          Clinic::Authorization.authorize!(actor: user, practice: practice, action: "inventory.#{action}")
          ApplicationRecord.connection.execute("SELECT set_config('apply.inventory_action', #{ApplicationRecord.connection.quote("inventory.#{action}")}, true)")
          profile = practice.inventory_profiles.order(version: :desc).first
          unless action == "configure" || (profile&.status == "synthetic" && profile.capabilities.include?("inventory"))
            raise ArgumentError, "Inventory posting is suspended or not configured. History remains available."
          end
          yield profile
        end
      rescue Clinic::Authorization::Denied => error
        raise ArgumentError, error.message
      end

      def self.retry_lock(practice_id, key)
        raise ArgumentError, "Reload the form to obtain a valid retry key." unless key.to_s.match?(/\A[0-9a-f-]{36}\z/)
        connection = ApplicationRecord.connection
        connection.execute("SELECT pg_advisory_xact_lock(hashtextextended(#{connection.quote("inventory:#{practice_id}:#{key}")},0))")
      end
    end
  end
end
