module Clinic
  module Scheduling
    class TrackingBoardController < Clinic::BaseController
      MAX_VISITS = 200

      before_action -> { require_capability("patients.read") }

      def show
        as_of = Current.business_time
        encounters = current_practice.encounters.open.where(status: "open")
          .where(patient: current_practice.patients.accessible_by(current_ability, :read))
          .includes(:patient, :site, :room, appointment: %i[visit_type site room])
          .order(started_at: :desc, id: :desc).limit(MAX_VISITS + 1).to_a
        appointments = current_practice.appointments
          .where(status: %w[scheduled confirmed])
          .where(starts_at: board_day(as_of))
          .where(patient: current_practice.patients.accessible_by(current_ability, :read))
          .left_outer_joins(:encounter).where(clinic_encounters: { id: nil })
          .includes(:patient, :encounter, :visit_type, :site, :room)
          .order(starts_at: :asc, id: :asc).limit(MAX_VISITS + 1).to_a
        visits = encounters + appointments
        truncated = visits.length > MAX_VISITS
        visits = visits.first(MAX_VISITS)
        encounter_visits = visits.select { |visit| visit.is_a?(Clinic::Encounter) }
        board_date = as_of.in_time_zone(current_practice.timezone).to_date
        demographics = board_demographics(visits)
        memberships = board_memberships(visits, as_of)
        care_summary_batch = TrackingBoardSerializer.build_care_summary_batch(
          encounter_visits,
          practice_id: current_practice.id,
          as_of: as_of,
          demographics: demographics
        )
        vitals_batch = TrackingBoardSerializer.build_vitals_batch(
          encounter_visits, practice_id: current_practice.id
        )
        chart_status_batch = TrackingBoardSerializer.build_chart_status_batch(
          encounter_visits,
          practice_id: current_practice.id,
          accessible_encounter_ids: encounter_visits.filter_map do |encounter|
            encounter.id if current_ability.allowed_permission?("notes.read", site: encounter.site)
          end
        )
        assignable_site_ids = encounter_visits.map(&:site_id).compact.uniq.select do |site_id|
          current_ability.allowed_permission?("encounters.assign_provider", site: site_id)
        end
        provider_batch = TrackingBoardSerializer.build_provider_batch(
          encounter_visits, practice: current_practice, as_of: as_of,
          eligible_site_ids: assignable_site_ids
        )

        render json: {
          schema_version: "tracking-board-v2",
          as_of: as_of.iso8601(6),
          truncated: truncated,
          eligible_providers: provider_batch.eligible,
          visits: visits.map do |visit|
            if visit.is_a?(Clinic::Encounter)
              synthetic_scenario = Development::BackendSamples.tracking_board_scenario_for(visit)
              TrackingBoardSerializer.call(
                visit,
                care_summary: care_summary_batch.call(visit),
                synthetic_scenario: synthetic_scenario,
                operational_state: synthetic_scenario&.fetch(:stage) == "waiting" ? "waiting_room" : "unrecorded",
                demographics: demographic_projection(demographics[visit.patient_id], board_date),
                vitals: vitals_batch.call(visit),
                chart_status: chart_status_batch.call(visit),
                membership: memberships.fetch(visit.patient_id, "not_verified"),
                provider: provider_batch.call(visit),
                provider_assignment_available: assignable_site_ids.include?(visit.site_id)
              )
            else
              TrackingBoardSerializer.call_scheduled(
                visit, operational_state: appointment_state(visit, as_of),
                demographics: demographic_projection(demographics[visit.patient_id], board_date),
                membership: memberships.fetch(visit.patient_id, "not_verified"),
                chart_status: "unopened"
              )
            end
          end
        }
      end

      private

      def board_day(as_of)
        as_of.in_time_zone(current_practice.timezone).all_day
      end

      def appointment_state(appointment, as_of)
        return "upcoming" if appointment.starts_at > as_of
        return "on_time" if appointment.ends_at >= as_of

        "late"
      end

      def board_demographics(visits)
        patient_ids = visits.map(&:patient_id).uniq
        Clinic::Care::PatientDemographics.where(
          practice_id: current_practice.id, patient_id: patient_ids
        ).index_by(&:patient_id)
      end

      def board_memberships(visits, as_of)
        patient_ids = visits.map(&:patient_id).uniq
        Clinic::Care::PatientMembership.latest_as_of(as_of).where(
          practice_id: current_practice.id, patient_id: patient_ids
        ).each_with_object({}) do |membership, result|
            result[membership.patient_id] = membership.status if membership.effective_at?(as_of)
          end
      end

      def demographic_projection(demographics, board_date)
        return nil unless demographics

        date_of_birth = demographics.date_of_birth
        age = if date_of_birth && date_of_birth <= board_date
          birthday = Date.new(board_date.year, date_of_birth.month,
            [ date_of_birth.day, Time.days_in_month(date_of_birth.month, board_date.year) ].min)
          board_date < birthday ? board_date.year - date_of_birth.year - 1 : board_date.year - date_of_birth.year
        end
        { age: age, sex: demographics.sex }
      end
    end
  end
end
