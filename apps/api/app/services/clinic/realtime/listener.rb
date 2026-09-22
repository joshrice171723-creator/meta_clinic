module Clinic
  module Realtime
    class Listener
      def initialize(practice_id:)
        @connection = PG.connect(connection_options)
        @connection.exec("LISTEN #{Publisher.channel_for(practice_id)}")
      end

      def wait_for_event(timeout)
        notification = nil
        @connection.wait_for_notify(timeout) do |_channel, _pid, payload|
          notification = JSON.parse(payload)
        end
        notification
      rescue JSON::ParserError
        nil
      end

      def authorization_current?(membership_id:, user_id:, practice_id:, generation:)
        result = @connection.exec_params(
          <<~SQL,
            SELECT m.active AND m.authorization_generation = $4 AND u.active
            FROM clinic_memberships m
            JOIN users u ON u.id = m.user_id
            WHERE m.id = $1 AND m.user_id = $2 AND m.practice_id = $3
          SQL
          [membership_id, user_id, practice_id, generation]
        )
        result.ntuples == 1 && result.getvalue(0, 0) == "t"
      end

      def close
        @connection&.close unless @connection&.finished?
      rescue PG::Error
        nil
      end

      private

      def connection_options
        database = ActiveRecord::Base.connection_db_config.configuration_hash
        options = {
          dbname: database["database"],
          user: database["username"],
          password: database["password"],
          host: database["host"],
          port: database["port"],
          sslmode: database["sslmode"],
          sslrootcert: database["sslrootcert"],
          sslcert: database["sslcert"],
          sslkey: database["sslkey"],
          connect_timeout: 5
        }.compact
        options.delete(:host) if options[:host].blank?
        options.delete(:port) if options[:port].blank?
        options
      end
    end
  end
end
