module Clinic
  module Scheduling
    class HoldSlot
      def self.call(practice:, actor:, patient:, site:, clinician:, room:, starts_at:, ends_at:, expires_at:, request_key:)
        authorize = -> { Authorization.authorize_with_legacy!(practice: practice, actor: actor, action: "appointments.book", legacy_action: "appointments.write", site: site) }
        authorize.call
        Clinic::Idempotency.execute(practice: practice, actor: actor, operation_code: "schedule_hold.create", request_key: request_key,
          payload: { patient_id: patient&.id, site_id: site.id, clinician_id: clinician.id, room_id: room&.id, starts_at: starts_at.iso8601(6), ends_at: ends_at.iso8601(6), expires_at: expires_at.iso8601(6) }, authorization: authorize,
          result_resource: ->(hold) { hold }, resource_resolver: ->(practice:, receipt:) { ScheduleHold.find_by(practice: practice, id: receipt.resource_id) }) do
          ApplicationRecord.transaction do
            raise ArgumentError, "A hold must expire before its slot begins." unless expires_at > Current.business_time && expires_at <= starts_at
            CapacityGuard.check!(practice: practice, clinician: clinician, site: site, patient: patient, room: room,
              starts_at: starts_at, ends_at: ends_at)
            hold = ScheduleHold.create!(practice: practice, patient: patient, site: site, clinician: clinician, room: room, starts_at: starts_at, ends_at: ends_at, expires_at: expires_at, request_key: request_key)
            AuditRecorder.record!(practice: practice, actor: actor, action_code: "schedule_hold.create", outcome: :committed, resource_version_ref: "schedule_hold/#{hold.id}:#{hold.lock_version}")
            hold
          end
        end.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end
    end
  end
end
