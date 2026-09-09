module Clinic
  module Telehealth
    module MediaPresence
      module_function

      def call(visit)
        return [] unless visit.current_room_attempt_id
        return [] if visit.status.in?(%w[ended cancelled no_show])

        joins = ProviderEvent.where(practice_id: visit.practice_id, room_attempt_id: visit.current_room_attempt_id,
          event_type: "participant.joined").where.not(participant_id: nil)
          .select("DISTINCT ON (participant_id) clinic_telehealth_provider_events.*")
          .order(:participant_id, occurred_at: :desc, id: :desc)

        ProviderEvent.from("(#{joins.to_sql}) latest_join").where(<<~SQL.squish).pluck(Arel.sql("latest_join.participant_id"))
          NOT EXISTS (
            SELECT 1 FROM clinic_telehealth_provider_events departure
            WHERE departure.practice_id = latest_join.practice_id
              AND departure.room_attempt_id = latest_join.room_attempt_id
              AND departure.participant_id = latest_join.participant_id
              AND departure.event_type = 'participant.left'
              AND (departure.occurred_at, departure.id) > (latest_join.occurred_at, latest_join.id)
              AND (departure.provider_session_ref IS NULL OR latest_join.provider_session_ref IS NULL
                OR departure.provider_session_ref = latest_join.provider_session_ref)
          )
        SQL
      end
    end
  end
end
