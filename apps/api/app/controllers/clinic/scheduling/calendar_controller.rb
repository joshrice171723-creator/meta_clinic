module Clinic
  module Scheduling
    class CalendarController < Clinic::ApiController
      def show
        site = current_practice.sites.find(requested_id!(params[:site_id], :site_id))
        require_capability("appointments.read", site: site)
        date = date_param!(params[:date], field: :date)
        entry = nil
        if params.key?(:waitlist_entry_id)
          patient_action = current_ability.allowed_permission?("patients.read") ? :read : :read_identity
          patients = current_practice.patients.accessible_by(current_ability, patient_action)
          entry = WaitlistEntry.where(practice: current_practice, site: site)
            .where(patient_id: patients.select(:id)).find(requested_id!(params[:waitlist_entry_id], :waitlist_entry_id))
        end
        duration = params.key?(:duration_minutes) ?
          bounded_integer!(params[:duration_minutes], field: :duration_minutes, min: 5, max: 240) :
          (entry&.duration_minutes || Calendar::SLOT_MINUTES)
        if entry && duration != entry.duration_minutes
          raise ArgumentError, "The requested duration no longer matches the waitlist entry. Refresh the waitlist."
        end
        render json: Calendar.new(practice: current_practice, site: site, date: date, actor: current_user,
          duration_minutes: duration, waitlist_entry: entry).call
      end
    end
  end
end
