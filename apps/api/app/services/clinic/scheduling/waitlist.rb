module Clinic
  module Scheduling
    module Waitlist
      module_function

      def serialize(entry)
        {
          id: entry.id, patient_id: entry.patient_id, patient_name: entry.patient.display_name,
          site_id: entry.site_id, site_name: entry.site.name, clinician_id: entry.clinician_id,
          clinician_name: entry.clinician.display_name, visit_type_id: entry.visit_type_id,
          visit_type_name: entry.visit_type.code, earliest_at: entry.earliest_at.iso8601(6),
          latest_at: entry.latest_at.iso8601(6), duration_minutes: entry.duration_minutes,
          state: entry.effective_state, recorded_state: entry.state, version: entry.lock_version,
          reason: entry.reason, created_at: entry.created_at.iso8601(6),
          offer_starts_at: entry.offer_starts_at&.iso8601(6), offer_ends_at: entry.offer_ends_at&.iso8601(6),
          offer_expires_at: entry.offer_expires_at&.iso8601(6), appointment_id: entry.appointment_id
        }
      end

      def authorize!(practice:, actor:, site:)
        Clinic::Authorization.authorize_with_legacy!(practice: practice, actor: actor,
          action: "appointments.book", legacy_action: "appointments.write", site: site)
      end

      def transition(entry:, actor:, action:, expected_version:, request_key:, attributes: {})
        authorization = -> { authorize!(practice: entry.practice, actor: actor, site: entry.site) }
        authorization.call
        result = Clinic::Idempotency.execute(
          practice: entry.practice, actor: actor, operation_code: "waitlist.#{action}", request_key: request_key,
          resource: entry, authorization: authorization, authorization_action: "appointments.book",
          payload: { id: entry.id, action: action, version: expected_version, attributes: attributes },
          result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { WaitlistEntry.find_by(practice: practice, id: receipt.resource_id) }
        ) do
          entry.clinician.lock!
          entry.lock!
          raise ActiveRecord::StaleObjectError.new(entry, action) unless entry.lock_version == expected_version
          case action
          when "offer"
            raise ArgumentError, "Only waiting or expired entries can receive an offer." unless %w[waiting expired].include?(entry.effective_state)
            starts_at = attributes.fetch(:starts_at)
            ends_at = starts_at + entry.duration_minutes.minutes
            expires_at = attributes.fetch(:expires_at)
            now = Current.business_time
            unless starts_at > now && starts_at >= entry.earliest_at && ends_at <= entry.latest_at &&
              expires_at > now && expires_at <= starts_at && expires_at <= now + 7.days
              raise ArgumentError, "The offer must fit the requested window and expire before it starts, within seven days."
            end
            CapacityGuard.check!(practice: entry.practice, clinician: entry.clinician, site: entry.site,
              starts_at: starts_at, ends_at: ends_at, waitlist_entry_id: entry.id)
            entry.update!(state: "offered", offer_starts_at: starts_at, offer_ends_at: ends_at, offer_expires_at: expires_at)
          when "release", "requeue"
            raise ArgumentError, "This entry cannot return to the waitlist." if %w[booked cancelled].include?(entry.state)
            raise ArgumentError, "The requested window has ended. Create a new waitlist request." unless entry.latest_at > Current.business_time
            entry.update!(state: "waiting", offer_starts_at: nil, offer_ends_at: nil, offer_expires_at: nil)
          when "cancel"
            raise ArgumentError, "Cancel a booked appointment from the schedule." if entry.state == "booked"
            entry.update!(state: "cancelled")
          when "accept"
            raise ArgumentError, "Confirm that the patient accepted this offer." unless attributes[:patient_accepted] == true
            book!(entry, actor)
          else
            raise ArgumentError, "Choose a supported waitlist action."
          end
          Clinic::AuditRecorder.record!(practice: entry.practice, actor: actor,
            action_code: "waitlist.#{action}", outcome: :committed, resource_version_ref: "waitlist/#{entry.id}:#{entry.lock_version}")
          entry
        end
        result.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def portal_reply(entry:, identity:, actor:, action:, expected_version:)
        ApplicationRecord.transaction do
          identity.lock!
          unless identity.active? && actor.active? && identity.user_id == actor.id &&
            identity.practice_id == entry.practice_id && identity.patient_id == entry.patient_id
            raise Clinic::Authorization::Denied
          end
          entry.clinician.lock!
          entry.lock!
          # A repeated acceptance returns its existing appointment without booking twice.
          return entry if action == "accept" && entry.state == "booked"
          raise ActiveRecord::StaleObjectError.new(entry, action) unless entry.lock_version == expected_version
          raise ArgumentError, "This offer has expired or is no longer available." unless entry.effective_state == "offered"
          if action == "accept"
            book!(entry, actor)
          elsif action == "decline"
            entry.update!(state: "waiting", offer_starts_at: nil, offer_ends_at: nil, offer_expires_at: nil)
          else
            raise ArgumentError, "Choose accept or decline."
          end
          Clinic::AuditRecorder.record!(practice: entry.practice, actor: actor,
            action_code: "patient_portal.waitlist.#{action}", outcome: :committed,
            resource_version_ref: "waitlist/#{entry.id}:#{entry.lock_version}")
          entry
        end
      end

      def book!(entry, actor)
        raise ArgumentError, "This offer has expired or is no longer available." unless entry.effective_state == "offered"
        CapacityGuard.check!(practice: entry.practice, clinician: entry.clinician, site: entry.site,
          starts_at: entry.offer_starts_at, ends_at: entry.offer_ends_at, waitlist_entry_id: entry.id)
        if entry.practice.appointments.where(patient: entry.patient, status: %w[scheduled confirmed])
          .where("starts_at < ? AND ends_at > ?", entry.offer_ends_at, entry.offer_starts_at).exists?
          raise ArgumentError, "The patient already has an appointment during this time. Release the offer or choose another slot."
        end
        appointment = entry.practice.appointments.create!(patient: entry.patient, site: entry.site,
          booked_clinician: entry.clinician, visit_type: entry.visit_type, starts_at: entry.offer_starts_at,
          ends_at: entry.offer_ends_at, status: "scheduled", visit_modality: "in_person", reason: entry.reason)
        entry.update!(state: "booked", appointment: appointment)
        Clinic::AuditRecorder.record!(practice: entry.practice, actor: actor, action_code: "waitlist.book",
          outcome: :committed, resource_version_ref: "appointment/#{appointment.id}")
      end
      private_class_method :book!
    end
  end
end
