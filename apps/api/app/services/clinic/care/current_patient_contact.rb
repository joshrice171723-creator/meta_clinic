module Clinic
  module Care
    module CurrentPatientContact
      module_function

      # Contact corrections and removals append versions. An older open-ended
      # row must never become current again after a newer version closes it.
      def call(patient:, contact_type:, at: Current.business_time)
        latest = patient.contacts.where(practice_id: patient.practice_id, contact_type: contact_type)
          .where("effective_from <= ?", at).order(created_at: :desc, id: :desc).first
        latest if latest && (latest.effective_until.nil? || latest.effective_until > at)
      end

      def for_patients(patient_scope:, practice_id:, contact_type:, at: Current.business_time)
        contacts = PatientContact.where(practice_id: practice_id, contact_type: contact_type,
          patient_id: patient_scope.reselect(:id).reorder(nil))
        latest = contacts.where("effective_from <= ?", at)
          .select("DISTINCT ON (patient_id) id").order(:patient_id, created_at: :desc, id: :desc)
        # Apply expiry after choosing the latest version so an expired/closed
        # version cannot reveal an older open-ended contact again.
        contacts.where(id: latest).where("effective_until IS NULL OR effective_until > ?", at)
      end
    end
  end
end
