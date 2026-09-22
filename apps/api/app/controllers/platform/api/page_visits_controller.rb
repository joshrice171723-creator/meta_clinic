module Platform
  module Api
    class PageVisitsController < ApplicationController
      rate_limit to: 60, within: 1.minute, only: :create

      def create
        return head :no_content if request.headers["DNT"] == "1" || request.headers["Sec-GPC"] == "1"

        path = params[:path]
        event_id = params[:event_id]
        unless PageVisit::PATHS.include?(path) && event_id.is_a?(String) &&
            event_id.match?(/\A[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/i)
          return render json: { error: "Invalid page visit." }, status: :unprocessable_entity
        end

        visitor_id = cookies.signed[:public_site_visitor] || SecureRandom.uuid
        cookies.signed[:public_site_visitor] = {
          value: visitor_id, expires: 30.days.from_now, httponly: true,
          secure: request.ssl?, same_site: :lax, path: "/"
        }
        PageVisit.create!(event_id:, visitor_id:, path:, referrer_host: referrer_host)
        head :no_content
      rescue ActiveRecord::RecordNotUnique
        head :no_content
      end

      private

      def referrer_host
        value = params[:referrer_host]
        return "" unless value.is_a?(String) && value.length <= 253
        return "" unless value.match?(/\A[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\z/i)

        value.downcase
      end
    end
  end
end
