module Clinic
  module PatientPortal
    module RequestAccess
      module_function

      # Call inside the request transaction. Existing staff-origin callers have
      # no portal identity; their owning workflow authorizes the staff action.
      def authorize!(practice:, patient:, identity:, actor:)
        return unless identity

        identity.lock!
        user = User.lock.find(identity.user_id)
        unless identity.active? && user.active? && actor&.id == user.id &&
            identity.practice_id == practice.id && identity.patient_id == patient.id && patient.practice_id == practice.id
          raise ActiveRecord::RecordNotFound, "Patient portal access is no longer available."
        end
        identity
      end
    end
  end
end
