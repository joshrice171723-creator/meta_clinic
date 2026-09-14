module Clinic
  class CliniciansController < ApiController
    before_action -> { require_capability_with_legacy("appointments.book", "patients.read") unless params[:setup].to_s == "true" }, only: :index

    def index
      if params[:setup].to_s == "true"
        require_capability("facilities.write")
        candidates = current_practice.memberships.active.includes(:user).select do |member|
          member.user.active? && ::Ability.new(member.user, practice: current_practice).allowed_permission?("notes.sign", any_site: true)
        end
        return render json: {
          clinicians: current_practice.clinician_profiles.map { |profile| ClinicianSerializer.call(profile, detail: true).merge(display_name: profile.display_name) },
          candidates: candidates.map { |member| { membership_id: member.id, label: member.user.email_address } },
          sites: current_practice.sites.where(status: "active").map { |site| { id: site.id, name: site.name } }
        }
      end
      profiles = current_practice.clinician_profiles.includes(:assignments, :credentials)
      if params[:site_id].present?
        site_id = requested_id!(params[:site_id], :site_id)
        profiles = profiles.joins(:assignments).where(clinic_clinician_assignments: { site_id: site_id }).distinct
      end
      detail = current_ability.allowed_permission?("patients.read")
      paginate(profiles, key: :clinicians, serializer: ->(profile) { ClinicianSerializer.call(profile, detail: detail) },
        order: { id: :asc })
    end

    def create
      require_capability("facilities.write")
      input = parameter_hash!(:clinician, %i[membership_id display_name site_id department])
      membership = current_practice.memberships.active.find(requested_id!(input[:membership_id], :membership_id))
      site = current_practice.sites.where(status: "active").find(requested_id!(input[:site_id], :site_id))
      name = required_string!(input[:display_name], field: :display_name, maximum: 120)
      department_code = required_string!(input[:department], field: :department, maximum: 80)
      profile = membership.with_lock do
        unless membership.user.active? && ::Ability.new(membership.user, practice: current_practice).allowed_permission?("notes.sign", site: site)
          raise ArgumentError, "Activate the clinician's authorized workforce access first. Scheduling setup does not grant clinical permissions."
        end
        record = current_practice.clinician_profiles.find_or_initialize_by(membership: membership)
        if record.persisted? && record.display_name != name
          raise ArgumentError, "This clinician already has a scheduling profile. Use the existing name to add a location."
        end
        record.update!(display_name: name)
        department = current_practice.departments.find_or_create_by!(code: department_code)
        assignment = record.assignments.current.find_by(site: site, department: department)
        record.assignments.create!(practice: current_practice, site: site, department: department, effective_from: Time.current) unless assignment
        Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
          action_code: "facilities.clinician.configure", outcome: :committed, resource_version_ref: "clinician-profile:#{record.id}")
        record
      end
      render json: { clinician: ClinicianSerializer.call(profile, detail: true).merge(display_name: profile.display_name) }, status: :created
    end
  end
end
