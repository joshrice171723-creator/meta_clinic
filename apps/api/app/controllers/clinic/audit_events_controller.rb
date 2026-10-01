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
      records, pagination = paginated_records(scope.includes(:resource_manifests), order: { occurred_at: :desc, id: :desc })
      events = records.map do |event|
        { id: event.id, occurred_at: event.occurred_at.iso8601(6), actor_reference: event.actor_session_reference,
          action_code: event.action_code, outcome: event.outcome, policy_version: event.policy_version,
          resource_references: event.resource_manifests.map(&:protected_resource_version_ref) }
      end
      # A successful audit-view read is recorded once; this database operation
      # does not call the reader and cannot recursively request the view.
      AuditRecorder.record!(practice: current_practice, actor: current_user, action_code: "audit.events.read", outcome: :released)
      render json: { events: events, pagination: pagination, snapshot_id: snapshot_id, filters: { action_codes: actions, outcomes: AuditEvent.outcomes.keys } }
    end
  end
end
