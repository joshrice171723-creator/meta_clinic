module Clinic
  module Operations
    class FollowUpWorklist
      ACTIONABLE_STATES = %w[open acknowledged in_progress].freeze
      FILTERS = %w[all mine overdue unassigned].freeze
      LIMIT = 50

      def self.call(practice:, actor:, filter: "all", site_id: nil, at: Current.business_time)
        new(practice: practice, actor: actor, filter: filter, site_id: site_id, at: at).call
      end

      def initialize(practice:, actor:, filter:, site_id:, at:)
        @practice = practice
        @actor = actor
        @filter = filter.to_s
        @site_id = site_id
        @at = at
      end

      def call
        raise ArgumentError, "The follow-up filter is unsupported." unless FILTERS.include?(filter)

        member = Clinic::Messaging::StaffPolicy.member_for!(practice: practice, actor: actor)
        ability = Ability.new(actor, practice: practice)
        can_read_messages = ability.allowed_permission?("staff_messaging.read", any_site: true)
        can_manage_encounters = ability.allowed_permission?("patients.read", any_site: true) &&
          ability.allowed_permission?("encounters.write", any_site: true)
        raise Clinic::Authorization::Denied unless can_read_messages || can_manage_encounters

        base_scope = if can_read_messages
          accessible_conversation_ids = accessible_conversations(member).select(:id)
          Clinic::StaffMessageRequest
            .where(practice_id: practice.id, state: ACTIONABLE_STATES)
            .joins(message: :conversation)
            .where(clinic_staff_messages: { practice_id: practice.id, status: "active" })
            .where(clinic_staff_conversations: { practice_id: practice.id, id: accessible_conversation_ids })
        else
          Clinic::StaffMessageRequest.none
        end

        summary = summary_for(
          base_scope,
          table: "clinic_staff_message_requests",
          assignee_column: "assignee_membership_id",
          member: member
        )

        requests = filtered(base_scope, member)
          .includes(:assignee_membership, message: { conversation: { members: { membership: :user } } })
          .order(:due_at, :id)
          .limit(LIMIT)

        encounter_scope = can_manage_encounters ? accessible_encounter_follow_ups(ability) : Clinic::EncounterFollowUp.none
        encounter_summary = summary_for(
          encounter_scope,
          table: "clinic_encounter_follow_ups",
          assignee_column: "assigned_to_membership_id",
          member: member
        )
        encounter_follow_ups = filtered_encounter_follow_ups(encounter_scope, member)
          .includes(:patient, :encounter, :follow_up_appointment, assigned_to_membership: :user)
          .order(:due_at, :id).limit(LIMIT)

        task_scope = can_manage_encounters ? accessible_clinical_tasks(ability) : Clinic::ClinicalTask.none
        clinical_task_summary = summary_for(
          task_scope,
          table: "clinic_clinical_tasks",
          assignee_column: "assigned_to_membership_id",
          member: member
        )
        clinical_tasks = filtered_clinical_tasks(task_scope, member)
          .includes(:patient, :encounter, assigned_to_membership: :user)
          .order(:due_at, :id).limit(LIMIT)

        {
          summary: summary,
          requests: requests.map { |request| serialize(request, member) },
          actor_membership_id: member.id,
          can_manage_staff_requests: ability.allowed_permission?("staff_messaging.transition", any_site: true),
          can_escalate_staff_requests: ability.allowed_permission?("staff_messaging.escalate", any_site: true),
          encounter_summary: encounter_summary,
          encounter_follow_ups: encounter_follow_ups.map { |follow_up| serialize_encounter_follow_up(follow_up, member) },
          clinical_task_summary: clinical_task_summary,
          clinical_tasks: clinical_tasks.map { |task| serialize_clinical_task(task, member) },
          reminder_attention_count: reminder_attention_count
        }
      end

      private

      attr_reader :practice, :actor, :filter, :site_id, :at

      def accessible_conversations(member)
        scope = Clinic::StaffConversation.active
          .where(practice_id: practice.id)
          .joins(:members)
          .where(clinic_staff_conversation_members: {
            membership_id: member.id,
            membership_state: "active",
            practice_id: practice.id
          })
          .distinct

        ability = Ability.new(actor, practice: practice)
        if site_id
          practice.sites.find(site_id)
          Clinic::Messaging::StaffPolicy.authorize!(
            practice: practice, actor: actor, action: "staff_messaging.read", site_id: site_id
          )
          return scope.where(site_id: site_id)
        end

        Clinic::Authorization.authorize!(
          actor: actor, practice: practice, action: "staff_messaging.read", any_site: true
        )
        return scope if ability.practice_scope_for?("staff_messaging.read")

        allowed_site_ids = ability.accessible_site_ids.select do |candidate_site_id|
          ability.allowed_permission?("staff_messaging.read", site: candidate_site_id)
        end
        scope.where(site_id: allowed_site_ids)
      end

      def filtered(scope, member)
        case filter
        when "mine" then scope.where(assignee_membership_id: member.id)
        when "overdue" then scope.where("clinic_staff_message_requests.due_at < ?", at)
        when "unassigned" then scope.where(assignee_membership_id: nil)
        else scope
        end
      end

      def summary_for(scope, table:, assignee_column:, member:)
        connection = ApplicationRecord.connection
        due_at = connection.quote(at)
        member_id = connection.quote(member.id)
        row = connection.select_one(
          scope.reselect(Arel.sql(<<~SQL.squish)).to_sql
            COUNT(*) AS open_count,
            COUNT(*) FILTER (WHERE #{table}.due_at < #{due_at}) AS overdue_count,
            COUNT(*) FILTER (WHERE #{table}.#{assignee_column} = #{member_id}) AS mine_count,
            COUNT(*) FILTER (WHERE #{table}.#{assignee_column} IS NULL) AS unassigned_count
          SQL
        )
        {
          open: row.fetch("open_count").to_i,
          overdue: row.fetch("overdue_count").to_i,
          mine: row.fetch("mine_count").to_i,
          unassigned: row.fetch("unassigned_count").to_i
        }
      end

      def accessible_encounter_follow_ups(ability)
        scope = Clinic::EncounterFollowUp.active.where(practice_id: practice.id).joins(:encounter)
        if site_id
          site = practice.sites.find(site_id)
          return scope.none unless ability.allowed_permission?("encounters.write", site: site)

          return scope.where(clinic_encounters: { site_id: site.id })
        end
        return scope if ability.practice_scope_for?("encounters.write")

        allowed_site_ids = ability.accessible_site_ids.select do |candidate_site_id|
          ability.allowed_permission?("encounters.write", site: candidate_site_id)
        end
        scope.where(clinic_encounters: { site_id: allowed_site_ids })
      end

      def filtered_encounter_follow_ups(scope, member)
        case filter
        when "mine" then scope.where(assigned_to_membership_id: member.id)
        when "overdue" then scope.where("clinic_encounter_follow_ups.due_at < ?", at)
        when "unassigned" then scope.where(assigned_to_membership_id: nil)
        else scope
        end
      end

      def accessible_clinical_tasks(ability)
        scope = Clinic::ClinicalTask.where(practice_id: practice.id, state: %w[open claimed in_progress])
        if site_id
          site = practice.sites.find(site_id)
          return scope.none unless ability.allowed_permission?("encounters.write", site: site)

          return scope.where(site_id: site.id)
        end
        return scope if ability.practice_scope_for?("encounters.write")

        allowed_site_ids = ability.accessible_site_ids.select do |candidate_site_id|
          ability.allowed_permission?("encounters.write", site: candidate_site_id)
        end
        scope.where(site_id: allowed_site_ids)
      end

      def filtered_clinical_tasks(scope, member)
        case filter
        when "mine" then scope.where(assigned_to_membership_id: member.id)
        when "overdue" then scope.where("clinic_clinical_tasks.due_at < ?", at)
        when "unassigned" then scope.where(assigned_to_membership_id: nil)
        else scope
        end
      end

      def serialize_clinical_task(task, member)
        encounter_href = if task.encounter_id
          if task.source_type == "order"
            "/clinic/patients/#{task.patient_id}/encounters/#{task.encounter_id}?focus=clinical-plan-workspace"
          else
            "/clinic/patients/#{task.patient_id}/encounters/#{task.encounter_id}#nurse-workspace"
          end
        end
        Clinic::Care::NurseWorkflow.serialize_task(task).merge(
          patient_display_name: task.patient.display_name,
          patient_reference: task.patient.reference,
          assigned_to_me: task.assigned_to_membership_id == member.id,
          assignee_label: task.assigned_to_membership&.user&.email,
          overdue: task.due_at.present? && task.due_at < at,
          encounter_href:
        )
      end

      def serialize_encounter_follow_up(follow_up, member)
        payload = Clinic::Operations::EncounterFollowUps.serialize(follow_up)
        payload.merge(
          patient_display_name: follow_up.patient.display_name,
          patient_reference: follow_up.patient.reference,
          assigned_to_me: follow_up.assigned_to_membership_id == member.id,
          assignee_label: follow_up.assigned_to_membership&.user&.email,
          overdue: payload[:due_at].present? && Time.iso8601(payload[:due_at]) < at
        )
      end

      def serialize(request, member)
        conversation = request.message.conversation
        assignee = active_conversation_assignee(conversation, request.assignee_membership_id)
        payload = {
          id: request.id,
          conversation_id: conversation.id,
          subject: conversation.title.presence || "Staff follow-up",
          requested_action: request.message.requested_action,
          state: request.state,
          due_at: request.due_at&.iso8601(6),
          assigned_to_me: request.assignee_membership_id == member.id,
          overdue: request.due_at < at,
          assignee_membership_id: request.assignee_membership_id,
          eligible_assignees: eligible_assignees(conversation)
        }
        payload[:assignee_label] = Clinic::StaffMessagingSerializer.participant(assignee).fetch(:email) if assignee
        payload
      end

      def eligible_assignees(conversation)
        conversation.members.filter_map do |conversation_member|
          membership = conversation_member.membership
          next unless conversation_member.membership_state == "active" && membership&.active? && membership.user&.active?

          {
            membership_id: membership.id,
            label: membership.user.email
          }
        end.sort_by { |candidate| [candidate.fetch(:label), candidate.fetch(:membership_id)] }
      end

      def active_conversation_assignee(conversation, assignee_membership_id)
        return unless assignee_membership_id

        member = conversation.members.find do |candidate|
          candidate.membership_state == "active" && candidate.membership_id == assignee_membership_id
        end
        membership = member&.membership
        membership if membership&.active? && membership.user&.active?
      end

      def reminder_attention_count
        return nil if site_id

        ability = Ability.new(actor, practice: practice)
        return nil unless ability.allowed_permission?("reminders.read")

        Clinic::Reminders::ExceptionQueue.call(scope: practice.patient_reminders).count
      end
    end
  end
end
