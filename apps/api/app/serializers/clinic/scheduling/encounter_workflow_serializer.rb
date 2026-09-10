module Clinic
  module Scheduling
    module EncounterWorkflowSerializer
      def self.call(encounter)
        event = encounter.workflow_events.order(workflow_version: :desc, id: :desc).first
        {
          state: encounter.workflow_stage,
          version: encounter.workflow_version,
          updated_at: encounter.updated_at.iso8601(6),
          last_event: event && {
            id: event.id.to_s, event_code: event.event_code,
            from_state: event.from_stage, to_state: event.to_stage,
            version: event.workflow_version, occurred_at: event.occurred_at.iso8601(6)
          }
        }
      end
    end
  end
end
