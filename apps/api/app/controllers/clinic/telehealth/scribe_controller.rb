module Clinic
  module Telehealth
    class ScribeController < BaseController
      def context
        render_scribe(telehealth_visit)
      end

      def request_scribe
        input = telehealth_input(:scribe, %i[request_key expected_version])
        visit = Clinic::Telehealth::Scribe::RequestScribe.call(visit: telehealth_visit, actor: current_user,
          request_key: input.fetch(:request_key), expected_version: input.fetch(:expected_version))
        render_scribe(visit, status: :created)
      end

      def consent
        input = telehealth_input(:consent, %i[decision request_key expected_version])
        Clinic::Telehealth::Scribe::RecordScribeConsent.call(visit: telehealth_visit, actor: current_user,
          decision: input.fetch(:decision), request_key: input.fetch(:request_key),
          expected_version: input.fetch(:expected_version))
        render_scribe(telehealth_visit.reload, status: :created)
      end

      def start_capture
        input = telehealth_input(:capture, %i[request_key expected_version expected_capture_epoch])
        result = Clinic::Telehealth::Scribe::ClaimScribeCapture.call(visit: telehealth_visit, actor: current_user,
          request_key: input.fetch(:request_key), expected_version: input.fetch(:expected_version),
          expected_capture_epoch: input.fetch(:expected_capture_epoch))
        render_scribe(result.visit, status: :created, owner_token: result.owner_token)
      end

      def renew_capture
        input = telehealth_input(:capture, %i[request_key expected_version capture_epoch owner_token])
        visit = Clinic::Telehealth::Scribe::RenewScribeCapture.call(visit: telehealth_visit, actor: current_user,
          request_key: input.fetch(:request_key), expected_version: input.fetch(:expected_version),
          capture_epoch: input.fetch(:capture_epoch), owner_token: input.fetch(:owner_token))
        render_scribe(visit)
      end

      def release_capture
        input = telehealth_input(:capture, %i[request_key expected_version capture_epoch owner_token])
        visit = Clinic::Telehealth::Scribe::ReleaseScribeCapture.call(visit: telehealth_visit, actor: current_user,
          request_key: input.fetch(:request_key), expected_version: input.fetch(:expected_version),
          capture_epoch: input.fetch(:capture_epoch), owner_token: input.fetch(:owner_token))
        render_scribe(visit)
      end

      def take_over_capture
        input = telehealth_input(:capture, %i[request_key expected_version expected_capture_epoch])
        result = Clinic::Telehealth::Scribe::TakeOverScribeCapture.call(visit: telehealth_visit, actor: current_user,
          request_key: input.fetch(:request_key), expected_version: input.fetch(:expected_version),
          expected_capture_epoch: input.fetch(:expected_capture_epoch))
        render_scribe(result.visit, status: :created, owner_token: result.owner_token)
      end

      private

      def render_scribe(visit, status: :ok, owner_token: nil)
        projection = Clinic::Telehealth::Scribe::ScribeContext.call(visit: visit.reload, actor: current_user)
        projection[:capture][:owner_token] = owner_token if owner_token
        render_telehealth(data: { scribe: projection }, visit:, status:,
          allowed_actions: projection[:allowed_actions])
      end

      def sensitive_read_action
        action_name == "context" ? "telehealth.scribe.read" : super
      end
    end
  end
end
