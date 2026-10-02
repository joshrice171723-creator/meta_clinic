module Clinic
  class AuditEventsController < ApiController
    before_action -> { require_capability("roles.manage") }

    def index
      scope = current_practice.audit_events
      snapshot_id = params[:snapshot_id].present? ? bounded_integer!(params[:snapshot_id], field: :snapshot_id, max: 9_223_372_036_854_775_807) : (scope.maximum(:id) || 0)
      scope = scope.where("id <= ?", snapshot_id)
      actions = scope.distinct.order(:action_code).limit(500).pluck(:action_code)
      scope = scope.where(action_code: enum_param!(params[:action_code], field: :action_code, allowed: actions)) if params[:action_code].present?
      scope = scope.where(outcome: enum_param!(params[:outcome], field: :outcome, allowed: AuditEvent.outcomes.keys)) if params[:outcome].present?
      scope = date_filtered(scope)
      records, pagination = paginated_records(scope.includes(:resource_manifests), order: { occurred_at: :desc, id: :desc })
      actor_names = authorized_actor_names(records)
      events = records.map do |event|
        { id: event.id, occurred_at: event.occurred_at.iso8601(6), actor_reference: event.actor_session_reference,
          actor_display_name: actor_names[event.actor_session_reference],
          action_code: event.action_code, outcome: event.outcome, policy_version: event.policy_version,
          resource_references: event.resource_manifests.map(&:protected_resource_version_ref) }
      end
      # A successful audit-view read is recorded once; this database operation
      # does not call the reader and cannot recursively request the view.
      AuditRecorder.record!(practice: current_practice, actor: current_user, action_code: "audit.events.read", outcome: :released)
      render json: { events: events, pagination: pagination, snapshot_id: snapshot_id, filters: { action_codes: actions, outcomes: AuditEvent.outcomes.keys } }
    end

    private

    def date_filtered(scope)
      return scope if [ params[:from], params[:to] ].all? { |value| value.nil? || value == "" }

      from = audit_date!(:from)
      to = audit_date!(:to)
      raise ArgumentError, "The end date must be on or after the start date." if to < from
      raise ArgumentError, "Choose an audit range of at most 366 days." if (to - from).to_i >= 366

      zone = ActiveSupport::TimeZone[current_practice.timezone]
      raise ArgumentError, "The clinic timezone is unavailable." unless zone

      # Inclusive clinic dates, with an exclusive next-local-midnight boundary.
      # Construct both midnights independently rather than adding 24-hour periods.
      following_day = to.next_day
      start_time = zone.local(from.year, from.month, from.day)
      end_time = zone.local(following_day.year, following_day.month, following_day.day)
      scope.where(occurred_at: start_time...end_time)
    end

    def audit_date!(field)
      value = params[field]
      unless value.is_a?(String) && value.match?(/\A\d{4}-\d{2}-\d{2}\z/) && !value.start_with?("0000")
        raise ArgumentError, "Choose both audit dates in YYYY-MM-DD format."
      end
      date_param!(value, field: field)
    end

    def authorized_actor_names(records)
      # Reuse only the same practice's existing clinician-name read authority.
      # Staff-directory names have no account link; never guess that association.
      return {} unless %w[appointments.book patients.read facilities.write].any? { |permission| current_ability.allowed_permission?(permission) }

      user_ids = records.filter_map do |event|
        match = /\Auser:([1-9]\d{0,18})\z/.match(event.actor_session_reference)
        id = match && match[1].to_i
        id if id && id <= 9_223_372_036_854_775_807
      end.uniq
      return {} if user_ids.empty?

      current_practice.clinician_profiles.joins(:membership).includes(:membership)
        .where(clinic_memberships: { practice_id: current_practice.id, user_id: user_ids })
        .each_with_object({}) do |profile, names|
          names["user:#{profile.membership.user_id}"] = profile.display_name.presence
        end
    end
  end
end
