module Clinic
  class CliniciansController < ApiController
    before_action -> { require_capability_with_legacy("appointments.book", "patients.read") }

    def index
      profiles = current_practice.clinician_profiles.includes(:assignments, :credentials)
      if params[:site_id].present?
        site_id = requested_id!(params[:site_id], :site_id)
        profiles = profiles.joins(:assignments).where(clinic_clinician_assignments: { site_id: site_id }).distinct
      end
      detail = current_ability.allowed_permission?("patients.read")
      paginate(profiles, key: :clinicians, serializer: ->(profile) { ClinicianSerializer.call(profile, detail: detail) },
        order: { id: :asc })
    end
  end
end
