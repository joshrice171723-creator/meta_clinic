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
    end
  end
end
