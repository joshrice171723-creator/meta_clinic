module Clinic
  module Telehealth
    module VisitDetail
      module_function

      def call(practice:, actor:, public_id:)
        visit = Visit.where(practice_id: practice.id).includes(:practice, :patient, :encounter, :policy_version,
          current_room_attempt: [], appointment: [ :practice, :patient, :site, { booked_clinician: :membership } ],
          participants: { membership: :clinician_profile },
          wrap_up: [ :encounter, :follow_up_appointment ]).find_by!(public_id: public_id)
        AccessPolicy.authorize!(actor_context: { actor: actor, practice: practice }, visit: visit, action: :read)
        visit
      end
    end
  end
end
