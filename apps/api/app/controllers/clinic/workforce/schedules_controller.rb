module Clinic
  module Workforce
    class SchedulesController < Clinic::Workforce::BaseController
      rescue_from PublishSchedule::InvalidSchedule do |error|
        render json: { error: error.message, code: "schedule_invalid", details: error.details }, status: :unprocessable_entity
      end

      def index
        site = site!
        workforce_access.authorize!("workforce.schedule.read", site: site)
        ensure_schedule_enabled!(site)
        permissions = {
          manage: workforce_access.allow?("workforce.schedule.manage", site: site),
          publish: workforce_access.allow?("workforce.schedule.publish", site: site)
        }
        templates = ScheduleTemplate.where(practice_id: current_practice.id, site_id: site.id, active: true).order(:name)
        drafts = if permissions.values.any?
          ScheduleDraft.where(practice_id: current_practice.id, site_id: site.id).where(status: "draft").order(week_start_on: :desc)
        else
          []
        end
        publications = latest_publications.where(site_id: site.id).includes(:site).order(week_start_on: :desc).limit(12)
        render json: ScheduleSerializer.response(
          site: site_payload(site), templates: templates.map { |item| ScheduleSerializer.template(item) },
          drafts: drafts.map { |item| ScheduleSerializer.draft(item, include_shifts: false) },
          publications: publications.map { |item| ScheduleSerializer.publication(item) },
          employments: eligible_employments(site), settings: effective_settings(site).fetch(:values), permissions: permissions
        )
      end

      def employee
        employment = workforce_access.own_employment
        raise Clinic::Authorization::Denied unless employment
        employment.employment_sites.load

        from = params[:from].present? ? date_param!(params[:from], field: :from) : Current.business_date.beginning_of_week
        to = params[:to].present? ? date_param!(params[:to], field: :to) : from + 42.days
        visibility_by_site = {}
        publications = latest_publications.where(week_start_on: (from.beginning_of_week)..to).includes(:site)
          .select do |item|
            employment.eligible_site?(item.site, at: Current.business_time) &&
              visibility_by_site.fetch(item.site_id) { visibility_by_site[item.site_id] = schedule_visible?(item.site) }
          end
        conflicts = employee_time_off_conflicts(publications, employment)
        render json: ScheduleSerializer.response(publications: publications.map { |item| ScheduleSerializer.publication(item,
          employee_id: employment.id, time_off_conflict_shift_ids: conflicts) })
      end

      def show_draft
        draft = draft!
        if workforce_access.allow?("workforce.schedule.manage", site: draft.site)
          workforce_access.authorize!("workforce.schedule.manage", site: draft.site)
        else
          workforce_access.authorize!("workforce.schedule.publish", site: draft.site)
        end
        render json: ScheduleSerializer.response(draft: ScheduleSerializer.draft(draft))
      end

      def create_template
        input = parameter_hash!(:template, %i[site_id name timezone revision], nested_arrays: { shift_definitions: %i[employment_id day_of_week start_time end_time start_occurrence end_occurrence role_name break_minutes] })
        site = site!(input[:site_id])
        workforce_access.authorize!("workforce.schedule.manage", site: site)
        ensure_schedule_enabled!(site)
        record = ScheduleTemplate.create!(practice: current_practice, site: site, created_by_id: current_user.id,
          name: required_string!(input[:name], field: :name, maximum: 120),
          timezone: required_string!(input[:timezone], field: :timezone, maximum: 80),
          shift_definitions: input[:shift_definitions]&.map(&:to_h) || [], revision: 1)
        render json: ScheduleSerializer.response(template: ScheduleSerializer.template(record)), status: :created
      end

      def update_template
        record = ScheduleTemplate.find_by!(practice_id: current_practice.id, id: requested_id!(params[:id], :id))
        workforce_access.authorize!("workforce.schedule.manage", site: record.site)
        input = parameter_hash!(:template, %i[name timezone expected_revision active], nested_arrays: { shift_definitions: %i[employment_id day_of_week start_time end_time start_occurrence end_occurrence role_name break_minutes] })
        record.with_lock do
          raise ActiveRecord::StaleObjectError.new(record, "update") unless record.revision == bounded_integer!(input[:expected_revision], field: :expected_revision, min: 1)
          record.update!(name: input[:name].present? ? required_string!(input[:name], field: :name, maximum: 120) : record.name,
            timezone: input[:timezone].present? ? required_string!(input[:timezone], field: :timezone, maximum: 80) : record.timezone,
            shift_definitions: input.key?(:shift_definitions) ? input[:shift_definitions].map(&:to_h) : record.shift_definitions,
            active: input.key?(:active) ? boolean_param(input[:active], field: :active) : record.active,
            revision: record.revision + 1)
        end
        render json: ScheduleSerializer.response(template: ScheduleSerializer.template(record))
      end

      def create_draft
        input = parameter_hash!(:draft, %i[site_id week_start_on timezone schedule_template_id])
        site = site!(input[:site_id])
        workforce_access.authorize!("workforce.schedule.manage", site: site)
        ensure_schedule_enabled!(site)
        template = input[:schedule_template_id].present? ? ScheduleTemplate.find_by!(practice_id: current_practice.id, site_id: site.id, id: requested_id!(input[:schedule_template_id], :schedule_template_id)) : nil
        draft = CreateScheduleDraft.call(practice: current_practice, actor: current_user, site: site, template: template,
          week_start_on: date_param!(input[:week_start_on], field: :week_start_on),
          timezone: required_string!(input[:timezone].presence || template&.timezone, field: :timezone, maximum: 80))
        render json: ScheduleSerializer.response(draft: ScheduleSerializer.draft(draft.reload)), status: :created
      end

      def upsert_shift
        draft = draft!
        workforce_access.authorize!("workforce.schedule.manage", site: draft.site)
        input = parameter_hash!(:shift, %i[id employment_id local_start local_end start_occurrence end_occurrence role_name break_minutes expected_revision])
        input[:employment_id] = requested_id!(input[:employment_id], :employment_id)
        input[:expected_revision] = bounded_integer!(input[:expected_revision], field: :expected_revision, min: 1)
        input[:break_minutes] = bounded_integer!(input[:break_minutes].presence || "0", field: :break_minutes, max: 1_440)
        input[:role_name] = optional_string(input[:role_name], field: :role_name, maximum: 120)
        draft, shift = UpsertScheduleShift.call(draft: draft, actor: current_user, attributes: input.to_h)
        render json: ScheduleSerializer.response(draft: ScheduleSerializer.draft(draft.reload), shift: ScheduleSerializer.shift(shift))
      end

      def destroy_shift
        draft = draft!
        workforce_access.authorize!("workforce.schedule.manage", site: draft.site)
        draft.with_lock do
          ensure_editable_revision!(draft, params[:expected_revision])
          draft.shifts.find_by!(public_id: params[:shift_id]).destroy!
          draft.update!(revision: draft.revision + 1)
        end
        render json: ScheduleSerializer.response(draft: ScheduleSerializer.draft(draft.reload))
      end

      def validate_draft
        draft = draft!
        if workforce_access.allow?("workforce.schedule.manage", site: draft.site)
          workforce_access.authorize!("workforce.schedule.manage", site: draft.site)
        else
          workforce_access.authorize!("workforce.schedule.publish", site: draft.site)
        end
        result = ValidateSchedule.call(draft: draft)
        render json: ScheduleSerializer.response(valid: result.valid?, errors: result.errors, warnings: result.warnings,
          draft: ScheduleSerializer.draft(draft, include_shifts: false))
      end

      def publish
        draft = draft!
        workforce_access.authorize!("workforce.schedule.publish", site: draft.site)
        input = parameter_hash!(:publication, %i[expected_revision idempotency_key])
        publication = PublishSchedule.call(draft: draft, actor: current_user,
          expected_revision: input[:expected_revision], idempotency_key: required_string!(input[:idempotency_key], field: :idempotency_key, maximum: 120))
        render json: ScheduleSerializer.response(publication: ScheduleSerializer.publication(publication))
      end

      private

      def site!(value = params[:site_id])
        current_practice.sites.find(requested_id!(value, :site_id))
      end

      def draft!
        ScheduleDraft.includes(:site).find_by!(practice_id: current_practice.id, id: requested_id!(params[:id], :id))
      end

      def effective_settings(site)
        EffectiveSettings.call(practice: current_practice, site: site, at: Current.business_time)
      end

      def ensure_schedule_enabled!(site)
        raise ArgumentError, "Scheduling is not enabled for this site." unless effective_settings(site).fetch(:values).fetch("schedule_enabled") == true
      end

      def schedule_visible?(site)
        values = effective_settings(site).fetch(:values)
        values.fetch("schedule_enabled") == true && values.fetch("employee_self_service_enabled") == true
      rescue EffectiveSettings::Unconfigured
        false
      end

      def latest_publications
        scope = SchedulePublication.where(practice_id: current_practice.id)
        scope.where(id: scope.group(:site_id, :week_start_on).maximum(:id).values)
      end

      def employee_time_off_conflicts(publications, employment)
        shifts = publications.flat_map(&:shift_snapshot).filter_map do |shift|
          next unless shift["employment_id"].to_i == employment.id

          [ shift, Time.iso8601(shift.fetch("starts_at")), Time.iso8601(shift.fetch("ends_at")) ]
        end
        return [] if shifts.empty?

        earliest_start = shifts.map { |shift| shift[1] }.min
        latest_end = shifts.map { |shift| shift[2] }.max
        time_off = TimeOffRequest.where(practice_id: current_practice.id, employment_id: employment.id, status: "approved")
          .overlapping(earliest_start, latest_end).to_a
        shifts.filter_map do |shift, starts_at, ends_at|
          shift["id"] if time_off.any? { |request| request.starts_at < ends_at && request.ends_at > starts_at }
        end
      end

      def eligible_employments(site)
        Employment.where(practice_id: current_practice.id).includes(:staff_member, :employment_sites, membership: :user).select do |item|
          item.active_for_work?(at: Current.business_time) && item.eligible_site?(site, at: Current.business_time)
        end.map do |item|
          { id: item.id.to_s, name: item.staff_member.display_name, job_title: item.staff_member.job_title }
        end
      end

      def site_payload(site)
        { id: site.id.to_s, name: site.name, timezone: site.timezone_override || current_practice.timezone,
          operating_hours: site.operating_hours.order(:day_of_week).map { |item| { day_of_week: item.day_of_week, closed: item.closed, open_time: item.open_time&.strftime("%H:%M"), close_time: item.close_time&.strftime("%H:%M") } } }
      end

      def ensure_editable_revision!(draft, value)
        raise ArgumentError, "Published schedules cannot be edited." unless draft.editable?
        expected = bounded_integer!(value, field: :expected_revision, min: 1)
        raise ActiveRecord::StaleObjectError.new(draft, "update") unless draft.revision == expected
      end
    end
  end
end
