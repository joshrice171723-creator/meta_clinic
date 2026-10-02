module Development
  # Invoked only by the host backup/restore guard, never by a recurring Rails job.
  class SandboxReset
    def self.check!
      raise "Hosted demo database required" unless GuidedDemoAccess.hosted? &&
        ApplicationRecord.connection.select_value("SELECT current_database()") == "apply_guided_demo"
      run = DemoRun.active.where(lesson_key: DemoLessonCatalog::SANDBOX_KEY).order(id: :desc).first!
      raise "Ambiguous sandbox pool" unless DemoRun.active.where(lesson_key: run.lesson_key).count == 1
      raise "Sandbox must already be prepared" unless SandboxAccounts.prepared?(run) && run.visitor
      raise "Expected two sandbox clinics" unless run.practice.organization&.practices&.count == 2
      SandboxAccounts::OPTIONS.keys.to_h { |key| [ key, SandboxAccounts.resolve(run, key).user.id ] }
    end

    def self.run!
      # The host must already have retained and restored the exact backup to scratch.
      raise "Verified backup required" unless ENV["SANDBOX_RESET_BACKUP_VERIFIED"] == "1"
      ApplicationRecord.transaction do
        ApplicationRecord.connection.execute("SELECT pg_advisory_xact_lock(hashtextextended('apply:demo-sandbox-pool', 0))")
        before = check!
        users = User.order(:id).pluck(:id, :password_digest)
        previous = DemoRun.active.find_by!(lesson_key: DemoLessonCatalog::SANDBOX_KEY)
        run = SharedDemoLesson.enter!(previous.lesson_key, visitor: previous.visitor, previous_run: previous, restart: true)
        SharedDemoLesson::SANDBOX_PREPARERS.length.times do
          SharedDemoLesson.prepare_sandbox_step!(run, visitor: run.visitor)
        end
        raise "Sandbox account identity changed" unless check! == before
        raise "Sandbox reset changed credentials" unless User.order(:id).pluck(:id, :password_digest) == users
        raise "Sandbox preparation did not finish" unless SandboxAccounts.prepared?(run.reload)
        { run_id: run.id, stages: SharedDemoLesson::SANDBOX_PREPARERS.length, accounts: before.keys }
      end
    end
  end
end
