module Clinic
  module Care
    module PatientSerializer
      def self.call(patient, detail: false)
        payload = {
          id: patient.id,
          reference: patient.reference,
          display_name: patient.display_name
        }
        return payload unless detail

        payload.merge(
          primary_address_version_id: patient.primary_address_version_id,
          created_at: patient.created_at,
          updated_at: patient.updated_at,
          demographics: patient.demographics&.as_json(only: %i[date_of_birth sex primary_language interpreter_required]),
          contacts: patient.contacts.order(created_at: :desc).map { |c| c.as_json(only: %i[id contact_type contact_value preferred effective_from effective_until]) },
          emergency_contacts: patient.emergency_contacts.order(created_at: :desc).map { |c| c.as_json(only: %i[id name relationship phone permission_to_contact effective_from effective_until]) },
          communication_preference: patient.communication_preference&.as_json(only: %i[preferred_contact_method appointment_reminders_consent general_communications_consent]),
          social_histories: patient.social_histories.order(created_at: :desc).map { |s| s.as_json(only: %i[id tobacco_use alcohol_use exercise_habits diet occupation living_situation relevant_social_factors effective_from effective_until]) },
          vital_signs: patient.observations.where(value_kind: :numeric).order(observed_at: :desc, id: :desc).limit(50).map { |o| o.as_json(only: %i[id code numeric_value unit_code observed_at]) }
        )
      end
    end
  end
end
