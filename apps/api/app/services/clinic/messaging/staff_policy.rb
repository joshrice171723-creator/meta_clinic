module Clinic
  module Messaging
    module StaffPolicy
      module_function

      def member_for!(practice:, actor:)
        membership = practice.memberships.active.find_by(user_id: actor.id)
        raise Clinic::Authorization::Denied unless membership

        membership
      end

      def authorize!(practice:, actor:, action:, site_id: nil)
        membership = member_for!(practice: practice, actor: actor)
        Clinic::Authorization.authorize!(actor: actor, practice: practice, action: action, site: site_id)
        membership
      end

      def conversation_for!(practice:, actor:, id:, action: "staff_messaging.read")
        conversation = Clinic::StaffConversation.find_by!(practice_id: practice.id, id: id)
        membership = authorize!(practice: practice, actor: actor, action: action, site_id: conversation.site_id)
        return conversation if conversation.members.active.exists?(membership_id: membership.id)

        raise ActiveRecord::RecordNotFound
      end

      def member_in_conversation!(conversation:, membership_id:)
        member = conversation.members.active.find_by(membership_id: membership_id)
        raise ActiveRecord::RecordNotFound unless member

        member
      end

      def linked_object!(practice:, actor:, type:, id:)
        return nil if type.blank? && id.blank?
        raise Clinic::Api::RequestParameters::Invalid.new("linked_object_type and linked_object_id must be provided together.", field: :linked_object) if type.blank? || id.blank?

        object = case type.to_s
        when "appointment" then practice.appointments.find(id)
        when "encounter" then practice.encounters.find(id)
        when "patient_reminder" then practice.patient_reminders.find(id)
        else raise ArgumentError, "The linked operational object type is unsupported."
        end
        permission = case type.to_s
        when "appointment" then "appointments.read"
        when "encounter" then "encounters.write"
        when "patient_reminder" then "reminders.read"
        end
        Clinic::Authorization.authorize!(actor: actor, practice: practice, action: permission, subject: object)
        object
      end
    end
  end
end
