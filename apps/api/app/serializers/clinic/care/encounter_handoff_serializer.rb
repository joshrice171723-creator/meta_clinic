module Clinic
  module Care
    module EncounterHandoffSerializer
      def self.call(handoff)
        return unless handoff

        {
          id: handoff.id.to_s, state: handoff.state, version: handoff.lock_version,
          intake_revision_id: handoff.intake_revision_id.to_s,
          requested_by_membership_id: handoff.requested_by_membership_id.to_s,
          requested_to_membership_id: handoff.requested_to_membership_id.to_s,
          accepted_by_membership_id: handoff.accepted_by_membership_id&.to_s,
          resolved_at: handoff.resolved_at&.iso8601(6),
          updated_at: handoff.updated_at.iso8601(6),
          events: handoff.events.order(:handoff_version, :id).map do |event|
            {
              id: event.id.to_s, event_code: event.event_code,
              from_state: event.from_state, to_state: event.to_state,
              version: event.handoff_version,
              actor_membership_id: event.actor_membership_id.to_s,
              occurred_at: event.occurred_at.iso8601(6)
            }
          end
        }
      end
    end
  end
end
