class Clinic::Reminders::RecoverJob < ApplicationJob
  queue_as :default
  self.log_arguments = false

  def perform(practice_id:, actor_id:, at: Current.business_time,
    limit: Clinic::Reminders::Recover::DEFAULT_LIMIT, outbox_ids: nil,
    lease_recovery_only: false)
    practice = Clinic::Practice.find(practice_id)
    actor = User.find_by!(id: actor_id, active: true)

    PaperTrail.request(
      whodunnit: actor.id.to_s,
      controller_info: {
        job_id: job_id,
        causal_id: "reminder-recovery:#{practice.id}"
      }
    ) do
      Clinic::Reminders::Recover.call(
        practice: practice, actor: actor, at: at, limit: limit, outbox_ids: outbox_ids,
        lease_recovery_only: lease_recovery_only
      )
    end
  rescue StandardError => error
    Rails.logger.error("patient_reminder_recovery_job_failed error=#{error.class}")
    raise
  end
end
