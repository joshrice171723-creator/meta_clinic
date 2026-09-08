module Clinic
  module Telehealth
    class VisitsController < BaseController
      def index
        result = Clinic::Telehealth::VisitQueue.call(practice: current_practice, actor: current_user, filters: params.permit(
          :date, :site_id, :clinician_membership_id, :status, :cursor, :limit, :encounter_id, :patient_id
        ))
        rows = result.visits.map { |visit| VisitSerializer.queue_row(visit, actor: current_user) }
        render json: envelope({ visits: rows, next_cursor: result.next_cursor }, version: rows.map { |row| row[:updated_at] }.hash,
          allowed_actions: [], as_of: result.as_of)
      end

      def show
        projection = VisitSerializer.call(telehealth_visit, actor: current_user, include_preparation: true)
        render json: envelope(projection, version: telehealth_visit.lock_version,
          allowed_actions: projection[:allowed_actions])
      end

      def start_encounter
        input = command_input
        StartEncounter.call(visit: telehealth_visit, actor: current_user, request_key: input.fetch(:request_key),
          expected_version: input.fetch(:expected_version))
        render_visit
      end

      def verify_preparation
        input = command_input
        VerifyPreparation.call(visit: telehealth_visit, actor: current_user, checkin_id: input.fetch(:checkin_id),
          request_key: input.fetch(:request_key), expected_version: input.fetch(:expected_version))
        render_visit
      end

      def prepare_room
        input = command_input
        command = PrepareRoom.call(visit: telehealth_visit, actor: current_user,
          request_key: input.fetch(:request_key), expected_version: input.fetch(:expected_version))
        render_visit(telehealth_visit, status: :accepted, operation: command)
      end

      def join_grant
        input = command_input
        participant = current_staff_participant!
        result = IssueJoinGrant.call(visit: telehealth_visit, participant: participant, actor: current_user,
          request_key: input.fetch(:request_key), expected_version: input.fetch(:expected_version))
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
        payload = { join_grant: { token: result.token, room_url: result.room_url,
          expires_at: result.grant.expires_at.iso8601(6), provider: "daily",
          participant: { id: participant.id.to_s, provider_subject_id: participant.provider_subject_id },
          room: { expires_at: result.grant.room_attempt.expires_at.iso8601(6) } } }
        render json: envelope(payload, version: telehealth_visit.lock_version, allowed_actions: [])
      end

      def leave
        input = command_input
        LeaveVisit.call(visit: telehealth_visit, participant: current_staff_participant!, actor: current_user,
          request_key: input.fetch(:request_key), expected_version: input.fetch(:expected_version))
        render_visit
      end

      def end_visit
        input = command_input
        command = EndVisit.call(visit: telehealth_visit, actor: current_user, request_key: input.fetch(:request_key),
          expected_version: input.fetch(:expected_version), reason_code: input[:reason_code].presence || "host_ended")
        render_visit(telehealth_visit, status: :accepted, operation: command)
      end

      def extend_visit
        input = command_input
        command = ExtendVisit.call(visit: telehealth_visit, actor: current_user, request_key: input.fetch(:request_key),
          expected_version: input.fetch(:expected_version),
          requested_expires_at: input[:requested_expires_at]&.then { |value| Time.iso8601(value) })
        render_visit(telehealth_visit, status: :accepted, operation: command)
      end

      def resume
        input = command_input
        ResumeVisit.call(visit: telehealth_visit, actor: current_user, request_key: input.fetch(:request_key),
          expected_version: input.fetch(:expected_version))
        render_visit
      end

      def reconcile
        input = command_input
        command = RequestReconciliation.call(visit: telehealth_visit, actor: current_user,
          request_key: input.fetch(:request_key), expected_version: input.fetch(:expected_version))
        render_visit(telehealth_visit, status: :accepted, operation: command)
      end

      private

      def current_staff_participant!
        membership = Clinic::Membership.active.find_by!(practice_id: current_practice.id, user_id: current_user.id)
        telehealth_visit.participants.find_by!(membership_id: membership.id)
      end
    end
  end
end
