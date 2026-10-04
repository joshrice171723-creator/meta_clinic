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
            template.shift_definitions.each do |definition|
              day = Integer(definition.fetch("day_of_week"))
              date = draft.week_start_on + ((day - 1) % 7).days
              interval = ResolveLocalInterval.call(timezone: draft.timezone,
                local_start: "#{date.iso8601}T#{definition.fetch('start_time')}",
                local_end: "#{date.iso8601}T#{definition.fetch('end_time')}",
                start_occurrence: definition["start_occurrence"] || "only", end_occurrence: definition["end_occurrence"] || "only")
              draft.shifts.create!(practice:, employment_id: definition.fetch("employment_id"), timezone: draft.timezone,
                **interval, start_occurrence: definition["start_occurrence"] || "only", end_occurrence: definition["end_occurrence"] || "only",
                role_name: definition["role_name"], break_minutes: definition["break_minutes"].to_i)
            end
          end
          draft.reload
        end
      end
    end
  end
end
