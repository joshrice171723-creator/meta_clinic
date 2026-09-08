module Clinic
  module Workforce
    module ClockSerializer
      module_function

      def badge(badge)
        {
          id: badge.id,
          employment_id: badge.employment_id,
          status: badge.status,
          format: badge.format,
          pin_required: badge.pin_digest.present?,
          issued_at: badge.issued_at&.utc&.iso8601(6),
          revoked_at: badge.revoked_at&.utc&.iso8601(6)
        }
      end

      def kiosk(enrollment)
        {
          id: enrollment.id,
          site_id: enrollment.site_id,
          site_name: enrollment.site.name,
          status: enrollment.status,
          expires_at: enrollment.expires_at.utc.iso8601(6),
          enrolled_at: enrollment.enrolled_at&.utc&.iso8601(6),
          revoked_at: enrollment.revoked_at&.utc&.iso8601(6)
        }
      end

      def punch(punch, replayed: false)
        punch.result_snapshot.merge(
          "id" => punch.id,
          "request_key" => punch.request_key,
          "saved" => true,
          "replayed" => replayed
        )
      end
    end
  end
end
