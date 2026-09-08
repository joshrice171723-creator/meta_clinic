module Clinic
  module Telehealth
    module AccessPolicy
      ACTION_PERMISSIONS = {
        read: "telehealth.read", preparation_read: "telehealth.prepare.read",
        verify_preparation: "telehealth.prepare.verify", prepare_room: "telehealth.host",
        admit: "telehealth.host", remove: "telehealth.host", end: "telehealth.host",
        extend: "telehealth.host", resume: "telehealth.host", participate: "telehealth.participate",
        reconcile: "telehealth.reconcile", configure: "telehealth.configure"
      }.freeze
      module_function

      def authorize!(actor_context:, visit:, action:)
        actor = actor_context.fetch(:actor)
        practice = actor_context.fetch(:practice)
        raise Error.new("The visit is unavailable.", code: "visit_not_found", status: :not_found) unless visit.practice_id == practice.id

        permission = ACTION_PERMISSIONS.fetch(action)
        membership = Clinic::Authorization.authorize!(actor:, practice:, action: permission, site: visit.appointment.site)
        if action == :participate
          participant = visit.participants.active_record.find_by(membership_id: membership.id)
          raise Clinic::Authorization::Denied unless participant && !participant.removed?
        end
        membership
      end

      def allowed_actions(actor_context:, visit:, participant: nil)
        actions = []
        ability = Ability.new(actor_context.fetch(:actor), practice: visit.practice)
        action_names = {
          read: "telehealth.view_preparation", preparation_read: "telehealth.view_preparation",
          verify_preparation: "telehealth.verify_preparation", prepare_room: "telehealth.prepare_room",
          admit: "telehealth.admit", remove: "telehealth.remove", end: "telehealth.end",
          extend: "telehealth.extend", resume: "telehealth.resume", participate: "telehealth.join",
          reconcile: "telehealth.reconcile", configure: "telehealth.configure"
        }
        ACTION_PERMISSIONS.each do |action, permission|
          allowed = ability.allowed_permission?(permission, site: visit.appointment.site)
          actions << action_names.fetch(action) if allowed
        end
        if actions.include?("telehealth.prepare_room")
          actions << "telehealth.add_participant"
          actions << "telehealth.start_encounter" if ability.allowed_permission?("encounters.write",
            site: visit.appointment.site)
        end
        actions.delete("telehealth.join") unless participant&.admitted? && !visit.ending? && !visit.ended?
        actions << "telehealth.leave" if participant && !participant.removed? &&
          ability.allowed_permission?("telehealth.participate", site: visit.appointment.site)
        actions.uniq
      end
    end
  end
end
