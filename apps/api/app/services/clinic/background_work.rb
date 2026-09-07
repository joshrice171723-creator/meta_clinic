module Clinic
  class BackgroundWork
    DEFAULT_LIMIT = 25
    MAX_LIMIT = 100
    LOCK_NAME = "apply:clinic-background-work:v1"
    SAFE_REMINDER_PROVIDERS = [ "", "synthetic" ].freeze

    def self.run_once(limit: DEFAULT_LIMIT, at: Time.current)
      new(limit: limit).run_once(at: at)
    end

    def initialize(limit:)
      @limit = Integer(limit)
      @after_ids = { reminders: 0, staff_messages: 0 }
      raise ArgumentError, "Worker limit must be between 1 and #{MAX_LIMIT}." unless @limit.between?(1, MAX_LIMIT)
    end

    def run_once(at: Time.current)
      @at = at
      @counts = {}
      require_postgresql!
      clear_context
      ApplicationRecord.connection_pool.with_connection do |connection|
        return result(lock_acquired: false) unless acquire_lock(connection)

        begin
          process_reminders
          process_staff_messages
          result(lock_acquired: true)
        ensure
          release_lock(connection)
          clear_context
        end
      end
    end

    private

    def process_reminders
      reminder_candidate_ids.each do |outbox_id|
        with_item(:reminders) do
          outbox = Clinic::PatientReminderOutbox.includes(reminder: :practice).find(outbox_id)
          actor = initiating_actor(outbox, action: "reminders.write")
          raise WorkerGateUnavailable unless actor

          lease_recovery_only = !safe_reminder_provider?
          if lease_recovery_only && outbox.dispatch_state != "leased"
            raise WorkerGateUnavailable
          end

          outcome = Clinic::Reminders::RecoverJob.perform_now(
            practice_id: outbox.practice_id,
            actor_id: actor.id,
            at: @at,
            limit: 1,
            outbox_ids: [ outbox.id ],
            lease_recovery_only: lease_recovery_only
          )
          counts(:reminders)[:processed] += outcome.fetch(:examined)
        end
      end
    end

    def process_staff_messages
      staff_message_candidate_ids.each do |outbox_id|
        with_item(:staff_messages) do
          outbox = Clinic::StaffMessageOutbox.includes(message: [ :conversation, :practice ]).find(outbox_id)
          actor = initiating_actor(
            outbox, action: "staff_messaging.send", site: outbox.message.conversation.site_id
          )
          raise WorkerGateUnavailable unless actor

          outcome = Clinic::Messaging::RecoverJob.perform_now(
            practice_id: outbox.practice_id,
            actor_id: actor.id,
            conversation_id: outbox.message.conversation_id,
            outbox_limit: 1,
            request_limit: 1,
            outbox_event_ids: [ outbox.id ],
            process_overdue_requests: false
          )
          counts(:staff_messages)[:processed] += outcome.dig(:outbox, :considered).to_i
        end
      end
    end

    def reminder_candidate_ids
      relation = Clinic::PatientReminderOutbox.joins(:reminder)
        .where(<<~SQL.squish, at: @at)
          (clinic_patient_reminder_outbox.dispatch_state = 'leased' AND clinic_patient_reminder_outbox.lease_until <= :at)
          OR (clinic_patient_reminder_outbox.dispatch_state = 'failed' AND clinic_patient_reminder_outbox.available_at <= :at
            AND clinic_patient_reminders.status = 'failed')
          OR (clinic_patient_reminder_outbox.dispatch_state = 'pending' AND clinic_patient_reminder_outbox.available_at <= :at
            AND clinic_patient_reminders.status = 'scheduled')
        SQL
      rotating_candidate_ids(relation, :reminders, "clinic_patient_reminder_outbox")
    end

    def staff_message_candidate_ids
      relation = Clinic::StaffMessageOutbox
        .where(event_type: Clinic::Messaging::Recover::IN_APP_NOTIFICATION_EVENT)
        .where("available_at <= ?", @at)
        .where(<<~SQL.squish, %w[pending in_flight], "failed", Clinic::Messaging::Recover::MAX_ATTEMPTS)
          delivery_state IN (?) OR (delivery_state = ? AND attempts < ?)
        SQL
      rotating_candidate_ids(relation, :staff_messages, "clinic_staff_message_outbox")
    end

    def rotating_candidate_ids(relation, kind, table_name)
      ids = relation.where("#{table_name}.id > ?", @after_ids.fetch(kind))
        .order("#{table_name}.id ASC").limit(@limit).pluck(:id)
      if ids.empty? && @after_ids.fetch(kind).positive?
        ids = relation.order("#{table_name}.id ASC").limit(@limit).pluck(:id)
      end
      @after_ids[kind] = ids.last if ids.any?
      ids
    end

    def safe_reminder_provider?
      SAFE_REMINDER_PROVIDERS.include?(ENV["APPLY_REMINDERS_PROVIDER"].to_s)
    end

    def initiating_actor(subject, action:, site: nil)
      reference = Clinic::ModelVersion.for_practice(subject.practice_id)
        .where(item_type: subject.class.base_class.name, item_id: subject.id, event: "create")
        .order(:id).pick(:actor_reference)
      return unless reference.to_s.match?(/\A\d+\z/)

      actor = User.find_by(id: reference.to_i, active: true)
      membership = Clinic::Membership.active.find_by(practice_id: subject.practice_id, user: actor)
      return unless actor && membership
      return if Rails.env.production? && !Staging::DemoClinic.available_to?(actor)
      return unless Clinic::Authorization.allowed?(
        actor: actor, practice: membership.practice, action: action, site: site, any_site: site.nil?
      )

      actor
    end

    def with_item(kind)
      counts(kind)[:considered] += 1
      yield
    rescue WorkerGateUnavailable, ActiveRecord::RecordNotFound, Clinic::Authorization::Denied
      counts(kind)[:blocked] += 1
    rescue StandardError => error
      counts(kind)[:failed] += 1
      Rails.logger.error("clinic_background_work_item_failed kind=#{kind} error=#{error.class.name}")
    ensure
      clear_context
    end

    def result(lock_acquired:)
      {
        lock_acquired: lock_acquired,
        reminders: counts(:reminders),
        staff_messages: counts(:staff_messages)
      }
    end

    def counts(kind)
      @counts ||= {}
      @counts[kind] ||= { considered: 0, processed: 0, blocked: 0, failed: 0 }
    end

    def require_postgresql!
      return if ApplicationRecord.connection.adapter_name == "PostgreSQL"

      raise WorkerGateUnavailable, "Clinic background work requires PostgreSQL."
    end

    def acquire_lock(connection)
      connection.select_value(
        "SELECT pg_try_advisory_lock(hashtextextended('#{LOCK_NAME}', 0))"
      )
    end

    def release_lock(connection)
      connection.select_value(
        "SELECT pg_advisory_unlock(hashtextextended('#{LOCK_NAME}', 0))"
      )
    rescue StandardError => error
      Rails.logger.error("clinic_background_work_unlock_failed error=#{error.class.name}")
    end

    def clear_context
      Current.reset
      PaperTrail.request.whodunnit = nil
      PaperTrail.request.controller_info = {}
    end

    class WorkerGateUnavailable < StandardError; end
  end
end
