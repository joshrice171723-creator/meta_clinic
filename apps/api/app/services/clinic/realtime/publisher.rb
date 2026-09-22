module Clinic
  module Realtime
    class Publisher
      CHANNEL_PREFIX = "apply_clinic_realtime_".freeze

      TOPICS_BY_CONTROLLER = {
        "clinic/scheduling/appointments" => %w[tracking_board work_inbox],
        "clinic/scheduling/encounters" => %w[tracking_board work_inbox],
        "clinic/scheduling/provider_assignments" => %w[tracking_board work_inbox],
        "clinic/telehealth/visits" => %w[telehealth_queue tracking_board work_inbox],
        "clinic/telehealth/participants" => %w[telehealth_queue],
        "clinic/messaging/staff" => %w[staff_messaging],
        "clinic/messaging/requests" => %w[staff_messaging work_inbox],
        "clinic/care/nurse_workflow" => %w[work_inbox tracking_board],
        "clinic/care/encounter_notes" => %w[work_inbox tracking_board],
        "clinic/operations/follow_ups" => %w[work_inbox],
        "clinic/operations/encounter_follow_ups" => %w[work_inbox],
        "clinic/operations/callback_requests" => %w[work_inbox],
        "clinic/operations/appointment_requests" => %w[work_inbox],
        "clinic/operations/recalls" => %w[work_inbox],
        "clinic/lab_reports" => %w[work_inbox],
        "clinic/care/refill_requests" => %w[work_inbox],
        "clinic/work_exceptions" => %w[work_inbox]
      }.freeze

      STAFF_MESSAGING_MUTATIONS = %w[
        acknowledge complete_attachment create_conversation create_message
        escalate manage_request recover transition
      ].freeze

      def self.topics_for(controller_path, action_name)
        return [] if controller_path == "clinic/messaging/staff" && !STAFF_MESSAGING_MUTATIONS.include?(action_name)

        TOPICS_BY_CONTROLLER.fetch(controller_path, [])
      end

      def self.publish(practice:, topics:)
        safe_topics = Array(topics).intersection(TOPICS_BY_CONTROLLER.values.flatten.uniq)
        return if practice.nil? || safe_topics.empty?

        payload = JSON.generate({ practice_id: practice.id, topics: safe_topics })
        connection = ApplicationRecord.connection.raw_connection
        connection.exec_params("SELECT pg_notify($1, $2)", [channel_for(practice.id), payload])
      rescue PG::Error => error
        # Mutation success must not depend on a best-effort invalidation signal.
        Rails.logger.warn("clinic_realtime_publish_failed error=#{error.class.name}")
      end

      def self.channel_for(practice_id)
        "#{CHANNEL_PREFIX}#{Integer(practice_id)}"
      end
    end
  end
end
