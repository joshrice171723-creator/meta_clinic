module Clinic
  module StaffMessagingSerializer
    module_function

    def participant_display_names(memberships, practice:)
      memberships = memberships.uniq(&:id)
      unless memberships.all? { |membership| membership.practice_id == practice.id }
        raise ArgumentError, "Staff participants must belong to the selected practice."
      end
      ActiveRecord::Associations::Preloader.new(records: memberships, associations: :clinician_profile).call
      names = memberships.to_h { |membership| [membership.id, membership.clinician_profile&.display_name.presence] }
      fallback_ids = names.filter_map { |id, name| id unless name.present? }
      return names if fallback_ids.empty?

      employments = Clinic::Workforce::Employment
        .where(practice_id: practice.id, membership_id: fallback_ids, status: "active")
        .effective_at(Current.business_time).includes(:staff_member).order(:id)
      seen = {}
      employments.each do |employment|
        next if seen[employment.membership_id]

        names[employment.membership_id] = employment.staff_member&.display_name
        seen[employment.membership_id] = true
      end
      names
    end

    def participant(membership, display_names: nil)
      if display_names
        display_name = display_names.fetch(membership.id)
      else
        display_name = membership.clinician_profile&.display_name
        unless display_name.present?
          at = Current.business_time
          employment = Clinic::Workforce::Employment
            .where(practice_id: membership.practice_id, membership_id: membership.id, status: "active")
            .where("effective_from <= ? AND (effective_until IS NULL OR effective_until > ?)", at, at)
            .includes(:staff_member).order(:id).first
          display_name = employment&.staff_member&.display_name
        end
      end

      { id: membership.id, email: membership.user.email_address,
        display_name: display_name.presence, active: membership.active? }
    end

    def conversation(conversation, actor_membership_id: nil, display_names: nil)
      active_members = if conversation.association(:members).loaded?
        conversation.members.target.select { |member| member.membership_state == "active" }
      else
        conversation.members.active.includes(membership: :user).to_a
      end
      unread = projected_boolean(conversation, "staff_unread") do
        actor_membership_id && conversation.messages.joins(:receipts).where(
          clinic_staff_message_receipts: { recipient_membership_id: actor_membership_id, read_at: nil }
        ).exists?
      end
      urgent = projected_boolean(conversation, "staff_urgent") do
        conversation.messages.where(message_class: %w[urgent safety_critical], status: "active").exists?
      end
      unresolved = projected_boolean(conversation, "staff_unresolved") do
        conversation.messages.joins(:request)
          .where.not(clinic_staff_message_requests: { state: %w[resolved declined expired] }).exists?
      end
      latest_message_class = if conversation.has_attribute?("staff_latest_message_class")
        conversation["staff_latest_message_class"]
      else
        conversation.messages.order(created_at: :desc, id: :desc).pick(:message_class)
      end
      {
        id: conversation.id, kind: conversation.kind, title: conversation.title,
        status: conversation.status, site_id: conversation.site_id,
        last_message_at: conversation.last_message_at,
        unread: !!unread, urgent: urgent, unresolved: unresolved,
        participants: active_members.map { |member| participant(member.membership, display_names: display_names) },
        last_message_class: latest_message_class
      }
    end

    def projected_boolean(record, attribute)
      return ActiveModel::Type::Boolean.new.cast(record[attribute]) if record.has_attribute?(attribute)

      yield
    end

    def message(message, include_body: true)
      request = message.request
      {
        id: message.id, sender_membership_id: message.sender_membership_id,
        sender_email: message.sender_membership.user.email_address,
        body: include_body ? message.body : nil, message_class: message.message_class,
        status: message.status, created_at: message.created_at, response_due_at: message.response_due_at,
        acknowledgement_required: message.acknowledgement_required?, acknowledged_at: message.acknowledged_at,
        acknowledged_by_membership_id: message.acknowledged_by_membership_id,
        requested_action: message.requested_action,
        linked_object: message.linked_object_type && { type: message.linked_object_type, id: message.linked_object_id },
        request: request && { id: request.id, state: request.state, assignee_membership_id: request.assignee_membership_id,
          due_at: request.due_at, resolved_at: request.resolved_at, resolution_code: request.resolution_code },
        attachments: ordered_attachments(message).map { |attachment|
          { id: attachment.id, content_type: attachment.content_type, byte_size: attachment.byte_size, scan_state: attachment.scan_state }
        }
      }
    end

    def ordered_attachments(message)
      return message.attachments.sort_by(&:id) if message.association(:attachments).loaded?

      message.attachments.order(:id).to_a
    end

    def notification(notification)
      { id: notification.id, category: notification.category, title: notification.title,
        conversation_id: notification.conversation_id, message_id: notification.message_id,
        read_at: notification.read_at, created_at: notification.created_at }
    end
  end
end
