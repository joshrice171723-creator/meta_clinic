module Development
  class PatientPortal
    def self.prepare!(user)
      ensure_local!
      omni = User.find_by!(email_address: TestAccounts::PROFILES.fetch("omni")[:email])
      practice = omni.clinic_membership&.practice
      raise TestAccounts::Unavailable, "The Omni synthetic clinic is not ready." unless practice

      patient = practice.patients.where("reference LIKE ?", "SYN-OMNI-%").order(:id).first
      raise TestAccounts::Unavailable, "The Omni synthetic patient is not ready." unless patient

      identity = Clinic::PatientPortal::Identity.find_or_initialize_by(user: user)
      if identity.persisted? && (identity.practice_id != practice.id || identity.patient_id != patient.id)
        raise TestAccounts::Unavailable, "The patient portal fixture conflicts with an existing identity."
      end
      identity.assign_attributes(practice: practice, patient: patient, status: :active,
        invited_at: identity.invited_at || Time.current, activated_at: identity.activated_at || Time.current,
        revoked_at: nil)
      identity.save!
      identity
    end

    def self.ensure_local!
      return if Rails.env.test? || (Rails.env.development? && ENV["APP_DEVELOPMENT_LOGIN"] == "1")
      raise TestAccounts::Unavailable, "Patient portal fixtures require explicitly enabled local development."
    end
    private_class_method :ensure_local!
  end
end
