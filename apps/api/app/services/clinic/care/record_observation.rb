module Clinic
  module Care
    class RecordObservation
      OPERATION_CODE = "observations.create"

      def self.call(practice:, actor:, patient:, attributes:, request_key:)
        patient = practice.patients.find(patient.id)
        attributes = attributes.to_h.symbolize_keys
        encounter_object = attributes.delete(:encounter)
        encounter_reference = attributes.delete(:encounter_id) || encounter_object&.id
        encounter = practice.encounters.where(patient_id: patient.id).find(encounter_reference) if encounter_reference.present?
        parent_object = attributes.delete(:parent_observation)
        parent_reference = attributes.delete(:parent_observation_id) || parent_object&.id
        parent_observation = practice.observations.where(patient_id: patient.id).find(parent_reference) if parent_reference.present?

        payload = attributes.transform_values { |value| value.respond_to?(:iso8601) ? value.iso8601(6) : value }.merge(
          patient_id: patient.id,
          encounter_id: encounter&.id,
          parent_observation_id: parent_observation&.id
        )
        outcome = Clinic::Idempotency.execute(
          practice: practice,
          actor: actor,
          operation_code: OPERATION_CODE,
          request_key: request_key,
          payload: payload,
          authorization: -> {
            authorized_encounter = resolve_encounter(practice, patient, encounter&.id)
            Authorization.authorize!(actor: actor, practice: practice, action: "observations.write",
              site: authorized_encounter&.site)
          },
          authorization_action: "observations.write",
          result_resource: ->(observation) { observation },
          resource_resolver: ->(practice:, receipt:) {
            observation = practice.observations.find_by(id: receipt.resource_id)
            next unless observation
            next unless observation.patient_id == patient.id && observation.encounter_id == encounter&.id
            next unless observation.parent_observation_id == parent_observation&.id

            observation
          }
        ) do
          locked_patient = practice.patients.find(patient.id)
          locked_encounter = resolve_encounter(practice, locked_patient, encounter&.id)
          locked_parent = resolve_parent_observation(practice, locked_patient, parent_observation&.id)
          author_membership = practice.memberships.active.find_by!(user: actor)
          observation = locked_patient.observations.create!(attributes.merge(
            practice: practice,
            author_membership: author_membership,
            encounter: locked_encounter,
            parent_observation: locked_parent,
            recorded_at: attributes[:recorded_at] || Time.current
          ))
          Clinic::AuditRecorder.record!(
            practice: practice,
            actor: actor,
            action_code: OPERATION_CODE,
            outcome: :committed,
            resource_version_ref: "Clinic::Care::Observation/#{observation.id}"
          )
          observation
        end

        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

        outcome.value
      end

      def self.resolve_encounter(practice, patient, encounter_id)
        return unless encounter_id

        practice.encounters.where(patient_id: patient.id).find(encounter_id)
      end
      private_class_method :resolve_encounter

      def self.resolve_parent_observation(practice, patient, observation_id)
        return unless observation_id

        practice.observations.where(patient_id: patient.id).find(observation_id)
      end
      private_class_method :resolve_parent_observation
    end
  end
end
