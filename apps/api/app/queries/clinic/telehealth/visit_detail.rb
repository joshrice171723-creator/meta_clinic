module Clinic
  module Telehealth
    module VisitDetail
      module_function

      def call(practice:, actor:, public_id:)
        visit = Visit.where(practice_id: practice.id).includes(:practice, :patient, :encounter, :policy_version,
          current_room_attempt: :provider_events, appointment: [ :practice, :patient, { booked_clinician: :membership } ],
          participants: [ :membership, :portal_identity ], checkins: [], consents: [],
          wrap_up: [ :encounter, :follow_up_appointment ]).find_by!(public_id: public_id)
        AccessPolicy.authorize!(actor_context: { actor: actor, practice: practice }, visit: visit, action: :read)
        visit
      end
    end
  end
end
