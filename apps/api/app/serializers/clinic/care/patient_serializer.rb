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
          updated_at: patient.updated_at.iso8601(6),
          demographics: patient.demographics&.as_json(only: %i[legal_name preferred_name date_of_birth sex primary_language interpreter_required]),
          primary_address: primary_address(patient.primary_address_version),
          contacts: current_versions(patient.contacts, partition_by: :contact_type).map { |c| c.as_json(only: %i[id contact_type contact_value preferred effective_from effective_until]) },
          emergency_contacts: current_versions(patient.emergency_contacts).map { |c| c.as_json(only: %i[id name relationship phone permission_to_contact effective_from effective_until]) },
          communication_preference: patient.communication_preference&.as_json(only: %i[preferred_contact_method appointment_reminders_consent general_communications_consent]),
          social_histories: current_versions(patient.social_histories).map { |s| s.as_json(only: %i[id tobacco_use alcohol_use exercise_habits diet occupation living_situation relevant_social_factors effective_from effective_until]) },
          vital_signs: patient.observations.where(value_kind: :numeric).order(observed_at: :desc, id: :desc).limit(50).map do |o|
            {
              id: o.id,
              code: o.code,
              numeric_value: o.numeric_value&.to_d&.to_s("F"),
              unit_code: o.unit_code,
              observed_at: o.observed_at
            }
          end
        )
      end

      def self.current_versions(relation, partition_by: nil)
        ordered = if relation.loaded?
          relation.sort_by { |record| [ record.created_at, record.id ] }.reverse
        else
          relation.order(created_at: :desc, id: :desc).to_a
        end
        latest = partition_by ? ordered.uniq { |record| record.public_send(partition_by) } : ordered.first(1)
        latest.select { |record| record.effective_until.nil? }
      end
      private_class_method :current_versions

      def self.primary_address(address)
        return unless address

        { id: address.id, version: address.version, formatted: address.encrypted_address }
      end
      private_class_method :primary_address
    end
  end
end
