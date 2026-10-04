module Clinic
  module Scheduling
    class WaitlistController < Clinic::ApiController
      def index
        entries = visible_entries.includes(:patient, :site, :clinician, :visit_type).order(:created_at, :id)
        entries = entries.where(state: %w[waiting offered]) unless params[:history] == "true"
        total = entries.count
        sites = current_practice.sites.where(id: visible_site_ids)
        site_options = sites.map do |site|
          { id: site.id, name: site.name, available_visit_type_ids:
            Configuration::StarterProfile.available_visit_type_ids(practice: current_practice, site: site) }
        end
        visit_type_ids = site_options.flat_map { |site| site[:available_visit_type_ids] }.uniq
        cancelled = current_practice.appointments.where(site_id: sites.select(:id), status: %w[cancelled no_show])
          .where("starts_at > ? AND starts_at < ?", Current.business_time, Current.business_time + 30.days)
          .order(:starts_at).limit(30)
        Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user, action_code: "waitlist.read", outcome: :released)
        render json: {
          entries: entries.limit(100).map { |entry| Waitlist.serialize(entry) }, total: total,
          ranking: "First requested, then entry ID; no inferred clinical priority.",
          sites: site_options,
          clinicians: current_practice.clinician_profiles.order(:id).map { |item| { id: item.id, name: item.display_name.presence || item.reference.presence || "Clinician profile ##{item.id}" } },
          visit_types: current_practice.visit_types.active.where(id: visit_type_ids).order(:id).map { |item| { id: item.id, name: item.code } },
          cancellations: cancelled.map { |item| { id: item.id, status: item.status, site_id: item.site_id,
            clinician_id: item.booked_clinician_id, starts_at: item.starts_at.iso8601(6), ends_at: item.ends_at.iso8601(6) } }
        }
      end

      def create
        input = parameter_hash!(:waitlist, %i[patient_id site_id clinician_id visit_type_id earliest_at latest_at duration_minutes reason request_key])
        site = current_practice.sites.find(requested_id!(input[:site_id], :site_id))
        Waitlist.authorize!(practice: current_practice, actor: current_user, site: site)
        patient = visible_patients.find(requested_id!(input[:patient_id], :patient_id))
        attributes = {
          site: site, patient: patient,
          clinician: current_practice.clinician_profiles.find(requested_id!(input[:clinician_id], :clinician_id)),
          visit_type: current_practice.visit_types.active.find(requested_id!(input[:visit_type_id], :visit_type_id)),
          earliest_at: time_param!(input[:earliest_at], field: :earliest_at),
          latest_at: time_param!(input[:latest_at], field: :latest_at),
          duration_minutes: bounded_integer!(input[:duration_minutes], field: :duration_minutes, min: 5, max: 240),
          reason: optional_string(input[:reason], field: :reason, maximum: 500)
        }
        entry = CreateWaitlistEntry.call(practice: current_practice, actor: current_user, attributes:,
          request_key: input[:request_key], payload: input.except(:request_key).to_h)
        render json: { entry: Waitlist.serialize(entry) }, status: :created
      end

      def transition
        entry = visible_entries.find(requested_id!(params[:id], :id))
        input = parameter_hash!(:waitlist, %i[action expected_version request_key starts_at expires_at patient_accepted])
        attributes = {}
        if input[:action] == "offer"
          attributes[:starts_at] = time_param!(input[:starts_at], field: :starts_at)
          attributes[:expires_at] = time_param!(input[:expires_at], field: :expires_at)
        end
        attributes[:patient_accepted] = boolean_param(input[:patient_accepted], field: :patient_accepted) if input.key?(:patient_accepted)
        updated = Waitlist.transition(entry: entry, actor: current_user,
          action: enum_param!(input[:action], field: :action, allowed: %w[offer release requeue cancel accept]),
          expected_version: bounded_integer!(input[:expected_version], field: :expected_version, min: 0),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160), attributes: attributes)
        render json: { entry: Waitlist.serialize(updated) }
      end

      private

      def visible_site_ids
        require_capability("appointments.read", any_site: true)
        current_practice.sites.select { |site| current_ability.allowed_permission?("appointments.read", site: site) }.map(&:id)
      end

      def visible_patients
        action = current_ability.allowed_permission?("patients.read") ? :read : :read_identity
        current_practice.patients.accessible_by(current_ability, action)
      end

      def visible_entries
        WaitlistEntry.where(practice: current_practice, site_id: visible_site_ids)
          .where(patient_id: visible_patients.select(:id))
      end
    end
  end
end
