module Clinic
  module Telehealth
    module ReconcileAppointment
      module_function

      def call(appointment:, actor:, event: nil)
        membership = Clinic::Membership.active.find_by!(practice_id: appointment.practice_id, user_id: actor.id)
        visit = Visit.lock.find_by(practice_id: appointment.practice_id, appointment_id: appointment.id)
        if appointment.visit_modality == "video" && visit.nil?
          setting = Setting.lock.find_by(practice_id: appointment.practice_id)
          unless setting&.enabled? && setting.active_policy_version&.published?
            raise Error.new("Telehealth is not enabled with a published policy.", code: "telehealth_disabled")
          end
          eligibility = Eligibility.call(context: { business_date: Current.business_date }, appointment: appointment,
            policy: setting.active_policy_version)
          raise Error.new("This appointment is not eligible for video: #{eligibility.code}.", code: eligibility.code) unless eligibility.eligible
          visit = Visit.create!(practice_id: appointment.practice_id, patient_id: appointment.patient_id,
            appointment_id: appointment.id, policy_version_id: setting.active_policy_version_id,
            created_by_membership_id: membership.id, status: "scheduled")
          attach_patient_identity!(visit)
          attach_clinician!(visit, appointment)
          return visit
        end
        return unless visit

        visit.lock!
        if appointment.visit_modality != "video" || %w[cancelled no_show].include?(appointment.status)
          target = appointment.status == "no_show" ? "no_show" : "cancelled"
          revoke_access!(visit, reason: "appointment_#{target}", at: Time.current)
          visit.update!(status: target) unless visit.status == target
          enqueue_cleanup!(visit, reason: target)
        elsif event == :rescheduled
          old_room = visit.current_room_attempt
          revoke_access!(visit, reason: "appointment_rescheduled", at: Time.current)
          enqueue_cleanup!(visit, room: old_room, reason: "rescheduled")
          visit.update!(access_generation: visit.access_generation + 1, status: "scheduled", current_room_attempt_id: nil,
            last_ended_at: Time.current, end_reason_code: "rescheduled")
          attach_patient_identity!(visit)
          attach_clinician!(visit, appointment)
        else
          attach_patient_identity!(visit)
          attach_clinician!(visit, appointment)
        end
        visit
      end

      def bind_encounter!(appointment:, encounter:)
        visit = Visit.lock.find_by(practice_id: appointment.practice_id, appointment_id: appointment.id)
        visit&.update!(encounter_id: encounter.id)
        visit
      end

      def revoke_access!(visit, reason:, at:)
        visit.join_grants.where(revoked_at: nil).find_each do |grant|
          grant.update!(revoked_at: at, revocation_reason: reason)
        end
        visit.participants.where(revoked_at: nil).find_each do |participant|
          participant.update!(revoked_at: at, revocation_reason: reason, status: "removed")
        end
      end

      def enqueue_cleanup!(visit, reason:, room: visit.current_room_attempt)
        return unless room && !room.ended? && !room.failed?
        room.update!(status: "ending") unless room.ending? || room.unknown?
        visit.commands.find_or_create_by!(dedupe_key: "end:#{visit.access_generation}:#{room.id}:#{reason}") do |command|
          command.practice_id = visit.practice_id
          command.room_attempt = room
          command.kind = "end_room"
          command.access_generation = visit.access_generation
          command.status = "pending"
          command.available_at = Time.current
        end
      end

      def attach_patient_identity!(visit)
        identity = Clinic::PatientPortal::Identity.available.find_by(practice_id: visit.practice_id, patient_id: visit.patient_id)
        return unless identity
        participant = visit.participants.find_or_initialize_by(portal_identity_id: identity.id)
        participant.assign_attributes(status: "eligible", revoked_at: nil, revocation_reason: nil, admitted_at: nil,
          admitted_by_membership_id: nil, admitted_generation: nil, admitted_checkin_id: nil)
        participant.assign_attributes(practice_id: visit.practice_id, role: "patient") if participant.new_record?
        participant.save!
      end

      def attach_clinician!(visit, appointment)
        membership = appointment.booked_clinician&.membership
        return unless membership
        participant = visit.participants.find_or_initialize_by(membership_id: membership.id)
        participant.assign_attributes(status: "eligible", revoked_at: nil, revocation_reason: nil, admitted_at: nil,
          admitted_by_membership_id: nil, admitted_generation: nil, admitted_checkin_id: nil)
        participant.assign_attributes(practice_id: visit.practice_id, role: "clinician") if participant.new_record?
        participant.save!
      end
    end
  end
end
