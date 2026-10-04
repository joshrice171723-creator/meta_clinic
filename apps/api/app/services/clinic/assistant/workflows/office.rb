module Clinic
  module Assistant
    module Workflows
      # Reuses the operations handler's bounded presentation and record-choice
      # helpers; the office catalog and authorization remain explicit below.
      class Office < Operations
        READ_KEYS = {
          "office.cash_drawers" => [ "Cash drawers at this location", "Billing" ],
          "office.reminder_policy" => [ "Reminder settings", "Reminders" ],
          "office.reminders" => [ "Selected patient reminders", "Reminders" ],
          "office.membership_prospects" => [ "Membership growth pipeline", "Memberships" ],
          "office.membership_prospect" => [ "Membership prospect details", "Memberships" ],
          "office.membership_catalog" => [ "Membership catalog drafts", "Memberships" ],
          "office.membership_preview" => [ "Membership package draft preview", "Memberships" ],
          "office.membership_agreements" => [ "Selected patient memberships", "Memberships" ],
          "office.staff_directory" => [ "Staff messaging directory", "Staff messaging" ],
          "office.staff_conversations" => [ "Internal staff conversations", "Staff messaging" ],
          "office.staff_conversation" => [ "Internal staff conversation history", "Staff messaging" ],
          "office.staff_notifications" => [ "My staff notifications", "Staff messaging" ]
        }.freeze
        CHANGE_KEYS = {
          "office.cash_drawer_open" => [ "Open a cash drawer", "Billing", "Records a drawer with its explicit currency and opening float at this location." ],
          "office.cash_drawer_close" => [ "Record a counted cash drawer close", "Billing", "Saves the human-entered count and discrepancy explanation, closes the drawer and leaves reconciliation for its separate reviewer." ],
          "office.reminder_policy_save" => [ "Save reminder settings", "Reminders", "Revises the clinic's recorded reminder enablement and lead time through the existing configuration permission." ],
          "office.membership_prospect_transition" => [ "Record a membership prospect outcome", "Memberships", "Records an explicit human-supplied outreach outcome without contacting a prospect or collecting payment." ],
          "office.membership_family_draft" => [ "Draft a membership family", "Memberships", "Saves a family draft without publishing it." ],
          "office.membership_service_draft" => [ "Draft a membership service", "Memberships", "Saves a service option for membership authoring without publishing a package." ],
          "office.membership_package_price" => [ "Update a membership package draft price", "Memberships", "Updates an existing package's draft price while preserving its saved service and term choices. Publication remains separate." ],
          "office.membership_enrollment_draft" => [ "Record an enrollment for review", "Memberships", "Records a consented enrollment with included services only. No payment, account invitation or activation occurs." ],
          "office.billing_service_details" => [ "Update billing service details", "Billing", "Updates the selected fee catalog service's name, code, description and active state using its current revision." ],
          "office.staff_conversation_create" => [ "Create an internal staff conversation", "Staff messaging", "Creates a direct conversation with an eligible clinic staff member, without sending a message." ],
          "office.staff_message" => [ "Send an internal staff message", "Staff messaging", "Prepares a routine staff message. Explicit confirmation sends it to internal conversation participants and creates their in-app notifications; no external provider is called." ],
          "office.staff_request_claim" => [ "Claim a staff request", "Staff messaging", "Assigns an actionable internal request to the current staff member." ],
          "office.staff_request_schedule" => [ "Set a staff request response target", "Staff messaging", "Records a future response target on an actionable internal request." ]
        }.freeze
        PATIENT_REQUIRED = %w[office.reminders office.membership_agreements].freeze

        def self.field(key, label, type = "text", required: true, options: nil)
          { key:, label:, type:, required: }.tap { |value| value[:options] = options if options }
        end

        def self.fields(key)
          case key
          when "office.cash_drawers", "office.reminders", "office.membership_prospects", "office.membership_catalog", "office.membership_agreements",
            "office.staff_conversations", "office.staff_notifications"
            [ field("page", "Page", "number", required: false) ]
          when "office.membership_prospect", "office.membership_prospect_transition"
            values = [ field("prospect", "Prospect", "record") ]
            values << field("action", "Recorded outcome", "select", options: %w[contacted qualify decline begin_call no_answer callback_requested not_interested log_no_answer log_callback_requested log_not_interested]) if key.end_with?("transition")
            values
          when "office.membership_preview", "office.membership_package_price"
            values = [ field("package", "Membership package", "record") ]
            values << field("amount", "Exact draft price") if key.end_with?("price")
            values
          when "office.cash_drawer_open"
            [ field("currency", "Currency"), field("opening_float", "Exact opening cash float") ]
          when "office.cash_drawer_close"
            [ field("drawer", "Open cash drawer", "record"), field("counted_cash", "Exact human-counted cash"),
              field("discrepancy_explanation", "Discrepancy explanation", required: false) ]
          when "office.reminder_policy_save"
            [ field("enabled", "Enable reminders", "boolean"), field("lead_hours", "Lead hours", "number") ]
          when "office.membership_family_draft", "office.membership_service_draft"
            [ field("name", "Name"), field("description", "Description", required: false) ]
          when "office.membership_enrollment_draft"
            [ field("membership_version", "Published membership terms", "record"), field("display_name", "Synthetic enrollee name"),
              field("email_address", "Synthetic email address"), field("phone_number", "Synthetic phone number"),
              field("billing_mode", "Recorded billing mode", "select", options: %w[recurring one_time]),
              field("contact_consent", "Recorded contact consent", "boolean") ]
          when "office.billing_service_details"
            [ field("service", "Billing service", "record"), field("name", "Name"), field("code", "Code", required: false),
              field("description", "Description", required: false), field("active", "Active", "boolean") ]
          when "office.staff_conversation_create"
            [ field("participant", "Staff participant", "record") ]
          when "office.staff_conversation", "office.staff_message"
            values = [ field("conversation", "Conversation", "record") ]
            values << field("page", "Page", "number", required: false) if key == "office.staff_conversation"
            values << field("body", "Draft message") if key == "office.staff_message"
            values
          when "office.staff_request_claim", "office.staff_request_schedule"
            values = [ field("staff_request", "Internal staff request", "record") ]
            values << field("due_at", "Response target", "datetime") if key.end_with?("schedule")
            values
          else []
          end
        end

        def self.definitions
          READ_KEYS.map do |key, (title, domain)|
            { key:, title:, domain:, kind: "read", fields: fields(key),
              description: "Read current authorized source records for #{title.downcase}.", patient_required?: PATIENT_REQUIRED.include?(key) }
          end + CHANGE_KEYS.map do |key, (title, domain, description)|
            { key:, title:, domain:, description:, kind: "change", fields: fields(key), patient_required?: false }
          end
        end

        def authorize!(key:, inputs:)
          known!(key)
          case key
          when "office.cash_drawers", "office.cash_drawer_open", "office.cash_drawer_close"
            Clinic::Billing::ManageCashDrawer.authorize!(practice:, actor:)
          when "office.reminder_policy", "office.reminder_policy_save" then authorize("roles.manage")
          when "office.reminders" then authorize("reminders.read")
          when "office.membership_prospects", "office.membership_prospect", "office.membership_prospect_transition", "office.membership_enrollment_draft"
            authorize("subscriptions.review")
          when "office.membership_catalog", "office.membership_preview" then authorize("subscription_catalog.read")
          when "office.membership_family_draft", "office.membership_service_draft", "office.membership_package_price" then authorize("subscription_catalog.write")
          when "office.membership_agreements" then authorize("billing.read", legacy: "billing.write")
          when "office.billing_service_details" then authorize("billing.catalog.manage")
          when "office.staff_directory", "office.staff_conversations", "office.staff_conversation", "office.staff_notifications"
            authorize("staff_messaging.read", selected_site: true)
          when "office.staff_conversation_create"
            authorize("staff_messaging.create_conversation", selected_site: true)
            authorize("staff_messaging.read", selected_site: true)
          when "office.staff_message" then authorize("staff_messaging.send", selected_site: true)
          when "office.staff_request_claim", "office.staff_request_schedule" then authorize("staff_messaging.transition", selected_site: true)
          end
          if inputs["_conversation"]
            action = key == "office.staff_message" ? "staff_messaging.send" : "staff_messaging.read"
            Clinic::Messaging::StaffPolicy.conversation_for!(practice:, actor:, id: inputs["_conversation"].id, action:)
          end
          true
        end

        def options(key:, field:, query:, inputs:)
          authorize!(key:, inputs:)
          search = text!(query, maximum: 100, required: false).to_s.downcase
          scope, label = case field
          when "drawer"
            raise ArgumentError, "Unsupported record choice." unless key == "office.cash_drawer_close"
            [ practice.cash_drawer_sessions.where(site:, status: "open").order(:id), ->(record) { "#{record.currency || 'Unrecorded currency'} — opened #{record.created_at.to_date.iso8601}" } ]
          when "prospect"
            raise ArgumentError, "Unsupported record choice." unless %w[office.membership_prospect office.membership_prospect_transition].include?(key)
            [ Clinic::MembershipProspect.where(practice:).order(created_at: :desc, id: :desc), ->(record) { "#{record.display_name} — #{record.status}, #{record.follow_up_state}" } ]
          when "package"
            raise ArgumentError, "Unsupported record choice." unless %w[office.membership_preview office.membership_package_price].include?(key)
            [ Clinic::Care::SubscriptionPackage.where(practice:, retired: false).order(:name, :id), ->(record) { record.name } ]
          when "membership_version"
            raise ArgumentError, "Unsupported record choice." unless key == "office.membership_enrollment_draft"
            [ published_versions, ->(record) { "#{record.snapshot['package_name']} — #{record.snapshot['amount']} #{record.snapshot['currency']}" } ]
          when "service"
            raise ArgumentError, "Unsupported record choice." unless key == "office.billing_service_details"
            [ practice.billing_services.order(:name, :id), ->(record) { "#{record.name} — #{record.active? ? 'active' : 'inactive'}" } ]
          when "participant"
            raise ArgumentError, "Unsupported record choice." unless key == "office.staff_conversation_create"
            [ participants.reject { |record| record.id == membership.id }, ->(record) { Clinic::StaffMessagingSerializer.participant(record)[:display_name].presence || record.user.email_address } ]
          when "conversation"
            raise ArgumentError, "Unsupported record choice." unless %w[office.staff_conversation office.staff_message].include?(key)
            [ conversation_scope.order(last_message_at: :desc, id: :desc), ->(record) { record.title.presence || "#{record.kind.humanize} conversation, #{record.created_at.to_date.iso8601}" } ]
          when "staff_request"
            raise ArgumentError, "Unsupported record choice." unless %w[office.staff_request_claim office.staff_request_schedule].include?(key)
            [ staff_request_scope.order(:due_at, :id), ->(record) { "#{record.message.requested_action.presence || record.message.body.to_s.truncate(80)} — #{record.state}" } ]
          else raise ArgumentError, "Unsupported record choice."
          end
          records = scope.is_a?(Array) ? scope.first(100) : scope.limit(100).to_a
          records.filter_map do |record|
            name = label.call(record)
            next unless search.empty? || name.downcase.include?(search)
            { record_type: record.class.name, record_id: record.id, label: name, version: ContextRegistry.record_version(record) }
          end.first(30)
        end

        def resolve(key:, inputs:)
          known!(key)
          validate_context!
          require_patient! if PATIENT_REQUIRED.include?(key)
          values = inputs.stringify_keys.dup
          values["page"] = whole!(inputs["page"].presence || 1, min: 1, max: 10_000)
          case key
          when "office.cash_drawer_open"
            values["currency"] = currency!(inputs.fetch("currency"))
            values["opening_float"] = money!(inputs.fetch("opening_float"), name: "opening float")
          when "office.cash_drawer_close"
            values["_drawer"] = choice!(inputs.fetch("drawer"), practice.cash_drawer_sessions.where(site:, status: "open"))
            values["counted_cash"] = money!(inputs.fetch("counted_cash"), name: "counted cash")
            values["discrepancy_explanation"] = text!(inputs["discrepancy_explanation"], maximum: 1_000, required: false)
          when "office.reminder_policy_save"
            values["_policy"] = Clinic::Reminders::PolicyVersion.current(practice:)
            raise ArgumentError, "Enable reminders must be true or false." unless [ true, false ].include?(inputs["enabled"])
            values["lead_hours"] = whole!(inputs.fetch("lead_hours"), min: 1, max: 168)
          when "office.membership_prospect", "office.membership_prospect_transition"
            values["_prospect"] = choice!(inputs.fetch("prospect"), Clinic::MembershipProspect.where(practice:))
          when "office.membership_preview", "office.membership_package_price"
            values["_package"] = choice!(inputs.fetch("package"), Clinic::Care::SubscriptionPackage.where(practice:, retired: false))
            values["amount"] = money!(inputs.fetch("amount"), name: "draft price", positive: true) if key.end_with?("price")
          when "office.membership_family_draft", "office.membership_service_draft"
            values["name"] = text!(inputs.fetch("name"), maximum: 160)
            values["description"] = text!(inputs["description"], maximum: 4_000, required: false)
          when "office.membership_enrollment_draft"
            values["_membership_version"] = choice!(inputs.fetch("membership_version"), published_versions)
            %w[display_name email_address phone_number].each { |name| values[name] = text!(inputs.fetch(name), maximum: name == "email_address" ? 320 : 120) }
            raise ArgumentError, "Choose a supported billing mode." unless %w[recurring one_time].include?(inputs["billing_mode"])
            raise ArgumentError, "Record the prospective patient's consent before saving enrollment." unless inputs["contact_consent"] == true
          when "office.billing_service_details"
            values["_service"] = choice!(inputs.fetch("service"), practice.billing_services)
            values["name"] = text!(inputs.fetch("name"), maximum: 160)
            values["code"] = text!(inputs["code"], maximum: 50, required: false)
            values["description"] = text!(inputs["description"], maximum: 500, required: false)
            raise ArgumentError, "Active must be true or false." unless [ true, false ].include?(inputs["active"])
          when "office.staff_conversation_create"
            reference = inputs.fetch("participant")
            member = choice!(reference, practice.memberships.active)
            raise Clinic::Authorization::Denied unless participants.any? { |record| record.id == member.id }
            raise ArgumentError, "Choose another staff member." if member.id == membership.id
            values["_participant"] = member
          when "office.staff_conversation", "office.staff_message"
            values["_conversation"] = choice!(inputs.fetch("conversation"), conversation_scope)
            if key == "office.staff_message"
              values["body"] = text!(inputs.fetch("body"), maximum: WorkflowPresenter::MAX_TEXT)
              raise ArgumentError, "Use the staff message composer for conversations with more than 50 recipients." if message_recipients(values["_conversation"]).length > 50
            end
          when "office.staff_request_claim", "office.staff_request_schedule"
            values["_staff_request"] = choice!(inputs.fetch("staff_request"), staff_request_scope)
            values["_conversation"] = values["_staff_request"].message.conversation
            if key == "office.staff_request_schedule"
              values["due_at"] = Time.iso8601(inputs.fetch("due_at"))
              unless values["due_at"] > Current.business_time && values["due_at"] <= Current.business_time + 30.days
                raise ArgumentError, "Choose a future response target within 30 days."
              end
            end
          end
          values
        end

        def preview(key:, resolved:)
          return [] unless key == "office.staff_message"

          message_recipients(resolved.fetch("_conversation")).map do |recipient|
            details = Clinic::StaffMessagingSerializer.participant(recipient)
            { label: "Internal recipient", value: details[:display_name].presence || details[:email] }
          end
        end

        def versions(key:, resolved:)
          refs = { "site" => ContextRegistry.record_version(site) }
          refs["patient"] = ContextRegistry.record_version(patient) if PATIENT_REQUIRED.include?(key)
          resolved.each do |name, record|
            refs[name] = { "id" => record.id.to_s, "version" => ContextRegistry.record_version(record) } if record.is_a?(ApplicationRecord)
          end
          if key == "office.cash_drawer_open"
            refs["open_drawers"] = practice.cash_drawer_sessions.where(site:, status: "open").order(:id).pluck(:id).map(&:to_s)
          elsif resolved["_drawer"]
            drawer = resolved["_drawer"]
            refs["drawer_tenders"] = drawer.cash_tenders.order(:id).pluck(:id).map(&:to_s)
            refs["drawer_refunds"] = Clinic::RefundEvent.where(practice:, payment_event_id: drawer.cash_tenders.select(:payment_event_id)).order(:id).pluck(:id).map(&:to_s)
          elsif key == "office.reminder_policy_save"
            refs["policy_revision"] = resolved["_policy"]&.revision || 0
          end
          if resolved["_conversation"]
            refs["conversation_members"] = resolved["_conversation"].members.order(:id).pluck(:id, :membership_state, :updated_at)
              .map { |id, state, at| [ id.to_s, state, at.utc.iso8601(6) ] }
          end
          refs
        end

        def execute(key:, resolved:)
          authorize!(key:, inputs: resolved)
          payload = execute_office(key, resolved)
          title = (READ_KEYS[key] || CHANGE_KEYS.fetch(key)).first
          { title:, sections: present_payload(payload), source_path: office_source_path(key) }
        end

        private

        def execute_office(key, input)
          page = input.fetch("page")
          case key
          when "office.cash_drawers"
            paged(practice.cash_drawer_sessions.where(site:).order(created_at: :desc, id: :desc), page) { |record| Clinic::Billing::CashDrawer.call(record) }
          when "office.cash_drawer_open"
            record = office_change(key, input, resource: site, action: "billing.payment_record") do
              Clinic::Billing::ManageCashDrawer.open(practice:, actor:, site:, currency: input.fetch("currency"), opening_float: input.fetch("opening_float"))
            end
            { drawer: Clinic::Billing::CashDrawer.call(record) }
          when "office.cash_drawer_close"
            record = Clinic::Billing::ManageCashDrawer.close(practice:, actor:, session: input.fetch("_drawer"), counted_cash: input.fetch("counted_cash"),
              discrepancy_explanation: input["discrepancy_explanation"], request_key: request_key(input))
            { drawer: Clinic::Billing::CashDrawer.call(record.reload), reconciliation: "Pending separate reviewer reconciliation." }
          when "office.reminder_policy" then { policy: Clinic::Reminders::PolicyVersion.snapshot(Clinic::Reminders::PolicyVersion.current(practice:)) }
          when "office.reminder_policy_save"
            policy = Clinic::Reminders::RevisePolicy.call(practice:, actor:, expected_revision: input["_policy"]&.revision || 0,
              request_key: request_key(input), enabled: input.fetch("enabled"), lead_hours: input.fetch("lead_hours"))
            { policy: Clinic::Reminders::PolicyVersion.snapshot(policy) }
          when "office.reminders"
            paged(practice.patient_reminders.where(patient:).includes(:communication_endpoint, :delivery_attempts).order(scheduled_at: :desc, id: :desc), page) do |record|
              Clinic::PatientReminderSerializer.call(record, detail: true, actor:)
            end
          when "office.membership_prospects"
            paged(Clinic::MembershipProspect.where(practice:, patient_id: nil).order(created_at: :desc, id: :desc), page) { |record| Clinic::MembershipProspectSerializer.call(record) }
          when "office.membership_prospect" then { prospect: Clinic::MembershipProspectSerializer.call(input.fetch("_prospect")) }
          when "office.membership_prospect_transition"
            record = office_change(key, input, resource: input.fetch("_prospect"), action: "subscriptions.review") do
              prospect = input.fetch("_prospect")
              Clinic::MembershipGrowth::TransitionProspect.call(practice:, actor:, prospect_id: prospect.id,
                action: input.fetch("action"), lock_version: prospect.lock_version).prospect
            end
            { prospect: Clinic::MembershipProspectSerializer.call(record) }
          when "office.membership_catalog" then membership_catalog(page)
          when "office.membership_preview" then { draft_terms: Clinic::Care::SubscriptionDefinition.build(input.fetch("_package")) }
          when "office.membership_family_draft", "office.membership_service_draft"
            kind = key == "office.membership_family_draft" ? "family" : "service"
            record = office_change(key, input, resource: site, action: "subscription_catalog.write") do
              Clinic::Care::SubscriptionCatalog.save(practice:, actor:, kind:, attributes: input.slice("name", "description"))
            end
            { draft: { name: record.name, description: record.description, publication: "Not published by this action." } }
          when "office.membership_package_price"
            package = input.fetch("_package")
            record = office_change(key, input, resource: package, action: "subscription_catalog.write") do
              Clinic::Care::SubscriptionCatalog.save(practice:, actor:, kind: "package", id: package.id,
                attributes: { "lock_version" => package.lock_version, "draft" => package.draft.deep_dup.merge("amount" => input.fetch("amount")) })
            end
            { package: { name: record.name, draft_price: record.draft["amount"], currency: record.draft["currency"], publication: "Current published terms remain unchanged." } }
          when "office.membership_enrollment_draft"
            result = Clinic::MembershipGrowth::StaffEnrollment.call(practice:, actor:, version_id: input.fetch("_membership_version").id,
              selections: [], display_name: input.fetch("display_name"), email_address: input.fetch("email_address"),
              phone_number: input.fetch("phone_number"), contact_consent: input.fetch("contact_consent"),
              billing_mode: input.fetch("billing_mode"), request_key: request_key(input))
            { enrollment: Clinic::MembershipProspectSerializer.call(result.prospect), payment: "Not started by this action." }
          when "office.membership_agreements"
            records = Clinic::Care::SubscriptionAgreement.where(practice:, patient:).includes(:invoice, :events).order(id: :desc)
            { records: Clinic::Care::SubscriptionProjection.collection(records.limit(25).offset((page - 1) * 25)), page:, total: records.count }
          when "office.billing_service_details"
            service = input.fetch("_service")
            result = Clinic::Billing::ManageBillingService.update(practice:, actor:, service:, request_key: request_key(input),
              lock_version: service.lock_version, attributes: input.slice("name", "code", "description", "active").symbolize_keys)
            { service: Clinic::BillingServiceSerializer.call(result.service) }
          when "office.staff_directory" then { participants: participants.map { |record| Clinic::StaffMessagingSerializer.participant(record) } }
          when "office.staff_conversations"
            records = conversation_scope.order(last_message_at: :desc, id: :desc)
            paged(records, page) { |record| Clinic::StaffMessagingSerializer.conversation(record, actor_membership_id: membership.id) }
          when "office.staff_conversation"
            conversation = input.fetch("_conversation")
            { conversation: Clinic::StaffMessagingSerializer.conversation(conversation, actor_membership_id: membership.id),
              history: paged(conversation.messages.includes({ sender_membership: :user }, :request, :attachments).order(created_at: :desc, id: :desc), page) do |record|
                Clinic::StaffMessagingSerializer.message(record)
              end }
          when "office.staff_conversation_create"
            record = Clinic::Messaging::CreateStaffConversation.call(practice:, actor:, site_id: site.id, kind: "direct",
              member_ids: [ input.fetch("_participant").id ], request_key: request_key(input))
            { conversation: Clinic::StaffMessagingSerializer.conversation(record, actor_membership_id: membership.id) }
          when "office.staff_message"
            record = Clinic::Messaging::SendStaffMessage.call(practice:, actor:, conversation: input.fetch("_conversation"),
              request_key: request_key(input), body: input.fetch("body"), message_class: "routine")
            { message: Clinic::StaffMessagingSerializer.message(record) }
          when "office.staff_request_claim", "office.staff_request_schedule"
            request = Clinic::Messaging::ManageStaffRequest.call(practice:, actor:, request: input.fetch("_staff_request"), request_key: request_key(input),
              action: key.end_with?("claim") ? "claim" : "schedule", due_at: input["due_at"])
            { request: { state: request.state, requested_action: request.message.requested_action,
              due_at: request.due_at&.iso8601(6), assigned_to: request.assignee_membership&.user&.email_address } }
          when "office.staff_notifications"
            records = Clinic::StaffNotification.where(practice:, recipient_membership_id: membership.id).order(created_at: :desc, id: :desc)
            paged(records, page) { |record| Clinic::StaffMessagingSerializer.notification(record) }
          else raise ArgumentError, "This office workflow is unavailable."
          end
        end

        def membership_catalog(page)
          { families: paged(Clinic::Care::SubscriptionFamily.where(practice:).order(:display_order, :id), page) do |record|
              record.attributes.slice("name", "description", "retired", "display_order", "lock_version", "published_snapshot")
            end,
            services: paged(Clinic::Care::ServiceOption.where(practice:).order(:name, :id), page) { |record| record.attributes.slice("name", "description", "retired") },
            packages: paged(Clinic::Care::SubscriptionPackage.where(practice:).order(:name, :id), page) do |record|
              { name: record.name, draft: record.draft, lock_version: record.lock_version, retired: record.retired }
            end }
        end

        def published_versions
          ids = Clinic::Care::SubscriptionProjection.catalog(practice:).filter_map do |entry|
            entry[:id] if entry.fetch(:terms).fetch("components").all? { |component| component.fetch("mode") == "included" }
          end
          Clinic::Care::SubscriptionVersion.where(practice:, id: ids).order(id: :desc)
        end

        def membership = Clinic::Messaging::StaffPolicy.member_for!(practice:, actor:)
        def participants = Clinic::Messaging::ParticipantIndex.call(practice:, ability:, site:)
        def message_recipients(conversation)
          conversation.members.active.where.not(membership_id: membership.id).includes(membership: :user).order(:id).map(&:membership)
        end
        def conversation_scope
          Clinic::Messaging::ConversationIndex.call(practice:, ability:, membership:).where(site:).includes(members: { membership: :user })
        end
        def staff_request_scope
          Clinic::StaffMessageRequest.where(practice:, state: %w[open acknowledged in_progress]).joins(message: :conversation)
            .where(clinic_staff_conversations: { id: conversation_scope.select(:id) }).includes(message: :conversation)
        end

        def office_change(key, input, resource:, action:)
          payload = input.reject { |name, _| name.start_with?("_") }
          outcome = Clinic::Idempotency.execute(practice:, actor:, operation_code: "assistant.#{key}", request_key: request_key(input), payload:,
            resource:, authorization_action: action, authorization: -> { authorize!(key:, inputs: input) },
            result_resource: ->(record) { record }, resource_resolver: ->(practice:, receipt:) { office_resource(key, receipt.resource_id) }) { yield }
          outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
        end

        def office_resource(key, id)
          model = { "office.cash_drawer_open" => Clinic::CashDrawerSession,
            "office.membership_prospect_transition" => Clinic::MembershipProspect,
            "office.membership_family_draft" => Clinic::Care::SubscriptionFamily,
            "office.membership_service_draft" => Clinic::Care::ServiceOption,
            "office.membership_package_price" => Clinic::Care::SubscriptionPackage }.fetch(key)
          model.where(practice:).find_by(id:)
        end

        def known!(key)
          raise ArgumentError, "This office workflow is unavailable." unless READ_KEYS.key?(key) || CHANGE_KEYS.key?(key)
        end

        def whole!(value, min:, max:)
          number = Integer(value.to_s, 10)
          raise ArgumentError, "Enter a whole number between #{min} and #{max}." unless number.between?(min, max)
          number
        end

        def office_source_path(key)
          case key
          when /cash_drawer/, "office.billing_service_details" then "/clinic/billing"
          when /reminder/ then "/clinic/reminders"
          when /membership_(catalog|preview|family|service|package)/ then "/clinic/subscriptions"
          when /membership_agreement/ then "/clinic/memberships"
          when /membership/ then "/clinic/growth"
          else "/clinic/messages"
          end
        end
      end
    end
  end
end
