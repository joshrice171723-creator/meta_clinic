module Clinic
  module Care
    module PatientCareCoordinationSerializer
      def self.call(record, patient:)
        {
          id: record&.id,
          patient_id: patient.id,
          revision: record&.revision || 0,
          payload: record ? record.payload : PatientCareCoordinationRevision.empty_payload,
          recorded_at: record&.recorded_at&.iso8601(6),
          recorded_by_membership_id: record&.recorded_by_membership_id
        }
      end
    end
  end
end
