module Clinic
  module Operations
    class FollowUpWorklist
      ACTIONABLE_STATES = %w[open acknowledged in_progress].freeze
      FILTERS = %w[all mine overdue unassigned offboarded].freeze
      LIMIT = 50

      def self.call(practice:, actor:, filter: "all", site_id: nil, page: 1,
        staff_requests_page: 1, encounter_follow_ups_page: 1, renewal_exceptions_page: 1, at: Current.business_time)
        new(practice: practice, actor: actor, filter: filter, site_id: site_id, page: page,
          staff_requests_page: staff_requests_page, encounter_follow_ups_page: encounter_follow_ups_page,
          renewal_exceptions_page: renewal_exceptions_page, at: at).call
      end

      def initialize(practice:, actor:, filter:, site_id:, page:, staff_requests_page:, encounter_follow_ups_page:, renewal_exceptions_page:, at:)
        @practice = practice
        @actor = actor
        @filter = filter.to_s
        @site_id = site_id
        @page = page
        @staff_requests_page = staff_requests_page
        @encounter_follow_ups_page = encounter_follow_ups_page
        @renewal_exceptions_page = renewal_exceptions_page
        @at = at
      end

      def call
        raise ArgumentError, "The follow-up filter is unsupported." unless FILTERS.include?(filter)

        member = Clinic::Messaging::StaffPolicy.member_for!(practice: practice, actor: actor)
        ability = Ability.new(actor, practice: practice)
        can_read_messages = ability.allowed_permission?("staff_messaging.read", any_site: true)
        can_manage_encounters = ability.allowed_permission?("patients.read", any_site: true) &&
          ability.allowed_permission?("encounters.write", any_site: true)
        can_read_renewals = ability.practice_scope_for?("billing.read") || ability.practice_scope_for?("billing.write")
        raise Clinic::Authorization::Denied unless can_read_messages || can_manage_encounters || can_read_renewals

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

        requests, requests_pagination = paged(filtered(base_scope, member)
          .includes(:assignee_membership, message: { conversation: { members: { membership: :user } } })
          .order(:due_at, :id), @staff_requests_page)

        encounter_scope = can_manage_encounters ? accessible_encounter_follow_ups(ability) : Clinic::EncounterFollowUp.none
        encounter_summary = summary_for(
          encounter_scope,
          table: "clinic_encounter_follow_ups",
          assignee_column: "assigned_to_membership_id",
          member: member
        )
        encounter_follow_ups, encounter_pagination = paged(filtered_encounter_follow_ups(encounter_scope, member)
          .includes(:patient, :encounter, :follow_up_appointment, assigned_to_membership: :user)
          .order(:due_at, :id), @encounter_follow_ups_page)

        task_scope = can_manage_encounters ? accessible_clinical_tasks(ability) : Clinic::ClinicalTask.none
        clinical_task_summary = summary_for(
          task_scope,
          table: "clinic_clinical_tasks",
          assignee_column: "assigned_to_membership_id",
          member: member
        )
        filtered_tasks = filtered_clinical_tasks(task_scope, member)
        offboarded_total = filter == "offboarded" ? filtered_tasks.count : 0
        offboarded_page_count = (offboarded_total.to_f / LIMIT).ceil
        offboarded_page = [ @page, [ offboarded_page_count, 1 ].max ].min
        clinical_tasks = filtered_tasks
          .includes(:patient, :encounter, assigned_to_membership: :user)
          .order(:due_at, :id).limit(LIMIT).offset(filter == "offboarded" ? (offboarded_page - 1) * LIMIT : 0)
        recorded_appointment_keys = recorded_appointment_keys_for(clinical_tasks)

        renewal_scope = can_read_renewals && !site_id && filter.in?(%w[all unassigned]) ? renewal_exceptions_scope : Clinic::Billing::StripeCheckout.none
        renewal_rows, renewal_pagination = paged(renewal_scope, @renewal_exceptions_page)
        renewals = serialize_renewal_exceptions(renewal_rows)

        {
          summary: summary,
          requests: requests.map { |request| serialize(request, member) },
          staff_requests_page: requests_pagination,
          actor_membership_id: member.id,
          can_manage_staff_requests: ability.allowed_permission?("staff_messaging.transition", any_site: true),
          can_escalate_staff_requests: ability.allowed_permission?("staff_messaging.escalate", any_site: true),
          encounter_summary: encounter_summary,
          encounter_follow_ups: encounter_follow_ups.map { |follow_up| serialize_encounter_follow_up(follow_up, member) },
          encounter_follow_ups_page: encounter_pagination,
          clinical_task_summary: clinical_task_summary,
          offboarded_tasks_page: { page: offboarded_page, per_page: LIMIT, total: offboarded_total, total_pages: offboarded_page_count },
          clinical_tasks: clinical_tasks.map do |task|
            serialize_clinical_task(task, member,
              has_recorded_appointment: has_recorded_appointment?(task, recorded_appointment_keys))
          end,
          reminder_attention_count: reminder_attention_count,
          renewal_exceptions: renewals, renewal_exceptions_page: renewal_pagination,
          renewal_exceptions_truncated: renewal_pagination[:total] > renewals.length
        }
      end

      private

      attr_reader :practice, :actor, :filter, :site_id, :page, :at

      def paged(scope, requested_page)
        unless requested_page.is_a?(Integer) && requested_page.between?(1, 1_000_000)
          raise ArgumentError, "The follow-up page must be a positive bounded integer."
        end
        total = scope.except(:includes, :order).count
        total_pages = (total.to_f / LIMIT).ceil
        selected_page = [ requested_page, [ total_pages, 1 ].max ].min
        [ scope.limit(LIMIT).offset((selected_page - 1) * LIMIT),
          { page: selected_page, per_page: LIMIT, total: total, total_pages: total_pages } ]
      end

      def renewal_exceptions_scope
        Clinic::Billing::StripeCheckout.where(practice:)
          .where("subscription_status IN (?) OR renewal_invoice_status = ? OR (renewal_invoice_status = ? AND renewal_amount_due > 0)",
            %w[past_due unpaid incomplete_expired], "uncollectible", "open")
          .includes(agreement: :patient).order(:updated_at, :id)
      end

      def serialize_renewal_exceptions(rows)
        return [] if rows.empty?

        coverage = practice.memberships.active.includes(:user).any? do |membership|
          next false unless membership.user.active?
          permission = Ability.new(membership.user, practice:)
          permission.practice_scope_for?("billing.payment_record") || permission.practice_scope_for?("billing.write")
        end
        rows.map do |checkout|
          agreement = checkout.agreement
          {
            id: checkout.id, agreement_id: agreement.id, patient_id: agreement.patient_id,
            patient_display_name: agreement.patient.display_name, patient_reference: agreement.patient.reference,
            status: checkout.subscription_status, invoice_status: checkout.renewal_invoice_status,
            amount_due: checkout.renewal_amount_due&.to_s("F"), currency: agreement.currency,
            updated_at: checkout.updated_at.iso8601(6), owner: "Billing team",
            assignment_exception: coverage ? nil : "No eligible billing coverage is configured.",
            next_action: "Reconcile the current renewal invoice before collecting again. Clinical follow-up remains available.",
            href: "/clinic/billing?tab=subscriptions"
          }
        end
      end

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
        when "offboarded" then scope.none
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
        when "offboarded" then scope.none
        else scope
        end
      end

      def accessible_clinical_tasks(ability)
        scope = Clinic::ClinicalTask.where(practice_id: practice.id, state: Clinic::ClinicalTask::ACTIVE_STATES)
        if site_id
          site = practice.sites.find(site_id)
          return scope.none unless ability.allowed_permission?("encounters.write", site: site)

          # Membership onboarding tasks are created before a first visit exists,
          # so they are intentionally location-neutral. Keep those tasks visible
          # in the selected location's front-desk Patient Flow.
          return scope.where(site_id: site.id).or(
            scope.where(site_id: nil, task_kind: "patient_call", pool_code: "front_desk", source_type: "manual")
          )
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
        when "offboarded" then scope.joins("INNER JOIN clinic_memberships task_owner ON task_owner.id = clinic_clinical_tasks.assigned_to_membership_id AND task_owner.practice_id = clinic_clinical_tasks.practice_id")
          .joins("INNER JOIN users task_owner_user ON task_owner_user.id = task_owner.user_id")
          .where("task_owner.active = FALSE OR task_owner_user.active = FALSE")
        else scope
        end
      end

      def recorded_appointment_keys_for(tasks)
        patient_ids = tasks.filter_map do |task|
          task.patient_id if initial_contact_task?(task)
        end.uniq
        return {} if patient_ids.empty?

        practice.appointments.where(patient_id: patient_ids)
          .where.not(status: %w[cancelled no_show])
          .pluck(:patient_id, :site_id)
          .each_with_object({}) do |(patient_id, site_id), keys|
            (keys[patient_id] ||= {})[site_id] = true
          end
      end

      def initial_contact_task?(task)
        task.task_kind == "patient_call" && task.source_type == "manual" &&
          task.pool_code == "front_desk" && task.encounter_id.nil?
      end

      def has_recorded_appointment?(task, appointment_keys)
        return false unless initial_contact_task?(task)

        sites = appointment_keys[task.patient_id]
        return false unless sites
        task.site_id.nil? || sites.key?(task.site_id)
      end

      def serialize_clinical_task(task, member, has_recorded_appointment: false)
        encounter_href = if task.encounter_id
          if task.source_type == "order"
            order_task_href(task)
          else
            "/clinic/patients/#{task.patient_id}/encounters/#{task.encounter_id}#nurse-workspace"
          end
        end
        lab_action = if task.source_type == "lab_follow_up"
          Clinic::Care::LabReportAction.where(practice_id: task.practice_id, clinical_task_id: task.id,
            kind: "recollection_requested").includes(:lab_report_version).first
        end
        contact_attempt = if task.source_type == "lab_follow_up" && !lab_action
          Clinic::Care::LabResultFollowUpContactAttempt.where(practice_id: task.practice_id,
            clinical_task_id: task.id).includes(follow_up: :lab_report_version).first
        end
        if lab_action
          version = lab_action.lab_report_version
          encounter_href = "/clinic/patients/#{task.patient_id}?lab_report_id=#{version.lab_report_id}&lab_version_id=#{version.id}"
        elsif contact_attempt
          version = contact_attempt.follow_up.lab_report_version
          encounter_href = "/clinic/patients/#{task.patient_id}?lab_report_id=#{version.lab_report_id}&lab_version_id=#{version.id}"
        end
        source_note = if Ability.new(actor, practice:).allowed_permission?("notes.read", site: task.site)
          contact_attempt&.note || lab_action&.note
        end
        Clinic::Care::NurseWorkflow.serialize_task(task).merge(
          patient_display_name: task.patient.display_name,
          patient_reference: task.patient.reference,
          assigned_to_me: task.assigned_to_membership_id == member.id,
          assignee_label: task.assigned_to_membership&.user&.email_address,
          overdue: task.due_at.present? && task.due_at < at,
          eligible_assignees: eligible_assignees_for_task(task),
          source_label: lab_action ? "Laboratory recollection" : (contact_attempt ? "Lab result contact follow-up" : nil),
          source_note: source_note,
          encounter_href:,
          patient_href: "/clinic/patients/#{task.patient_id}",
          has_recorded_appointment:
        )
      end

      def order_task_href(task)
        base = "/clinic/patients/#{task.patient_id}/encounters/#{task.encounter_id}"
        source = case task.source_kind
        when "medication_request"
          Clinic::Care::MedicationRequestRevision
        when "service_request"
          Clinic::Care::ServiceRequestRevision
        end&.find_by(practice_id: task.practice_id, patient_id: task.patient_id, id: task.source_id)
        return "#{base}?focus=clinical-plan-workspace" unless source

        query = Rack::Utils.build_query(
          focus: "clinical-plan-workspace",
          order_kind: task.source_kind,
          order_series_id: source.series_id,
          task_id: task.id
        )
        "#{base}?#{query}"
      end

      def eligible_assignees_for_task(task)
        practice.memberships.active.includes(:user).filter_map do |membership|
          next unless Clinic::Care::TaskContinuity.eligible?(membership, task)
          { membership_id: membership.id, label: membership.user.email_address }
        end.sort_by { |candidate| [candidate.fetch(:label), candidate.fetch(:membership_id)] }
      end

      def eligible_assignees_for_encounter(encounter)
        Clinic::Operations::EncounterFollowUps.eligible_assignees(encounter)
      end

      def serialize_encounter_follow_up(follow_up, member)
        payload = Clinic::Operations::EncounterFollowUps.serialize(follow_up)
        payload.merge(
          patient_display_name: follow_up.patient.display_name,
          patient_reference: follow_up.patient.reference,
          assigned_to_me: follow_up.assigned_to_membership_id == member.id,
          assignee_label: follow_up.assigned_to_membership&.user&.email_address,
          overdue: payload[:due_at].present? && Time.iso8601(payload[:due_at]) < at,
          eligible_assignees: eligible_assignees_for_encounter(follow_up.encounter)
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
          eligible_assignees: eligible_assignees(conversation),
          updated_at: request.updated_at.iso8601(6)
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
            label: membership.user.email_address
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
