module Clinic
  module Scheduling
    class BookAppointment
      def self.call(practice:, actor:, patient:, starts_at:, ends_at:, site: nil, room: nil, booked_clinician: nil, visit_type: nil,
        request_key: nil)
        authorize = -> {
          Authorization.authorize_with_legacy!(actor: actor, practice: practice,
            action: "appointments.book", legacy_action: "appointments.write", site: site)
        }
        authorize.call
        raise ArgumentError, "The patient must belong to the selected practice." unless patient.practice_id == practice.id

        attributes = {
          patient: patient,
          site: site,
          room: room,
          booked_clinician: booked_clinician,
          visit_type: visit_type,
          starts_at: starts_at,
          ends_at: ends_at
        }
        return create_appointment(practice: practice, **attributes) if request_key.nil?

        outcome = Clinic::Idempotency.execute(
          practice: practice, actor: actor, operation_code: "appointments.book",
          request_key: request_key, authorization: authorize, authorization_action: "appointments.book",
          result_resource: ->(appointment) { appointment },
          resource_resolver: ->(practice:, receipt:) {
            practice.appointments.find_by(id: receipt.resource_id)
          },
          payload: {
            patient_id: patient.id,
            site_id: site&.id,
            room_id: room&.id,
            booked_clinician_id: booked_clinician&.id,
            visit_type_id: visit_type&.id,
            starts_at: starts_at.utc.iso8601(6),
            ends_at: ends_at.utc.iso8601(6)
          }
        ) do
          create_appointment(practice: practice, **attributes)
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      rescue ActiveRecord::StatementInvalid => error
        raise unless error.message.match?(/overlap|exclusion|no_provider|no_room/i)

        raise ArgumentError, "The selected room or clinician is already reserved for that interval."
      end

      def self.create_appointment(practice:, patient:, starts_at:, ends_at:, site:, room:, booked_clinician:, visit_type:)
        appointment = practice.appointments.new(
          patient: patient,
          site: site,
          room: room,
          booked_clinician: booked_clinician,
          visit_type: visit_type,
          starts_at: starts_at,
          ends_at: ends_at,
          status: "scheduled"
        )
        appointment.save!
        appointment
      end
      private_class_method :create_appointment
    end
  end
end
