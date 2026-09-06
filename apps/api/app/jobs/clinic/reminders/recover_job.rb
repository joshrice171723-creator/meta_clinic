class Clinic::Reminders::RecoverJob < ApplicationJob
  queue_as :default

  def perform(practice_id:, actor_id:, at: Time.current, limit: Clinic::Reminders::Recover::DEFAULT_LIMIT)
    practice = Clinic::Practice.find(practice_id)
    actor = User.find(actor_id)

    PaperTrail.request(
      whodunnit: actor.id.to_s,
      controller_info: {
        job_id: job_id,
        causal_id: "reminder-recovery:#{practice.id}"
      }
    ) do
      Clinic::Reminders::Recover.call(practice: practice, actor: actor, at: at, limit: limit)
    end
  rescue StandardError => error
    Rails.logger.error(
      "patient_reminder_recovery_job_failed practice_id=#{practice_id} actor_id=#{actor_id} error=#{error.class}"
    )
    raise
  end
end
