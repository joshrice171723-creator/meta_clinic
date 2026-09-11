module Clinic
  module Operations
    class RecallWorklist
      # This is an operational Task-style projection. The clinician-entered
      # EncounterFollowUp#due_at remains the only clinical due rule.
      FILTERS = %w[all due upcoming snoozed excluded completed].freeze
      CONTROL_EVENTS = %w[snoozed excluded reopened completed].freeze
      LIMIT = 200

      def self.call(practice:, actor:, status: "due", site_id: nil, patient_id: nil, at: Current.business_time)
        new(practice:, actor:, status:, site_id:, patient_id:, at:).call
      end

      def self.detail(practice:, actor:, follow_up:, at: Current.business_time)
        new(practice:, actor:, status: "all", site_id: nil, patient_id: nil, at:).detail(follow_up)
      end

      def initialize(practice:, actor:, status:, site_id:, patient_id:, at:)
        @practice = practice
        @actor = actor
        @status = status.to_s
        @site_id = site_id
        @patient_id = patient_id
        @at = at
      end

      def call
        raise ArgumentError, "The recall status is unsupported." unless FILTERS.include?(status)

        scope = projected_scope(accessible_scope)
        summary = FILTERS.drop(1).index_with { 0 }
        summary_rows = ApplicationRecord.connection.select_all(
          scope.reselect(Arel.sql("#{projected_status_sql} AS projected_status, COUNT(*) AS count"))
            .group(Arel.sql(projected_status_sql)).to_sql
        )
        summary_rows.each { |row| summary[row.fetch("projected_status")] = row.fetch("count").to_i }

        records = status == "all" ? scope : scope.where(Arel.sql("#{projected_status_sql} = #{quoted(status)}"))
        records = records.includes(:patient, :encounter, :follow_up_appointment, assigned_to_membership: :user)
          .order(Arel.sql("#{effective_due_sql} ASC NULLS FIRST, clinic_encounter_follow_ups.id ASC"))
          .limit(LIMIT + 1).to_a

        {
          summary: summary,
          recalls: records.first(LIMIT).map { |follow_up| serialize(follow_up) },
          truncated: records.length > LIMIT,
          capabilities: { write: true },
          generated_at: at.iso8601(6)
        }
      end

      def detail(follow_up)
        authorize_item!(follow_up)
        events = Clinic::RecallEvent.where(practice_id: practice.id, follow_up_id: follow_up.id)
          .includes(actor_membership: [ :clinician_profile, :user ]).order(occurred_at: :desc, id: :desc)
        {
          recall: serialize_with_event_queries(follow_up),
          history: events.map { |event| serialize_event(event) }
        }
      end

      private

      attr_reader :practice, :actor, :status, :site_id, :patient_id, :at

      def accessible_scope
        membership!
        ability = Ability.new(actor, practice: practice)
        unless ability.allowed_permission?("patients.read", any_site: true) &&
            ability.allowed_permission?("encounters.write", any_site: true)
          raise Clinic::Authorization::Denied
        end

        scope = Clinic::EncounterFollowUp.where(practice_id: practice.id, state: %w[needed arranged completed])
          .joins(:encounter)
        if patient_id
          practice.patients.find(patient_id)
          scope = scope.where(patient_id: patient_id)
        end
        if site_id
          site = practice.sites.find(site_id)
          unless ability.allowed_permission?("patients.read", site: site) &&
              ability.allowed_permission?("encounters.write", site: site)
            raise Clinic::Authorization::Denied
          end
          return scope.where(clinic_encounters: { site_id: site.id })
        end
        if ability.practice_scope_for?("patients.read") && ability.practice_scope_for?("encounters.write")
          return scope
        end

        allowed_site_ids = ability.accessible_site_ids.select do |candidate_id|
          ability.allowed_permission?("patients.read", site: candidate_id) &&
            ability.allowed_permission?("encounters.write", site: candidate_id)
        end
        scope.where(clinic_encounters: { site_id: allowed_site_ids })
      end

      def projected_scope(scope)
        scope.joins(<<~SQL.squish).select(
          "clinic_encounter_follow_ups.*",
          "recall_latest.occurred_at AS recall_latest_event_at",
          "recall_control.event_type AS recall_control_type",
          "recall_control.snoozed_until AS recall_snoozed_until",
          "recall_counts.outreach_count AS recall_outreach_count"
        )
          LEFT JOIN LATERAL (
            SELECT occurred_at
            FROM clinic_recall_events
            WHERE practice_id = clinic_encounter_follow_ups.practice_id
              AND follow_up_id = clinic_encounter_follow_ups.id
            ORDER BY id DESC LIMIT 1
          ) recall_latest ON true
          LEFT JOIN LATERAL (
            SELECT event_type, snoozed_until
            FROM clinic_recall_events
            WHERE practice_id = clinic_encounter_follow_ups.practice_id
              AND follow_up_id = clinic_encounter_follow_ups.id
              AND source_version = clinic_encounter_follow_ups.lock_version
              AND event_type IN ('snoozed','excluded','reopened','completed')
            ORDER BY id DESC LIMIT 1
          ) recall_control ON true
          LEFT JOIN LATERAL (
            SELECT COUNT(*) AS outreach_count
            FROM clinic_recall_events
            WHERE practice_id = clinic_encounter_follow_ups.practice_id
              AND follow_up_id = clinic_encounter_follow_ups.id
              AND event_type = 'outreach_recorded'
          ) recall_counts ON true
        SQL
      end

      def projected_status_sql
        <<~SQL.squish
          CASE
            WHEN clinic_encounter_follow_ups.state = 'completed' THEN 'completed'
            WHEN recall_control.event_type = 'excluded' THEN 'excluded'
            WHEN recall_control.event_type = 'snoozed' AND recall_control.snoozed_until > #{quoted(at)} THEN 'snoozed'
            WHEN #{effective_due_sql} IS NULL OR #{effective_due_sql} > #{quoted(at)} THEN 'upcoming'
            ELSE 'due'
          END
        SQL
      end

      def effective_due_sql
        <<~SQL.squish
          CASE
            WHEN recall_control.event_type = 'snoozed' THEN recall_control.snoozed_until
            ELSE clinic_encounter_follow_ups.due_at
          END
        SQL
      end

      def serialize(follow_up)
        control_type = follow_up.attributes["recall_control_type"]
        snoozed_until = timestamp(follow_up.attributes["recall_snoozed_until"])
        effective_due_at = control_type == "snoozed" ? snoozed_until : follow_up.due_at
        status = if follow_up.state == "completed"
          "completed"
        elsif control_type == "excluded"
          "excluded"
        elsif control_type == "snoozed" && snoozed_until && snoozed_until > at
          "snoozed"
        elsif effective_due_at.nil? || effective_due_at > at
          "upcoming"
        else
          "due"
        end
        {
          id: follow_up.id,
          patient: {
            id: follow_up.patient_id,
            display_name: follow_up.patient.display_name,
            reference: follow_up.patient.reference
          },
          encounter: {
            id: follow_up.encounter_id,
            site_id: follow_up.encounter.site_id,
            started_at: follow_up.encounter.started_at.iso8601(6),
            href: "/clinic/patients/#{follow_up.patient_id}/encounters/#{follow_up.encounter_id}"
          },
          source_kind: follow_up.source_kind,
          status: status,
          clinical_state: follow_up.effective_state,
          plan: follow_up.plan,
          source_due_at: follow_up.due_at&.iso8601(6),
          effective_due_at: effective_due_at&.iso8601(6),
          snoozed_until: snoozed_until&.iso8601(6),
          outreach_count: follow_up.attributes["recall_outreach_count"].to_i,
          latest_event_at: timestamp(follow_up.attributes["recall_latest_event_at"])&.iso8601(6),
          assigned_to_membership_id: follow_up.assigned_to_membership_id,
          assignee_label: follow_up.assigned_to_membership&.user&.email_address,
          version: follow_up.lock_version,
          updated_at: follow_up.updated_at.iso8601(6)
        }
      end

      def serialize_with_event_queries(follow_up)
        latest = Clinic::RecallEvent.where(practice_id: practice.id, follow_up_id: follow_up.id)
          .order(id: :desc).first
        control = Clinic::RecallEvent.where(practice_id: practice.id, follow_up_id: follow_up.id,
          source_version: follow_up.lock_version, event_type: CONTROL_EVENTS)
          .order(id: :desc).first
        row = projected_scope(Clinic::EncounterFollowUp.where(id: follow_up.id)).first
        payload = serialize(row)
        payload[:latest_event_at] = latest&.occurred_at&.iso8601(6)
        payload[:snoozed_until] = control&.snoozed_until&.iso8601(6)
        payload
      end

      def serialize_event(event)
        actor_label = event.actor_membership.clinician_profile&.display_name.presence ||
          event.actor_membership.user&.email_address || "Clinic staff"
        {
          id: event.id,
          event_type: event.event_type,
          occurred_at: event.occurred_at.iso8601(6),
          previous_clinical_state: event.previous_clinical_state,
          resulting_clinical_state: event.resulting_clinical_state,
          source_version: event.source_version,
          channel: event.channel,
          reason: event.reason,
          completion_evidence: event.completion_evidence,
          snoozed_until: event.snoozed_until&.iso8601(6),
          actor: { membership_id: event.actor_membership_id, display_name: actor_label }
        }
      end

      def authorize_item!(follow_up)
        raise Clinic::Authorization::Denied unless follow_up.practice_id == practice.id

        if follow_up.encounter.site
          Clinic::Authorization.authorize!(actor: actor, practice: practice,
            action: "patients.read", site: follow_up.encounter.site)
          Clinic::Authorization.authorize!(actor: actor, practice: practice,
            action: "encounters.write", site: follow_up.encounter.site)
        else
          ability = Ability.new(actor, practice: practice)
          unless ability.practice_scope_for?("patients.read") && ability.practice_scope_for?("encounters.write")
            raise Clinic::Authorization::Denied
          end
          Clinic::Authorization.authorize!(actor: actor, practice: practice,
            action: "patients.read", any_site: true)
          Clinic::Authorization.authorize!(actor: actor, practice: practice,
            action: "encounters.write", any_site: true)
        end
      end

      def membership!
        Clinic::Membership.active.find_by!(practice_id: practice.id, user_id: actor.id)
      end

      def quoted(value)
        ApplicationRecord.connection.quote(value)
      end

      def timestamp(value)
        return value if value.respond_to?(:iso8601)
        return if value.blank?

        Time.iso8601(value.to_s)
      end
    end
  end
end
