require "digest"

module Development
  class DemoWorkspacePreparation
    class << self
      def prepare!(run)
        case run.lesson_key
        when "navigation_tour", "sandbox" then tour!(run)
        when "messages_review" then messages!(run)
        when "workforce_review" then workforce!(run)
        when "telehealth_review" then telehealth!(run)
        when "reminders_review" then reminders!(run)
        end
      end

      def tour!(run)
        messages!(run)
        workforce!(run)
        telehealth!(run)
        reminders!(run)
      end

      private

      def membership(run)
        run.practice.memberships.find_by!(user: run.operator_user)
      end

      def messages!(run)
        email = "lesson-colleague-#{run.practice_id}@example.test"
        colleague = User.find_or_create_by!(email_address: email) do |user|
          user.password = SecureRandom.urlsafe_base64(32)
          user.active = true
        end
        participant = run.practice.memberships.find_or_create_by!(user: colleague)
        %w[staff_messaging.read staff_messaging.send staff_messaging.create_conversation].each do |action|
          role = RoleVersion.find_by!(role_code: "test-#{action.tr('.', '-')}", version: 1)
          participant.role_grants.find_or_create_by!(practice: run.practice, role_version: role, scope_kind: "practice") do |grant|
            grant.effective_from = Time.current - 1.minute
            grant.revision = 1
          end
        end
        conversation = Clinic::Messaging::CreateStaffConversation.call(practice: run.practice,
          actor: run.operator_user, request_key: "demo-conversation-#{run.id}", kind: "team",
          title: "Front desk handoff", member_ids: [participant.id])
        Clinic::Messaging::SendStaffMessage.call(practice: run.practice, actor: colleague,
          conversation:, request_key: "demo-message-#{run.id}",
          body: "The sample clinic is ready for today's appointments. Review this handoff with the team.")
      end

      def workforce!(run)
        staff = run.practice.staff_members.create!(display_name: "Jordan Example", job_title: "Clinic coordinator", active: true)
        employment = Clinic::Workforce::Employment.create!(practice: run.practice, staff_member: staff,
          membership: membership(run), status: "active", effective_from: 1.day.ago)
        employment.employment_sites.create!(practice: run.practice, site: run.practice.sites.first!,
          active: true, effective_from: 1.day.ago)
      end

      def reminders!(run)
        endpoint = run.practice.communication_endpoints.create!(patient: run.patient, endpoint_type: "portal",
          value: "portal:demo:#{run.patient.id}", value_digest: Digest::SHA256.hexdigest("demo:#{run.id}"),
          label: "Sample patient portal", verified_at: Time.current)
        reminder = Clinic::Reminders::Create.call(practice: run.practice, actor: run.operator_user,
          patient: run.patient, appointment: run.practice.appointments.order(:id).last!,
          request_key: "demo-reminder-#{run.id}", category: "appointment", channel: "portal",
          endpoint_id: endpoint.id, scheduled_at: 1.hour.from_now)
        # Review fixtures must never become a dispatchable backlog.
        reminder.update!(status: "cancelled", cancelled_at: Time.current, cancel_reason: "demo_review_only")
        reminder.outbox.update!(dispatch_state: "suppressed")
      end

      def telehealth!(run)
        member = membership(run)
        setting = Clinic::Telehealth::Setting.create!(practice: run.practice, updated_by_membership: member,
          provider_code: "daily", enabled: false, health_status: "unconfigured")
        policy = setting.policy_versions.create!(practice: run.practice, version: 1, status: "published",
          consent_title: "Sample video visit consent", consent_body: "Review the clinic's video visit information.",
          content_digest: Digest::SHA256.hexdigest("demo-video-policy"), locale: "en-US",
          patient_instructions: "This lesson reviews preparation; a video call is not started.", support_label: "Contact the sample clinic",
          join_early_minutes: 15, join_late_minutes: 30, max_room_minutes: 60,
          grant_ttl_seconds: 120, checkin_max_age_minutes: 240, scribe_enabled: false,
          created_by_membership: member, published_by_membership: member, published_at: Time.current)
        setting.update!(active_policy_version: policy)
        appointment = run.practice.appointments.order(:id).last!
        appointment.update!(visit_modality: "video", room_id: nil)
        Clinic::Telehealth::Visit.create!(practice: run.practice, patient: run.patient, appointment:,
          policy_version: policy, created_by_membership: member, status: "scheduled")
      end
    end
  end
end
