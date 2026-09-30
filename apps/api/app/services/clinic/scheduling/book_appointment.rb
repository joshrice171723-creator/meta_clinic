module Clinic
  module Scheduling
    class BookAppointment
      def self.call(practice:, actor:, patient:, starts_at:, ends_at:, site: nil, room: nil, booked_clinician: nil, visit_type: nil,
        reason: nil, request_key: nil, visit_modality: "in_person", schedule_hold: nil, service_offering: nil,
        overbook_reason: nil, expected_policy_revision: nil, first_available: false, walk_in: false, capacity_override_reason: nil)
        authorize = -> {
          Authorization.authorize_with_legacy!(actor: actor, practice: practice,
            action: "appointments.book", legacy_action: "appointments.write", site: site)
        }
        authorize.call
        if overbook_reason.present?
          Authorization.authorize!(actor: actor, practice: practice, action: "appointments.overbook", site: site)
        end
        raise ArgumentError, "A walk-in cannot also be overbooked." if walk_in && overbook_reason.present?
        raise ArgumentError, "Choose a clinician for a walk-in appointment." if walk_in && first_available
        raise ArgumentError, "Walk-in appointments must be in person." if walk_in && visit_modality.to_s != "in_person"
        raise ArgumentError, "A walk-in cannot use a held appointment slot." if walk_in && schedule_hold
        if walk_in
          Authorization.authorize!(actor: actor, practice: practice, action: "appointments.capacity_override", site: site)
          raise ArgumentError, "Enter a walk-in capacity override reason of 1–500 characters." unless capacity_override_reason.to_s.strip.length.between?(1, 500)
        elsif capacity_override_reason.present?
          raise ArgumentError, "Select the walk-in option before entering a capacity override reason."
        end
        raise ArgumentError, "The patient must belong to the selected practice." unless patient.practice_id == practice.id
        raise ArgumentError, "Choose a site before scheduling this appointment." unless site
        if first_available
          raise ArgumentError, "Choose a clinician because providers are now available." if practice.clinician_profiles.exists?
          raise ArgumentError, "First available cannot use a held slot, video visit, or overbook exception." if
            schedule_hold || visit_modality.to_s == "video" || overbook_reason.present?
          raise ArgumentError, "First available cannot use a service offering. Add a clinician or choose visit-type booking." if service_offering
        elsif !booked_clinician
          raise ArgumentError, "Choose a clinician before scheduling this appointment."
        end
        raise ArgumentError, "Choose a visit type before scheduling this appointment." unless visit_type
        raise ArgumentError, "The site must belong to the selected practice." unless site.practice_id == practice.id
        if booked_clinician && booked_clinician.practice_id != practice.id
          raise ArgumentError, "The clinician must belong to the selected practice."
        end
        raise ArgumentError, "The visit type must belong to the selected practice." unless visit_type.practice_id == practice.id
        if room && (room.practice_id != practice.id || room.site_id != site.id)
          raise ArgumentError, "The selected room must belong to the appointment site."
        end
        visit_modality = visit_modality.to_s.presence || "in_person"
        raise ArgumentError, "Visit format must be in person or video." unless %w[in_person video].include?(visit_modality)
        if visit_modality == "video"
          raise ArgumentError, "A video visit cannot reserve a physical room." if room
          raise ArgumentError, "Choose a clinician for a video visit." unless booked_clinician
        end
        attributes = {
          patient: patient,
          site: site,
          room: room,
          booked_clinician: booked_clinician,
          visit_type: visit_type,
          reason: reason.to_s.strip.presence,
          starts_at: starts_at,
          ends_at: ends_at,
          visit_modality: visit_modality,
          schedule_hold: schedule_hold,
          service_offering: service_offering,
          actor: actor,
          overbook_reason: overbook_reason,
          expected_policy_revision: expected_policy_revision,
          walk_in: walk_in,
          capacity_override_reason: capacity_override_reason
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
            first_available: first_available,
            visit_type_id: visit_type&.id,
            service_offering_id: service_offering&.id,
            schedule_hold_id: schedule_hold&.id,
            reason: reason.to_s.strip.presence,
            starts_at: starts_at.utc.iso8601(6),
            ends_at: ends_at.utc.iso8601(6),
            visit_modality: visit_modality,
            overbook_reason: overbook_reason.to_s.strip.presence,
            walk_in: walk_in,
            capacity_override_reason: capacity_override_reason.to_s.strip.presence,
            expected_policy_revision: expected_policy_revision
          }
        ) do
          create_appointment(practice: practice, **attributes)
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      rescue ActiveRecord::StatementInvalid => error
        raise unless error.message.match?(/overlap|exclusion|no_provider|no_room/i)

        raise ArgumentError, "The selected room or clinician is already reserved for that interval."
      end

      def self.create_appointment(practice:, patient:, starts_at:, ends_at:, site:, room:, booked_clinician:, visit_type:, reason:,
        visit_modality:, actor:, schedule_hold: nil, service_offering: nil, overbook_reason: nil, expected_policy_revision: nil,
        walk_in: false, capacity_override_reason: nil)
        ApplicationRecord.transaction do
          practice.lock!
          if schedule_hold
            schedule_hold.lock!
            schedule_hold.expire_if_needed!
            unless schedule_hold.active? && schedule_hold.practice_id == practice.id && schedule_hold.patient_id == patient.id &&
              schedule_hold.site_id == site.id && schedule_hold.clinician_id == booked_clinician.id && schedule_hold.room_id == room&.id &&
              schedule_hold.starts_at == starts_at && schedule_hold.ends_at == ends_at
              raise ArgumentError, "The selected hold is no longer available for this appointment."
            end
          end
          snapshot = service_offering && offering_snapshot!(offering: service_offering, practice: practice,
            site: site, clinician: booked_clinician, room: room, visit_type: visit_type, visit_modality: visit_modality,
            starts_at: starts_at, ends_at: ends_at)
          Configuration::StarterProfile.require_service!(practice: practice, site:, service: "telehealth") if visit_modality == "video"
          overbook = overbook_reason.present?
          policy = nil
          if overbook
            membership = Authorization.authorize!(actor: actor, practice: practice, action: "appointments.overbook", site: site)
            raise ArgumentError, "An overbooked appointment cannot use a slot hold." if schedule_hold
            if visit_modality == "in_person" && room&.kind != "physical"
              raise ArgumentError, "Choose a separate physical room for an in-person overbook exception."
            end
            raise ArgumentError, "Enter an overbook reason of 1–500 characters." unless overbook_reason.to_s.strip.length.between?(1, 500)
            policy = SitePolicy.current(practice: practice, site: site)
            unless policy&.overbook_enabled? && policy.revision == expected_policy_revision &&
                policy.eligible_visit_type_ids.include?(visit_type.id) && visit_type.retired_at.nil?
              raise ArgumentError, "Overbooking is unavailable for this site, visit type, or policy revision."
            end
          end
          capacity_override_membership = if walk_in
            Authorization.authorize!(actor: actor, practice: practice, action: "appointments.capacity_override", site: site)
          end
          allocation = CapacityGuard.check!(practice: practice, clinician: booked_clinician, site: site, patient: patient, room: room,
            starts_at: starts_at, ends_at: ends_at, schedule_hold_id: schedule_hold&.id, overbook: overbook,
            capacity_override: walk_in) || 1
          conflicts = overbook ? practice.appointments.where(booked_clinician: booked_clinician, status: %w[scheduled confirmed])
            .where("starts_at < ? AND ends_at > ?", ends_at, starts_at).pluck(:id) : []
          appointment = practice.appointments.create!(patient: patient, site: site, room: room,
            booked_clinician: booked_clinician, visit_type: visit_type, reason: reason, starts_at: starts_at, ends_at: ends_at,
            status: "scheduled", visit_modality: visit_modality, schedule_hold: schedule_hold,
            clinician_allocation: allocation,
            service_offering: service_offering, service_offering_snapshot: snapshot)
          if walk_in
            WalkInException.create!(practice: practice, appointment: appointment, site: site,
              written_by_membership: capacity_override_membership, reason: capacity_override_reason.to_s.strip)
          end
          if overbook
            OverbookException.create!(practice: practice, appointment: appointment, site: site,
              written_by_membership: membership, policy_revision: policy.revision,
              conflicting_appointment_ids: conflicts, reason: overbook_reason.to_s.strip)
          end
          schedule_hold.update!(state: "converted") if schedule_hold
          Clinic::Telehealth::ReconcileAppointment.call(appointment: appointment, actor: actor) if visit_modality == "video"
          appointment
        end
      end
      private_class_method :create_appointment

      def self.offering_snapshot!(offering:, practice:, site:, clinician:, room:, visit_type:, visit_modality:, starts_at:, ends_at:)
        offering = practice.service_offerings.lock.find(offering.id)
        raise ArgumentError, "Choose a published service offering." unless offering.published?
        raise ArgumentError, "The service offering is unavailable at this site." unless offering.sites.exists?(id: site.id)
        eligible_clinician_ids = offering.offering_clinicians.pluck(:clinician_id).sort
        if eligible_clinician_ids.any? && !eligible_clinician_ids.include?(clinician.id)
          raise ArgumentError, "The selected clinician is not eligible for this service offering."
        end
        raise ArgumentError, "Choose the visit type configured for this service offering." unless offering.visit_type_id == visit_type&.id
        unless offering.modality == "either" || offering.modality == visit_modality
          raise ArgumentError, "The service offering does not support this visit format."
        end
        if offering.requires_room && room.nil? && visit_modality == "in_person"
          raise ArgumentError, "Choose a room for this service offering."
        end
        unless ends_at - starts_at == offering.duration_minutes.minutes
          raise ArgumentError, "Choose the configured duration for this service offering."
        end

        { "name" => offering.name, "code" => offering.code, "visit_type_id" => offering.visit_type_id,
          "duration_minutes" => offering.duration_minutes, "modality" => offering.modality,
          "requires_room" => offering.requires_room, "eligible_clinician_ids" => eligible_clinician_ids,
          "published_at" => offering.published_at&.iso8601(6),
          "revision" => offering.lock_version }
      end
    end
  end
end
