module Clinic
  module Care
    module ObservationSerializer
      def self.call(observation)
        {
          id: observation.id,
          patient_id: observation.patient_id,
          encounter_id: observation.encounter_id,
          parent_observation_id: observation.parent_observation_id,
          author_membership_id: observation.author_membership_id,
          code: observation.code,
          code_system: observation.code_system,
          code_version: observation.code_version,
          value_kind: observation.value_kind,
          numeric_value: observation.numeric_value&.to_d&.to_s("F"),
          text_value: observation.text_value,
          coded_value: observation.coded_value,
          unit_code: observation.unit_code,
          missing_reason: observation.missing_reason,
          observed_at: observation.observed_at&.iso8601(6),
          recorded_at: observation.recorded_at&.iso8601(6)
        }.merge(VitalSigns.presentation(observation))
      end
    end
  end
end
