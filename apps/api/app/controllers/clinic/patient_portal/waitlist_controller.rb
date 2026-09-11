module Clinic
  module PatientPortal
    class WaitlistController < BaseController
      rescue_from ActiveRecord::StaleObjectError do
        render json: { error: "This offer changed. Refresh before responding.", code: "stale_record" }, status: :conflict
      end
      rescue_from Clinic::Authorization::Denied do
        render json: { error: "This offer is not available to this account." }, status: :forbidden
      end

      def index
        entries = scope.where(state: %w[waiting offered booked]).order(created_at: :desc).limit(30)
        record_portal_read("patient_portal.waitlist.read")
        render json: { entries: entries.map { |entry| Clinic::Scheduling::Waitlist.serialize(entry).except(:reason, :patient_name, :patient_id) } }
      end

      def update
        raise ArgumentError, "An active patient portal identity is required to accept an offer." unless patient_portal_identity
        input = parameter_hash!(:waitlist, %i[action expected_version request_key])
        entry = scope.find(integer_id!(params[:id], field: :id))
        updated = Clinic::Scheduling::Waitlist.portal_reply(entry: entry, identity: patient_portal_identity,
          actor: current_user, action: enum_param!(input[:action], field: :action, allowed: %w[accept decline]),
          expected_version: bounded_integer!(input[:expected_version], field: :expected_version, min: 0),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160))
        render json: { entry: Clinic::Scheduling::Waitlist.serialize(updated).except(:reason, :patient_name, :patient_id) }
      end

      private

      def scope
        Clinic::Scheduling::WaitlistEntry.where(practice: portal_practice, patient: portal_patient)
          .includes(:patient, :site, :clinician, :visit_type)
      end
    end
  end
end
