module Clinic
  module Workforce
    class ResolveLocalInterval
      class InvalidLocalTime < ArgumentError; end

      LOCAL_PATTERN = /\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}\z/

      def self.call(timezone:, local_start:, local_end:, start_occurrence: "only", end_occurrence: "only", infer_overnight: true)
        start_local = parse_local(local_start)
        end_local = parse_local(local_end)
        end_local += 1.day if infer_overnight && end_local <= start_local
        starts_at = resolve_instant(timezone: timezone, local_time: start_local.strftime("%Y-%m-%dT%H:%M"),
          occurrence: start_occurrence, label: "start")
        ends_at = resolve_instant(timezone: timezone, local_time: end_local.strftime("%Y-%m-%dT%H:%M"),
          occurrence: end_occurrence, label: "end")
        raise InvalidLocalTime, "Interval end must be after its start." unless ends_at > starts_at

        {
          starts_at: starts_at,
          ends_at: ends_at,
          local_start: start_local.strftime("%Y-%m-%dT%H:%M"),
          local_end: end_local.strftime("%Y-%m-%dT%H:%M")
        }
      end

      def self.resolve_instant(timezone:, local_time:, occurrence: "only", label: "time")
        resolve(timezone, parse_local(local_time), occurrence, label)
      rescue TZInfo::InvalidTimezoneIdentifier
        raise InvalidLocalTime, "Timezone must be a valid IANA name."
      end

      def self.parse_local(value)
        raise InvalidLocalTime, "Local time must use YYYY-MM-DDTHH:MM." unless LOCAL_PATTERN.match?(value.to_s)

        Time.iso8601("#{value}:00Z")
      rescue ArgumentError
        raise InvalidLocalTime, "Local time is not valid."
      end
      def self.resolve(timezone, local, occurrence, label)
        periods = TZInfo::Timezone.get(timezone).periods_for_local(local)
        raise InvalidLocalTime, "The #{label} falls in a daylight-saving time gap." if periods.empty?
        if periods.length > 1 && !%w[first second].include?(occurrence.to_s)
          raise InvalidLocalTime, "The #{label} is ambiguous; choose the first or second occurrence."
        end
        if periods.length == 1 && occurrence.to_s != "only"
          raise InvalidLocalTime, "The #{label} is not ambiguous; occurrence must be only."
        end

        period = periods.fetch(occurrence.to_s == "second" ? 1 : 0)
        Time.at(local.to_i - period.utc_total_offset).utc
      end
      private_class_method :resolve
    end
  end
end
