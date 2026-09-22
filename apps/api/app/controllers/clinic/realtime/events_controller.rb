module Clinic
  module Realtime
    class EventsController < Clinic::ApiController
      include ActionController::Live
      skip_around_action :attribute_clinic_mutations

      HEARTBEAT_SECONDS = 20

      def show
        return head :not_found if request.head?

        acquired = Clinic::Realtime::ConnectionLimiter.acquire
        return head :service_unavailable unless acquired

        response.headers["Content-Type"] = "text/event-stream; charset=utf-8"
        response.headers["Cache-Control"] = "no-cache, no-store, no-transform"
        response.headers["X-Accel-Buffering"] = "no"

        listener = Clinic::Realtime::Listener.new(practice_id: current_practice.id)
        response.stream.write("event: ready\ndata: {}\n\n")
        response.stream.write("event: resync\ndata: {}\n\n")

        loop do
          event = listener.wait_for_event(HEARTBEAT_SECONDS)
          unless listener.authorization_current?(
            membership_id: clinic_membership.id,
            user_id: current_user.id,
            practice_id: current_practice.id,
            generation: @authorization_generation
          )
            response.stream.write("event: session-expired\ndata: {}\n\n")
            break
          end

          if event && event["practice_id"].to_i == current_practice.id
            topics = Array(event["topics"]).intersection(Clinic::Realtime::Publisher::TOPICS_BY_CONTROLLER.values.flatten.uniq)
            unless topics.empty?
              response.stream.write("event: invalidate\ndata: #{JSON.generate(topics: topics)}\n\n")
            end
          else
            response.stream.write(": keep-alive\n\n") unless event
          end
        end
      rescue PG::Error => error
        Rails.logger.warn("clinic_realtime_stream_failed error=#{error.class.name}")
      rescue IOError, ActionController::Live::ClientDisconnected
        # The browser closed or changed the stream.
      ensure
        listener&.close
        Clinic::Realtime::ConnectionLimiter.release if acquired
        begin
          response.stream.close
        rescue IOError, ActionController::Live::ClientDisconnected
          nil
        end
      end
    end
  end
end
