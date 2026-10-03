module Clinic
  module Scheduling
    class CreateEncounter
      def self.call(practice:, actor:, patient:, started_at: Current.business_time, appointment: nil, site: nil, room: nil)
        raise ArgumentError, "The patient must belong to the selected practice." unless patient.practice_id == practice.id
        if appointment && (appointment.practice_id != practice.id || appointment.patient_id != patient.id)
          raise ArgumentError, "The appointment must belong to the selected patient and practice."
        end
        if appointment
          return appointment.with_lock do
            raise ArgumentError, "The selected site does not match the appointment." if site && site.id != appointment.site_id
            raise ArgumentError, "The selected room does not match the appointment." if room && room.id != appointment.room_id

            Authorization.authorize!(actor: actor, practice: practice, action: "encounters.write", site: appointment.site)
            existing = practice.encounters.find_by(appointment_id: appointment.id)
            if existing
              auto_assign_intake_owner!(existing, actor)
              next existing
            end
            if appointment.site_id.blank? || appointment.visit_type_id.blank?
              raise ArgumentError, "Choose a site and visit type before starting this scheduled visit."
            end
            unless %w[scheduled confirmed].include?(appointment.status)
              raise ArgumentError, "Only scheduled or confirmed appointments can start a visit."
            end

            encounter = practice.encounters.create!(patient: patient, appointment: appointment,
              site: appointment.site, room: appointment.room, started_at: started_at, status: "open")
            auto_assign_intake_owner!(encounter, actor)
            Clinic::Telehealth::ReconcileAppointment.bind_encounter!(appointment: appointment, encounter: encounter)
            encounter
          end
        end

        Authorization.authorize!(actor: actor, practice: practice, action: "encounters.write", site: site)
        raise ArgumentError, "Choose a location in the selected clinic before starting a visit." unless site&.practice_id == practice.id
        if room && (room.practice_id != practice.id || room.site_id != site.id)
          raise ArgumentError, "The selected room must belong to the encounter location."
        end
        ApplicationRecord.transaction do
          practice.lock!
          features = Clinic::Configuration::PracticeFeatures.snapshot(practice: practice, site: site)
          unless Configuration::StarterProfile.ready?(site, features)
            raise ArgumentError, "Complete this location's specialty setup before starting a new visit."
          end
          encounter = practice.encounters.create!(patient: patient, site: site, room: room,
            started_at: started_at, status: "open")
          auto_assign_intake_owner!(encounter, actor)
          encounter
        end
      rescue ActiveRecord::RecordNotUnique
        raise ArgumentError, "That appointment already has an encounter."
      end

      def self.auto_assign_intake_owner!(encounter, actor)
        return unless encounter.site
        return if encounter.participants.intake_owners.current.exists?

        operator = encounter.practice.memberships.active.find_by(user_id: actor.id)
        scheduled_membership = encounter.appointment&.booked_clinician&.membership
        scheduled_clinician = if scheduled_membership
          encounter.practice.memberships.active.find_by(id: scheduled_membership.id)
        end
        membership = [ operator, scheduled_clinician ].compact.uniq.find do |candidate|
          ::Ability.new(candidate.user, practice: encounter.practice)
            .allowed_permission?("intake.write", site: encounter.site)
        end
        return unless membership

        encounter.participants.create!(
          practice: encounter.practice,
          patient: encounter.patient,
          membership: membership,
          participation_role: Clinic::Scheduling::IntakeOwnership::ROLE,
          effective_from: Current.business_time,
          effective_until: Current.business_time + Clinic::Scheduling::IntakeOwnership::LEASE_DURATION
        )
      end
      private_class_method :auto_assign_intake_owner!
    end
  end
end
