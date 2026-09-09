require "base64"

module Clinic
  module Telehealth
    module VisitQueue
      Result = Data.define(:visits, :next_cursor, :as_of)
      STATUSES = %w[scheduled in_progress ending ended cancelled no_show].freeze
      module_function

      def call(practice:, actor:, filters: {})
        Clinic::Authorization.authorize!(actor: actor, practice: practice, action: "telehealth.read", any_site: true)
        values = filters.to_h.symbolize_keys
        if values[:encounter_id].present? ^ values[:patient_id].present?
          raise Error.new("Patient and encounter filters must be supplied together.", code: "invalid_filter",
            status: :bad_request)
        end
        ability = Ability.new(actor, practice: practice)
        scope = Visit.where(practice_id: practice.id).joins(:appointment)
        unless ability.allowed_permission?("telehealth.read")
          site_ids = ability.accessible_site_ids.select do |site_id|
            ability.allowed_permission?("telehealth.read", site: site_id)
          end
          scope = scope.where(clinic_appointments: { site_id: site_ids })
        end
        if values[:encounter_id].present?
          scope = scope.where(encounter_id: Integer(values[:encounter_id]), patient_id: Integer(values[:patient_id]))
        else
          zone = ActiveSupport::TimeZone[practice.timezone] || Time.zone
          date = values[:date].present? ? Date.iso8601(values[:date].to_s) : Time.current.in_time_zone(zone).to_date
          scope = scope.where(clinic_appointments: {
            starts_at: zone.local(date.year, date.month, date.day)...zone.local(date.next_day.year, date.next_day.month, date.next_day.day)
          })
          scope = scope.where(clinic_appointments: { site_id: Integer(values[:site_id]) }) if values[:site_id].present?
          if values[:clinician_membership_id].present?
            profile_ids = Clinic::ClinicianProfile.where(practice_id: practice.id,
              membership_id: Integer(values[:clinician_membership_id])).select(:id)
            scope = scope.where(clinic_appointments: { booked_clinician_id: profile_ids })
          end
          statuses = values[:status].to_s.split(",").reject(&:blank?)
          raise Error.new("The status filter is invalid.", code: "invalid_filter", status: :bad_request) unless
            (statuses - STATUSES).empty?
          scope = scope.where(status: statuses) if statuses.any?
        end
        limit = Integer(values[:limit].presence || 50)
        raise Error.new("Limit must be between 1 and 100.", code: "invalid_filter", status: :bad_request) unless limit.between?(1, 100)
        after_id = decode_cursor(values[:cursor]) if values[:cursor].present?
        scope = scope.where("clinic_telehealth_visits.id > ?", after_id) if after_id
        records = scope.includes(:practice, :patient, :encounter, :policy_version, :current_room_attempt,
          appointment: [ :practice, :patient, { booked_clinician: :membership } ],
          participants: [ :membership, :portal_identity ], checkins: [], consents: []).order("clinic_telehealth_visits.id ASC").limit(limit + 1).to_a
        more = records.length > limit
        records = records.first(limit)
        Result.new(visits: records, next_cursor: more ? encode_cursor(records.last.id) : nil, as_of: Time.current)
      rescue Date::Error, ArgumentError, TypeError
        raise Error.new("A queue filter is invalid.", code: "invalid_filter", status: :bad_request)
      end

      def encode_cursor(id)
        Base64.urlsafe_encode64(id.to_s, padding: false)
      end

      def decode_cursor(value)
        id = Integer(Base64.urlsafe_decode64(value.to_s))
        raise ArgumentError unless id.positive?
        id
      end
    end
  end
end
