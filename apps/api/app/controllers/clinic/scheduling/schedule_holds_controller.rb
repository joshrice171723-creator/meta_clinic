module Clinic
  module Scheduling
    class ScheduleHoldsController < Clinic::ApiController
      def create
        input = parameter_hash!(:hold, %i[request_key patient_id site_id clinician_id room_id starts_at ends_at expires_at])
        site = current_practice.sites.find(requested_id!(input[:site_id], :site_id))
        hold = HoldSlot.call(practice: current_practice, actor: current_user,
          patient: input[:patient_id].present? ? current_practice.patients.find(requested_id!(input[:patient_id], :patient_id)) : nil,
          site: site, clinician: current_practice.clinician_profiles.find(requested_id!(input[:clinician_id], :clinician_id)),
          room: input[:room_id].present? ? current_practice.rooms.find(requested_id!(input[:room_id], :room_id)) : nil,
          starts_at: time_param!(input[:starts_at], field: :starts_at), ends_at: time_param!(input[:ends_at], field: :ends_at),
          expires_at: time_param!(input[:expires_at], field: :expires_at), request_key: required_string!(input[:request_key], field: :request_key, maximum: 160))
        render json: { hold: { id: hold.id, state: hold.state, starts_at: hold.starts_at.iso8601(6), ends_at: hold.ends_at.iso8601(6), expires_at: hold.expires_at.iso8601(6), lock_version: hold.lock_version } }, status: :created
      end

      def release
        hold = ScheduleHold.where(practice: current_practice).find(requested_id!(params[:id], :id))
        require_capability_with_legacy("appointments.book", "appointments.write", site: hold.site)
        input = parameter_hash!(:hold, %i[request_key lock_version])
        result = Clinic::Idempotency.execute(practice: current_practice, actor: current_user, operation_code: "schedule_hold.release",
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160), payload: { id: hold.id, lock_version: input[:lock_version] },
          result_resource: ->(value) { value }, resource_resolver: ->(practice:, receipt:) { ScheduleHold.find_by(practice: practice, id: receipt.resource_id) }) do
          hold.lock!
          raise ActiveRecord::StaleObjectError.new(hold, "release") unless hold.lock_version == bounded_integer!(input[:lock_version], field: :lock_version, min: 0)
          hold.expire_if_needed!
          raise ArgumentError, "Only an active hold can be released." unless hold.state == "active"
          hold.update!(state: "released")
          AuditRecorder.record!(practice: current_practice, actor: current_user, action_code: "schedule_hold.release", outcome: :committed, resource_version_ref: "schedule_hold/#{hold.id}:#{hold.lock_version}")
          hold
        end
        released = result.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
        render json: { hold: { id: released.id, state: released.state, lock_version: released.lock_version } }
      end
    end
  end
end
