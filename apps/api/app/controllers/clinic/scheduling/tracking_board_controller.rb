module Clinic
  module Scheduling
    class TrackingBoardController < Clinic::BaseController
      MAX_VISITS = 200

      before_action -> { require_capability("patients.read") }

      def show
        visits = current_practice.encounters.open.where(status: "open")
          .where(patient: current_practice.patients.accessible_by(current_ability, :read))
          .includes(:patient, :appointment, :site, :room, appointment: :visit_type)
          .order(started_at: :desc, id: :desc).limit(MAX_VISITS + 1).to_a
        truncated = visits.length > MAX_VISITS
        visits = visits.first(MAX_VISITS)
        as_of = Time.current
        care_summary_batch = TrackingBoardSerializer.build_care_summary_batch(
          visits,
          practice_id: current_practice.id,
          as_of: as_of
        )

        render json: {
          schema_version: "tracking-board-v1",
          as_of: as_of.iso8601(6),
          truncated: truncated,
          visits: visits.map do |encounter|
            TrackingBoardSerializer.call(
              encounter,
              care_summary: care_summary_batch.call(encounter),
              synthetic_scenario: Development::BackendSamples.tracking_board_scenario_for(encounter)
            )
          end
        }
      end
    end
  end
end
