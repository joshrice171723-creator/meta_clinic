module Clinic
  module Telehealth
    class ParticipantsController < BaseController
      def create
        input = command_input
        AddParticipant.call(visit: telehealth_visit, actor: current_user, membership_id: input.fetch(:membership_id),
          request_key: input.fetch(:request_key), expected_version: input.fetch(:expected_version))
        render_visit(status: :created)
      end

      def admit
        input = command_input
        participant = telehealth_visit.participants.find(params[:id])
        AdmitParticipant.call(visit: telehealth_visit, participant: participant, actor: current_user,
          request_key: input.fetch(:request_key), expected_version: input.fetch(:expected_version))
        render_visit
      end

      def remove
        input = command_input
        participant = telehealth_visit.participants.find(params[:id])
        command = RemoveParticipant.call(visit: telehealth_visit, participant: participant, actor: current_user,
          request_key: input.fetch(:request_key), expected_version: input.fetch(:expected_version))
        render_visit(status: :accepted, operation: command)
      end
    end
  end
end
