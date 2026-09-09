module Clinic
  module Messaging
    class StaffController < Clinic::ApiController
      before_action -> { require_capability("staff_messaging.read", any_site: true) }, only: %i[index show participants notifications preferences]
      before_action -> { require_capability("staff_messaging.send", any_site: true) }, only: :create_message
      before_action -> { require_capability("staff_messaging.create_conversation", any_site: true) }, only: :create_conversation
      before_action -> { require_capability("staff_messaging.acknowledge", any_site: true) }, only: :acknowledge
      before_action -> { require_capability("staff_messaging.transition", any_site: true) }, only: :transition
      before_action -> { require_capability("staff_messaging.escalate", any_site: true) }, only: %i[escalate recover]
      before_action -> { require_capability("staff_messaging.attach", any_site: true) }, only: %i[presign_attachment complete_attachment download_attachment]

      def index
        member = StaffPolicy.member_for!(practice: current_practice, actor: current_user)
        conversations = ConversationIndex.call(
          practice: current_practice, ability: current_ability, membership: member, filter: params[:filter]
        )
        records, pagination = paginated_records(
          conversations, order: { last_message_at: :desc, id: :desc }
        )
        records = ConversationIndex.with_summary(
          records, practice: current_practice, membership: member
        ).includes(members: { membership: :user })
        render json: {
          conversations: records.map do |conversation|
            StaffMessagingSerializer.conversation(conversation, actor_membership_id: member.id)
          end,
          pagination: pagination
        }
      end

      def recover
        conversation = StaffPolicy.conversation_for!(practice: current_practice, actor: current_user,
          id: requested_id!(params[:id], :id), action: "staff_messaging.escalate")
        input = parameter_hash!(:recovery, %i[target_membership_id])
        render json: RecoverJob.perform_now(
          practice_id: current_practice.id, actor_id: current_user.id, conversation_id: conversation.id,
          target_membership_id: optional_id(input[:target_membership_id], :target_membership_id)
        )
      end

      def participants
        site = participant_site
        require_capability("staff_messaging.read", site: site) unless current_ability.practice_scope_for?("staff_messaging.read")
        memberships = ParticipantIndex.call(practice: current_practice, ability: current_ability, site: site)
        payload = { participants: memberships.map { |membership| StaffMessagingSerializer.participant(membership) } }
        payload[:site_id] = site.id if site
        Clinic::AuditRecorder.record!(
          practice: current_practice,
          actor: current_user,
          action_code: "staff_messaging.participants.read",
          outcome: :released,
          resource_version_ref: "staff_participants:site/#{site&.id || 'practice'}"
        )
        render json: payload
      end

      def create_conversation
        input = parameter_hash!(:conversation, %i[request_key kind title site_id], arrays: [ :member_ids ])
        conversation = CreateStaffConversation.call(
          practice: current_practice, actor: current_user,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          kind: enum_param!(input[:kind], field: :kind, allowed: StaffConversation::KINDS),
          title: optional_string(input[:title], field: :title, maximum: 120),
          site_id: optional_id(input[:site_id], :site_id),
          member_ids: Array(input[:member_ids]).map.with_index { |value, index| requested_id!(value, "member_ids[#{index}]") }
        )
        render json: { conversation: StaffMessagingSerializer.conversation(conversation, actor_membership_id: clinic_membership.id) }, status: :created
      end

      def show
        conversation = StaffPolicy.conversation_for!(practice: current_practice, actor: current_user, id: requested_id!(params[:id], :id))
        messages, pagination = paginated_records(conversation.messages.includes(:sender_membership, :request, :attachments), order: { created_at: :asc, id: :asc }, default_per_page: 50)
        render json: {
          conversation: StaffMessagingSerializer.conversation(conversation, actor_membership_id: clinic_membership.id),
          messages: messages.map { |message| StaffMessagingSerializer.message(message) }, pagination: pagination
        }
      end

      def create_message
        conversation = StaffPolicy.conversation_for!(practice: current_practice, actor: current_user, id: requested_id!(params[:id], :id), action: "staff_messaging.send")
        input = parameter_hash!(:message, %i[request_key body message_class response_due_at assignee_membership_id requested_action reply_to_message_id linked_object_type linked_object_id])
        message = SendStaffMessage.call(
          practice: current_practice, actor: current_user, conversation: conversation,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          body: required_string!(input[:body], field: :body, maximum: 10_000),
          message_class: enum_param!(input[:message_class].presence || "routine", field: :message_class, allowed: StaffMessage::CLASSES),
          response_due_at: input[:response_due_at].present? ? time_param!(input[:response_due_at], field: :response_due_at) : nil,
          assignee_membership_id: optional_id(input[:assignee_membership_id], :assignee_membership_id),
          requested_action: optional_string(input[:requested_action], field: :requested_action, maximum: 200),
          reply_to_message_id: optional_id(input[:reply_to_message_id], :reply_to_message_id),
          linked_object_type: optional_string(input[:linked_object_type], field: :linked_object_type, maximum: 40),
          linked_object_id: optional_id(input[:linked_object_id], :linked_object_id)
        )
        render json: { message: StaffMessagingSerializer.message(message) }, status: :created
      end

      def mark_read
        conversation = StaffPolicy.conversation_for!(practice: current_practice, actor: current_user, id: requested_id!(params[:id], :id))
        MarkStaffMessageRead.call(practice: current_practice, actor: current_user, conversation: conversation)
        head :no_content
      end

      def acknowledge
        message = Clinic::StaffMessage.where(practice_id: current_practice.id).includes(:conversation, :request).find(requested_id!(params[:id], :id))
        message = message if StaffPolicy.conversation_for!(practice: current_practice, actor: current_user, id: message.conversation_id).id == message.conversation_id
        input = params[:acknowledgement]
        if input.present? && !input.is_a?(ActionController::Parameters)
          raise Clinic::Api::RequestParameters::Invalid.new("acknowledgement must be an object.", field: :acknowledgement)
        end
        if input.is_a?(ActionController::Parameters)
          unknown = input.keys.map(&:to_sym) - [ :note ]
          raise Clinic::Api::RequestParameters::Invalid.new("#{unknown.first} is not a supported field.", field: unknown.first) if unknown.any?
        end
        note = input.is_a?(ActionController::Parameters) ? optional_string(input[:note], field: :note, maximum: 500) : nil
        result = AcknowledgeStaffMessage.call(practice: current_practice, actor: current_user, message: message, note: note)
        render json: { message: StaffMessagingSerializer.message(result) }
      end

      def transition
        request = Clinic::StaffMessageRequest.where(practice_id: current_practice.id).includes(message: :conversation).find(requested_id!(params[:id], :id))
        input = parameter_hash!(:transition, %i[state resolution_code resolution_note])
        result = TransitionStaffRequest.call(practice: current_practice, actor: current_user, request: request,
          state: enum_param!(input[:state], field: :state, allowed: StaffMessageRequest::STATES),
          resolution_code: optional_string(input[:resolution_code], field: :resolution_code, maximum: 80),
          resolution_note: optional_string(input[:resolution_note], field: :resolution_note, maximum: 500))
        render json: { request: { id: result.id, state: result.state, resolved_at: result.resolved_at, resolution_code: result.resolution_code } }
      end

      def escalate
        request = Clinic::StaffMessageRequest.where(practice_id: current_practice.id).includes(message: :conversation).find(requested_id!(params[:id], :id))
        input = parameter_hash!(:escalation, %i[request_key target_membership_id trigger])
        result = EscalateStaffRequest.call(practice: current_practice, actor: current_user, request: request,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          target_membership_id: optional_id(input[:target_membership_id], :target_membership_id),
          trigger: optional_string(input[:trigger], field: :trigger, maximum: 120) || "manual")
        render json: { escalation: { id: result.id, level: result.level, target_membership_id: result.target_membership_id, delivery_state: result.delivery_state } }, status: :created
      end

      def notifications
        notifications = Clinic::StaffNotification.where(practice_id: current_practice.id, recipient_membership_id: clinic_membership.id)
        notifications = notifications.where(read_at: nil) if params[:unread].to_s == "true"
        paginate(notifications, key: :notifications, serializer: ->(notification) { StaffMessagingSerializer.notification(notification) }, order: { created_at: :desc, id: :desc })
      end

      def read_notification
        notification = Clinic::StaffNotification.find_by!(practice_id: current_practice.id, id: requested_id!(params[:id], :id), recipient_membership_id: clinic_membership.id)
        notification.update!(read_at: Time.current)
        Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user, action_code: "staff_messaging.notification.read", outcome: :released)
        head :no_content
      end

      def preferences
        preference = Clinic::StaffNotificationPreference.find_or_create_by!(practice: current_practice, membership: clinic_membership)
        if request.patch?
          input = parameter_hash!(:preferences, %i[routine_enabled urgent_enabled])
          routine_enabled = input[:routine_enabled].nil? ? preference.routine_enabled : boolean_param(input[:routine_enabled], field: :routine_enabled)
          urgent_enabled = input[:urgent_enabled].nil? ? preference.urgent_enabled : boolean_param(input[:urgent_enabled], field: :urgent_enabled)
          raise ArgumentError, "Urgent notifications are required by clinic policy." unless urgent_enabled
          preference.update!(routine_enabled: routine_enabled, urgent_enabled: urgent_enabled)
          Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user, action_code: "staff_messaging.preferences.update", outcome: :committed)
        end
        render json: { routine_enabled: preference.routine_enabled, urgent_enabled: preference.urgent_enabled, urgent_policy: "required" }
      end

      def presign_attachment
        message = Clinic::StaffMessage.where(practice_id: current_practice.id).includes(:conversation).find(requested_id!(params[:message_id], :message_id))
        input = parameter_hash!(:attachment, %i[request_key filename content_type byte_size checksum])
        attachment = PresignStaffAttachment.call(practice: current_practice, actor: current_user, message: message,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          filename: required_string!(input[:filename], field: :filename, maximum: 180), content_type: required_string!(input[:content_type], field: :content_type, maximum: 80),
          byte_size: bounded_integer!(input[:byte_size], field: :byte_size, min: 1, max: PresignStaffAttachment::MAX_BYTES), checksum: required_string!(input[:checksum], field: :checksum, maximum: 255))
        render json: { attachment: { id: attachment.id, scan_state: attachment.scan_state, upload_url: nil, download_available: false } }, status: :created
      end

      def complete_attachment
        attachment = Clinic::StaffMessageAttachment.where(practice_id: current_practice.id).find(requested_id!(params[:id], :id))
        message = attachment.message
        StaffPolicy.conversation_for!(practice: current_practice, actor: current_user, id: message.conversation_id, action: "staff_messaging.attach")
        render json: { attachment: { id: attachment.id, scan_state: attachment.scan_state, download_available: attachment.scan_state == "clean" } }
      end

      def download_attachment
        attachment = Clinic::StaffMessageAttachment.where(practice_id: current_practice.id).find(requested_id!(params[:id], :id))
        StaffPolicy.conversation_for!(practice: current_practice, actor: current_user, id: attachment.message.conversation_id)
        raise ArgumentError, "The attachment is not available until its safety scan is complete." unless attachment.scan_state == "clean"
        head :not_implemented
      end

      private

      def participant_site
        site_id = params[:site_id].presence || session[:clinic_site_id]
        site_id.present? ? current_practice.sites.find(requested_id!(site_id, :site_id)) : nil
      end
    end
  end
end
