module Clinic
  module Telehealth
    module PatientVisitDetail
      module_function

      def call(identity:, public_id:)
        Visit.where(practice_id: identity.practice_id, patient_id: identity.patient_id)
          .includes(:practice, :patient, :encounter, :policy_version, :current_room_attempt,
            appointment: [ :practice, :patient, :booked_clinician ],
            participants: { membership: :clinician_profile },
            wrap_up: [ :encounter, :follow_up_appointment ])
          .find_by!(public_id: public_id)
      end
    end
  end
end
