module Clinic
  module Assistant
    class WorkflowContext
      TTL = 30.minutes
      SESSION_CONTEXT_KEY = :clinic_assistant_workflow_context_public_id
      DEMO_SESSION_KEYS = ContextRegistry::DEMO_SESSION_KEYS
      OPTION_LIMIT = 50

      class Stale < StandardError; end

      def initialize(practice:, actor:, membership:, member_session:, site:, session:)
        @practice, @actor, @membership = practice, actor, membership
        @member_session, @site, @session = member_session, site, session
      end

      def create!(context_id: nil, patient_id: nil, patient_selection_id: nil,
        encounter_id: nil, encounter_selection_id: nil)
        if patient_id.present? && patient_selection_id.present?
          raise WorkflowSchema::Invalid.new("Choose a patient from the current route or the assistant list, not both.")
        end
        if encounter_id.present? && encounter_selection_id.present?
          raise WorkflowSchema::Invalid.new("Choose an encounter from the current route or the assistant list, not both.")
        end

        source = if context_id.present? || patient_selection_id.present? || encounter_selection_id.present?
          find_current!(context_id)
        end
        patient_reference = resolve_selection!(context: source, operation: "context", field: "patient",
          selection_id: patient_selection_id) if patient_selection_id.present?
        encounter_reference = resolve_selection!(context: source, operation: "context", field: "encounter",
          selection_id: encounter_selection_id) if encounter_selection_id.present?
        patient = if patient_reference
          authorized_patient_scope.find(patient_reference.fetch("record_id"))
        elsif patient_id.present?
          authorized_patient_scope.find(patient_id)
        end
        encounter = if encounter_reference
          @practice.encounters.where(patient_id: patient&.id, site_id: @site.id).find(encounter_reference.fetch("record_id"))
        elsif encounter_id.present?
          raise WorkflowSchema::Invalid.new("Select a patient before selecting an encounter.", field: :encounter_id) unless patient
          @practice.encounters.where(patient_id: patient.id, site_id: @site.id).find(encounter_id)
        end
        authorize_patient!(patient) if patient
        authorize_encounter!(encounter) if encounter

        ApplicationRecord.transaction do
          previous = current_record
          invalidate!(previous, actor: @actor) if previous
          context = WorkflowContextRecord.create!(
            practice: @practice, actor_user: @actor, membership: @membership,
            member_session_reference: @member_session.id, site: @site, patient:, encounter:,
            public_id: SecureRandom.uuid, authorization_generation: @membership.authorization_generation,
          session_snapshot: snapshot(patient:, encounter:, site: @site), selection_map: {}, expires_at: TTL.from_now
          )
          @session[SESSION_CONTEXT_KEY] = context.public_id
          context
        end
      end

      def find_current!(public_id)
        current_public_id = @session[SESSION_CONTEXT_KEY].to_s
        requested_public_id = public_id.to_s
        raise ActiveRecord::RecordNotFound if current_public_id.blank? || requested_public_id.blank? ||
          !ActiveSupport::SecurityUtils.secure_compare(current_public_id, requested_public_id)

        context = WorkflowContextRecord.find_by!(
          public_id: current_public_id, practice: @practice, actor_user: @actor,
          membership: @membership, member_session_reference: @member_session.id
        )
        validate!(context)
      end

      def refresh_after_confirmation!(context:, confirmed_proposal:)
        context.reload
        raise Stale unless context.active? && context.public_id == @session[SESSION_CONTEXT_KEY]
        patient = context.patient&.reload
        encounter = context.encounter&.reload
        context.update!(session_snapshot: snapshot(patient:, encounter:, site: context.site.reload))

        pending = context.proposals.where(status: "pending").where.not(id: confirmed_proposal.id).to_a
        pending.each do |proposal|
          Clinic::AuditRecorder.record!(practice: context.practice, actor: @actor,
            action_code: "assistant.workflow.proposal.invalidated", outcome: :failed,
            resource_version_ref: "assistant_workflow_proposal/#{proposal.public_id}")
        end
        context.proposals.where(id: pending.map(&:id)).update_all(status: "invalidated", updated_at: Time.current) if pending.any?
      end

      def validate!(context)
        context.reload
        fresh_actor = User.find_by(id: @actor&.id)
        fresh_membership = Membership.active.find_by(id: @membership&.id,
          user_id: @actor&.id, practice_id: @practice.id)
        fresh_session = MemberSession.find_by(id: @member_session&.id, user_id: @actor&.id)
        fresh_site = @practice.sites.find_by(id: @session[:clinic_site_id])
        patient = context.patient&.reload
        encounter = context.encounter&.reload
        valid = context.active? && context.public_id == @session[SESSION_CONTEXT_KEY] &&
          fresh_actor&.active? && fresh_membership && fresh_session&.unexpired? &&
          context.practice_id == @practice.id && context.actor_user_id == fresh_actor.id &&
          context.membership_id == fresh_membership.id && context.member_session_reference == fresh_session.id &&
          context.authorization_generation == fresh_membership.authorization_generation &&
          context.site_id == @site&.id && context.site_id == fresh_site&.id &&
          context.session_snapshot == snapshot(patient:, encounter:, site: fresh_site) &&
          (!patient || (patient.practice_id == @practice.id && patient.merged_into_patient_id.nil?)) &&
          (!encounter || (patient && encounter.practice_id == @practice.id &&
            encounter.patient_id == patient.id && encounter.site_id == context.site_id))
        raise Stale unless valid

        authorize_patient!(patient) if patient
        authorize_encounter!(encounter) if encounter
        context
      rescue ActiveRecord::RecordNotFound
        raise Stale
      end

      def self.issue_selections!(context:, operation:, field:, options:)
        capped = Array(options).first(OPTION_LIMIT)
        option_map = capped.each_with_object({}) do |option, result|
          value = option.stringify_keys
          record_type = value.fetch("record_type").to_s
          record_id = value.fetch("record_id")
          label = WorkflowPresenter.safe_text(value.fetch("label"), maximum: 240)
          version = value["version"]
          unless record_id.is_a?(Integer) || record_id.to_s.match?(/\A[a-zA-Z0-9_.:-]{1,100}\z/)
            raise ArgumentError, "The workflow returned an invalid selection."
          end
          token = SecureRandom.urlsafe_base64(24)
          result[token] = { "record_type" => record_type, "record_id" => record_id,
            "version" => version, "label" => label }
        end
        context.with_lock do
          context.reload
          raise Stale unless context.active?

          map = context.selection_map
          map[selection_bucket(operation, field)] = option_map
          map = map.slice(*map.keys.last(20))
          context.update!(selection_map: map)
        end
        option_map.map { |token, option| { selection_id: token, label: option.fetch("label") } }
      end

      def self.resolve_selection!(context:, operation:, field:, selection_id:)
        raise ActiveRecord::RecordNotFound unless context
        token = selection_id.to_s
        raise ActiveRecord::RecordNotFound if token.blank? || token.length > 80

        context.reload
        raise Stale unless context.active?
        bucket = selection_bucket(operation, field)
        stored = context.selection_map.fetch(bucket, {})
        matched = stored.keys.find { |key| ActiveSupport::SecurityUtils.secure_compare(key, token) }
        stored.fetch(matched || "")
      rescue KeyError
        raise ActiveRecord::RecordNotFound
      end

      def self.clear_selections!(context:, operation:, field:)
        context.with_lock do
          context.reload
          map = context.selection_map
          map.delete(selection_bucket(operation, field))
          context.update!(selection_map: map)
        end
      end

      def self.invalidate!(context, actor:)
        context.with_lock do
          context.update_columns(invalidated_at: Time.current, updated_at: Time.current) unless context.invalidated_at
          pending = context.proposals.where(status: "pending").to_a
          pending.each do |proposal|
            Clinic::AuditRecorder.record!(practice: context.practice, actor:,
              action_code: "assistant.workflow.proposal.invalidated", outcome: :failed,
              resource_version_ref: "assistant_workflow_proposal/#{proposal.public_id}")
          end
          context.proposals.where(id: pending.map(&:id)).update_all(status: "invalidated", updated_at: Time.current) if pending.any?
          Clinic::AuditRecorder.record!(practice: context.practice, actor:,
            action_code: "assistant.workflow.context.invalidated", outcome: :failed,
            resource_version_ref: "assistant_workflow_context/#{context.public_id}")
        end
      end

      def self.response(context)
        {
          context_id: context.public_id,
          expires_at: context.expires_at.iso8601(6),
          practice: { name: context.practice.name },
          site: { name: FacilitySerializer.site(context.site)[:name] || context.site.code },
          patient: (context.patient && { name: context.patient.display_name }),
          encounter: encounter_label(context.encounter, timezone: context.site.timezone_override.presence || context.practice.timezone),
          authorization_generation: context.authorization_generation
        }.compact
      end

      def self.context_options(context:, field:, query:, ability:, practice:, actor:, site:)
        search = query.to_s.strip
        raise WorkflowSchema::Invalid.new("Search must be 100 characters or fewer.", field: :query) if search.length > 100

        case field.to_s
        when "patient"
          action = if ability.allowed_permission?("patients.read", site:)
            "patients.read"
          elsif ability.allowed_permission?("patients.identity.read", site:)
            "patients.identity.read"
          else
            raise Clinic::Authorization::Denied
          end
          scope_action = action == "patients.read" ? :read : :read_identity
          Clinic::Authorization.authorize!(actor:, practice:, action:, site:)
          scope = practice.patients.where(merged_into_patient_id: nil).accessible_by(ability, scope_action)
          rows = if search.present?
            Clinic::Care::PatientIdentitySearch.search(scope:, practice_id: practice.id,
              query: search, date_of_birth: nil, phone: nil).order(:reference, :id).limit(OPTION_LIMIT)
          else
            scope.order(:reference, :id).limit(OPTION_LIMIT)
          end
          rows.map do |patient|
            Clinic::Authorization.authorize!(actor:, practice:, action:, subject: patient, site:)
            { record_type: "Clinic::Care::Patient", record_id: patient.id,
              label: [ patient.display_name, patient.reference ].compact.join(" · "),
              version: ContextRegistry.record_version(patient) }
          end
        when "encounter"
          patient = context&.patient
          raise WorkflowSchema::Invalid.new("Select a patient first.", field: :patient) unless patient
          Clinic::Authorization.authorize!(actor:, practice:, action: "encounters.read", subject: patient, site:)
          scope = practice.encounters.where(patient_id: patient.id, site_id: site.id).order(started_at: :desc, id: :desc)
          scope = scope.where(status: "open") if search == "open"
          scope.limit(OPTION_LIMIT).map do |encounter|
            Clinic::Authorization.authorize!(actor:, practice:, action: "encounters.read", subject: encounter, site:)
            { record_type: "Clinic::Encounter", record_id: encounter.id,
              label: encounter_label(encounter, timezone: site.timezone_override.presence || practice.timezone).fetch(:label),
              version: ContextRegistry.record_version(encounter) }
          end
        else
          raise WorkflowSchema::Invalid.new("Choose a supported selection field.", field: :field)
        end
      end

      def self.selection_bucket(operation, field)
        "#{operation}:#{field}"
      end

      def self.encounter_label(encounter, timezone:)
        return unless encounter

        appointment = encounter.appointment
        time = appointment&.starts_at || encounter.started_at
        zone = ActiveSupport::TimeZone[timezone]
        label = [ "Encounter", (time&.in_time_zone(zone)&.strftime("%b %-d, %Y %I:%M %p")), encounter.status.humanize ].compact.join(" · ")
        { label: label }
      end

      private

      def current_record
        public_id = @session[SESSION_CONTEXT_KEY]
        return if public_id.blank?

        WorkflowContextRecord.find_by(public_id:, practice: @practice, actor_user: @actor,
          membership: @membership, member_session_reference: @member_session.id)
      end

      def invalidate!(context, actor:)
        self.class.invalidate!(context, actor:)
      end

      def resolve_selection!(context:, operation:, field:, selection_id:)
        self.class.resolve_selection!(context:, operation:, field:, selection_id:)
      end

      def authorized_patient_scope
        ability = Ability.new(@actor, practice: @practice)
        action = if ability.allowed_permission?("patients.read", site: @site)
          :read
        elsif ability.allowed_permission?("patients.identity.read", site: @site)
          :read_identity
        else
          raise Clinic::Authorization::Denied
        end
        @practice.patients.where(merged_into_patient_id: nil).accessible_by(ability, action)
      end

      def authorize_patient!(patient)
        ability = Ability.new(@actor, practice: @practice)
        action = ability.allowed_permission?("patients.read", site: @site) ? "patients.read" : "patients.identity.read"
        Clinic::Authorization.authorize!(actor: @actor, practice: @practice, action:, subject: patient, site: @site)
      end

      def authorize_encounter!(encounter)
        Clinic::Authorization.authorize!(actor: @actor, practice: @practice,
          action: "encounters.read", subject: encounter, site: @site)
      end

      def snapshot(patient:, encounter:, site: @site)
        DEMO_SESSION_KEYS.index_with { |key| @session[key] }.transform_keys(&:to_s).merge(
          "site_record_version" => ContextRegistry.record_version(site),
          "patient_record_version" => (ContextRegistry.record_version(patient) if patient),
          "encounter_record_version" => (ContextRegistry.record_version(encounter) if encounter)
        )
      end

      def self.snapshot_from(context, session:)
        DEMO_SESSION_KEYS.index_with { |key| session[key] }.transform_keys(&:to_s).merge(
          "site_record_version" => ContextRegistry.record_version(context.site),
          "patient_record_version" => (ContextRegistry.record_version(context.patient) if context.patient),
          "encounter_record_version" => (ContextRegistry.record_version(context.encounter) if context.encounter)
        )
      end

      private_class_method :selection_bucket, :encounter_label, :snapshot_from
    end
  end
end
