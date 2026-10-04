module Clinic
  class PluginEventsController < Clinic::ApiController
    rescue_from Clinic::PluginEvents::Unavailable do |error|
      render json: { error: error.message, code: error.code }, status: :conflict
    end

    def catalog
      render json: { names: Clinic::PluginEvents.available_names(current_ability) }
    end

    def index
      name = required_string!(params[:name], field: :name, maximum: 80)
      feed = Clinic::PluginEvents.new(practice: current_practice, actor: current_user, name:,
        resource_id: requested_id!(params[:resource_id], :resource_id))
      pending_event_id = required_string!(params[:pending_event_id], field: :pending_event_id, maximum: 120) if params[:pending_event_id].present?
      result = feed.call(cursor: params[:cursor], pending_event_id:)
      Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
        action_code: "plugin_events.read", outcome: :released)
      render json: result
    end
  end
end
