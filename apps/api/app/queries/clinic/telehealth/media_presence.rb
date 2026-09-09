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

      def for_visits(visits)
        values = visits.to_a
        results = values.to_h { |visit| [ visit.id, [] ] }
        active = values.reject { |visit| visit.current_room_attempt_id.nil? || visit.status.in?(%w[ended cancelled no_show]) }
        return results if active.empty?

        room_ids = active.map(&:current_room_attempt_id).uniq
        joins = ProviderEvent.where(room_attempt_id: room_ids, event_type: "participant.joined").where.not(participant_id: nil)
          .select("DISTINCT ON (room_attempt_id, participant_id) clinic_telehealth_provider_events.*")
          .order(:room_attempt_id, :participant_id, occurred_at: :desc, id: :desc)
        present_by_room = ProviderEvent.from("(#{joins.to_sql}) latest_join").where(<<~SQL.squish)
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
          .pluck(Arel.sql("latest_join.room_attempt_id"), Arel.sql("latest_join.participant_id"))
          .group_by(&:first).transform_values { |rows| rows.map(&:last) }
        active.each { |visit| results[visit.id] = present_by_room.fetch(visit.current_room_attempt_id, []) }
        results
      end
    end
  end
end
