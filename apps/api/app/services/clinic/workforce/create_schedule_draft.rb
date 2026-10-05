module Clinic
  module Workforce
    class CreateScheduleDraft
      def self.call(practice:, actor:, site:, week_start_on:, timezone:, template: nil)
        site = practice.sites.find(site.id)
        Access.new(actor:, practice:).authorize!("workforce.schedule.manage", site:)
        settings = EffectiveSettings.call(practice:, site:).fetch(:values)
        raise ArgumentError, "Scheduling is not enabled for this site." unless settings.fetch("schedule_enabled") == true
        template = ScheduleTemplate.find_by!(practice:, site:, id: template.id) if template

        ScheduleDraft.transaction do
          draft = ScheduleDraft.create!(practice:, site:, schedule_template: template, created_by_id: actor.id,
            week_start_on:, timezone:, status: "draft", revision: 1)
          if template
            zone = TZInfo::Timezone.get(draft.timezone)
            template.shift_definitions.each do |definition|
              day = Integer(definition.fetch("day_of_week"))
              date = draft.week_start_on + ((day - 1) % 7).days
              local_start = "#{date.iso8601}T#{definition.fetch('start_time')}"
              local_end = "#{date.iso8601}T#{definition.fetch('end_time')}"
              started = ResolveLocalInterval.parse_local(local_start)
              ended = ResolveLocalInterval.parse_local(local_end)
              ended += 1.day if ended <= started
              start_occurrence = template_occurrence(zone, started, definition["start_occurrence"])
              end_occurrence = template_occurrence(zone, ended, definition["end_occurrence"])
              interval = ResolveLocalInterval.call(timezone: draft.timezone,
                local_start: local_start, local_end: local_end,
                start_occurrence: start_occurrence, end_occurrence: end_occurrence)
              draft.shifts.create!(practice:, employment_id: definition.fetch("employment_id"), timezone: draft.timezone,
                **interval, start_occurrence: start_occurrence, end_occurrence: end_occurrence,
                role_name: definition["role_name"], break_minutes: definition["break_minutes"].to_i)
            end
          end
          draft.reload
        end
      end

      def self.template_occurrence(zone, local, saved)
        occurrence = saved || "only"
        return "only" if %w[first second].include?(occurrence.to_s) && zone.periods_for_local(local).one?

        occurrence
      end
      private_class_method :template_occurrence
    end
  end
end
