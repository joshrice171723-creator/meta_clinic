module Clinic
  module Care
    class RecordObservation
      def self.call(practice:, actor:, patient:, attributes:)
        Authorization.authorize!(actor: actor, practice: practice, action: "observations.write")
        author_membership = practice.memberships.find_by!(user: actor)
        patient = practice.patients.find(patient.id)

        patient.observations.create!(attributes.to_h.symbolize_keys.merge(
          practice: practice,
          author_membership: author_membership
        ))
      end
    end
  end
end
