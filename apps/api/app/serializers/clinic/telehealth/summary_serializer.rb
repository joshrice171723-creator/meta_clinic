module Clinic
  module Telehealth
    module SummarySerializer
      module_function

      def call(visit, actor: nil, identity: nil)
        return nil unless visit
        participant = if identity
          visit.participants.find { |value| value.portal_identity_id == identity.id }
        elsif actor
          membership = Clinic::Membership.active.find_by(practice_id: visit.practice_id, user_id: actor.id)
          visit.participants.find { |value| value.membership_id == membership&.id }
        end
        {
          public_id: visit.public_id,
          status: visit.status,
          access_state: VisitSerializer.access_state(visit, participant: participant),
          prepare_href: "/patient-portal/telehealth/#{visit.public_id}",
          clinic_href: clinic_href(visit),
          allowed_actions: actor ? AccessPolicy.allowed_actions(actor_context: { actor: actor, practice: visit.practice },
            visit: visit, participant: participant) : PatientVisitSerializer.allowed_actions(visit, participant)
        }
      end

      def clinic_href(visit)
        if visit.encounter_id
          "/clinic/patients/#{visit.patient_id}/encounters/#{visit.encounter_id}/telehealth"
        else
          "/clinic/telehealth/#{visit.public_id}"
        end
      end
    end
  end
end
