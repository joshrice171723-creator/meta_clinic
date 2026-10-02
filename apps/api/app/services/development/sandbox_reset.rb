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
      assert_untimed_authority!(run.practice.organization.practice_ids)
      SandboxAccounts::OPTIONS.keys.to_h { |key| [ key, SandboxAccounts.resolve(run, key).user.id ] }
    end

    def self.run!
      # The host must already have retained and restored the exact backup to scratch.
      raise "Verified backup required" unless ENV["SANDBOX_RESET_BACKUP_VERIFIED"] == "1"
      with_pool_lock do
        before = check!
        practice_ids = DemoRun.active.find_by!(lesson_key: DemoLessonCatalog::SANDBOX_KEY).practice.organization.practice_ids
        authorization = authorization_snapshot(practice_ids)
        users = User.order(:id).pluck(:id, :password_digest)
        previous = DemoRun.active.find_by!(lesson_key: DemoLessonCatalog::SANDBOX_KEY)
        run = SharedDemoLesson.enter!(previous.lesson_key, visitor: previous.visitor, previous_run: previous, restart: true)
        SharedDemoLesson::SANDBOX_PREPARERS.length.times do
          SharedDemoLesson.prepare_sandbox_step!(run, visitor: run.visitor)
        end
        raise "Sandbox account identity changed" unless check! == before
        raise "Sandbox reset changed credentials" unless User.order(:id).pluck(:id, :password_digest) == users
        raise "Sandbox reset changed effective authority" unless authorization_snapshot(practice_ids) == authorization
        raise "Sandbox preparation did not finish" unless SandboxAccounts.prepared?(run.reload)
        { run_id: run.id, stages: SharedDemoLesson::SANDBOX_PREPARERS.length, accounts: before.keys }
      end
    end

    def self.with_pool_lock
      ApplicationRecord.transaction do
        # Backup handshake is bounded to 600s; keep this one transaction alive
        # beyond that bound without weakening the application's normal timeout.
        ApplicationRecord.connection.execute("SET LOCAL idle_in_transaction_session_timeout = '660s'")
        ApplicationRecord.connection.execute("SELECT pg_advisory_xact_lock(hashtextextended('apply:demo-sandbox-pool', 0))")
        check!
        yield
      end
    end

    def self.assert_untimed_authority!(practice_ids)
      # Existing seed recipes recreate grants without temporal constraints. Never
      # extend an expiry or activate a scheduled grant by rebuilding that pool.
      constrained = Clinic::RoleGrant.where(practice_id: practice_ids, revoked_at: nil)
        .where("effective_until IS NOT NULL OR effective_from > ?", Time.current)
      raise "Sandbox reset cannot preserve timed role grants" if constrained.exists?
    end
    private_class_method :assert_untimed_authority!

    def self.authorization_snapshot(practice_ids)
      Clinic::Membership.where(practice_id: practice_ids).includes(:user, role_grants: [ :site, { role_version: :permissions } ])
        .map do |membership|
          grants = membership.role_grants.active.map do |grant|
            [ grant.scope_kind, grant.site&.code.to_s, grant.role_version.role_code,
              grant.role_version.version, grant.role_version.permissions.map(&:action_code).sort,
              grant.effective_until&.iso8601(6) ]
          end.sort
          [ membership.practice_id, membership.user_id, membership.active?, membership.user.active?, grants ]
        end.sort
    end
    private_class_method :authorization_snapshot
  end
end
