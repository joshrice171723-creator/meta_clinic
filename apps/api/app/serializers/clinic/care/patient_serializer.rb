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
          updated_at: patient.updated_at
        )
      end
    end
  end
end
