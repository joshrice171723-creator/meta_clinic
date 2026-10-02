# Rails runner, not transactional fixture tests: independent connections must
# observe committed rows. Invoked only by workforce_pg_acceptance.py on its DB.
require "timeout"
require "action_dispatch/testing/integration"
require_relative "../support/authorization_helpers"

config = ApplicationRecord.connection_db_config
expected_database = ENV.fetch("APPLY_WORKFORCE_VERIFY_DATABASE", "")
raise "Generated Workforce scratch database required" unless Rails.env.test? &&
  expected_database.match?(/\Aapply_workforce_verify_[a-f0-9]{12}\z/) && config.database == expected_database &&
  config.adapter == "postgresql" && %w[127.0.0.1 localhost ::1].include?(config.configuration_hash[:host])

class WorkforcePostgresAcceptance
  class Failed < StandardError; end

  HEADERS = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }.freeze

  def check(condition, message)
    raise Failed, message unless condition
  end

  def session(user, app: Rails.application)
    client = ActionDispatch::Integration::Session.new(app)
    client.host! "localhost:3000"
    client.get "/api/csrf", headers: HEADERS
    check(client.response.status == 200, "CSRF fixture request failed")
    csrf = HEADERS.merge("X-CSRF-Token" => client.response.parsed_body.fetch("csrf_token"))
    client.post "/api/session", params: { email_address: user.email_address, password: @password }, headers: csrf, as: :json
    check(client.response.status == 200, "Synthetic actor login failed")
    client.get "/api/csrf", headers: HEADERS
    [ client, HEADERS.merge("X-CSRF-Token" => client.response.parsed_body.fetch("csrf_token")) ]
  end

  def reviewed(client, employment)
    client.get "/api/clinic/workforce/employments", headers: HEADERS
    check(client.response.status == 200, "Workforce review request failed")
    row = client.response.parsed_body.fetch("employments").find { |item| item.fetch("id") == employment.id }
    check(row && row.fetch("access_revision").match?(/\A[a-f0-9]{64}\z/), "Review revision missing")
    row.fetch("access_revision")
  end

  def patch(client, headers, employment, revision, role, **changes)
    client.patch "/api/clinic/workforce/employments/#{employment.id}",
      params: { employment: { role_version_id: role.id, expected_access_revision: revision }.merge(changes) },
      headers: headers, as: :json
    [ client.response.status, client.response.parsed_body ]
  end

  def snapshot(employment)
    membership = employment.reload.membership
    [ membership.authorization_generation, membership.active, membership.user.active,
      employment.status, employment.effective_from, employment.effective_until,
      membership.role_grants.order(:id).pluck(:id, :revision, :role_version_id, :scope_kind, :site_id, :revoked_at),
      employment.employment_sites.order(:id).pluck(:id, :site_id, :active, :effective_from, :effective_until),
      Clinic::RoleGrantEvent.where(grant_id: membership.role_grants.select(:id)).count ]
  end

  def employee(label, role)
    user = User.create!(email_address: "#{label}-#{SecureRandom.hex(6)}@example.invalid", password: @password, active: true)
    membership = @practice.memberships.create!(user: user)
    staff = @practice.staff_members.create!(display_name: "Synthetic #{label}", job_title: "Synthetic coordinator", active: true)
    Clinic::Workforce::LinkEmployment.call(practice: @practice, staff_member: staff,
      membership: membership, site_ids: [ @main.id ], effective_from: 1.hour.ago, actor: @actors.first, role_version: role)
  end

  def run
    @password = SecureRandom.hex(24)
    @practice = Clinic::Practice.create!(name: "Synthetic Workforce PostgreSQL acceptance", timezone: "UTC")
    @main = @practice.sites.create!(code: "MAIN", name: "Synthetic main site", status: "active")
    @north = @practice.sites.create!(code: "NORTH", name: "Synthetic north site", status: "active")
    @actors = 2.times.map do |index|
      user = User.create!(email_address: "workforce-pg-admin-#{index}-#{SecureRandom.hex(6)}@example.invalid", password: @password, active: true)
      membership = @practice.memberships.create!(user: user)
      Object.new.extend(AuthorizationHelpers).grant_permissions!(membership, "workforce.admin", "roles.manage")
      user
    end
    # Empty-permission synthetic role versions exercise delegation/replacement
    # without introducing access to another domain or altering existing roles.
    code = "workforce-pg-#{SecureRandom.hex(6)}"
    roles = (1..3).map { |version| RoleVersion.create!(role_code: code, version: version) }
    clients = @actors.map { |actor| session(actor) }
    competing_changes(clients, roles)
    stale_scope(clients.first, roles)
    unknown_response(clients.first, roles)
  end

  def competing_changes(clients, roles)
    employment = employee("competing", roles.first)
    revisions = clients.map { |client, _headers| reviewed(client, employment) }
    check(revisions.uniq.one?, "Both reviewers must see the same revision")
    before = snapshot(employment)
    client, headers = clients.first
    client.patch "/api/clinic/workforce/employments/#{employment.id}",
      params: { employment: { role_version_id: roles.last.id } }, headers: headers, as: :json
    check(client.response.status == 400 && client.response.parsed_body.fetch("field") == "expected_access_revision",
      "Ordinary role update must require a reviewed revision")
    check(snapshot(employment) == before, "Missing revision changed access")
    ready = Queue.new
    start = Queue.new
    workers = []
    begin
      ApplicationRecord.transaction do
        employment.lock!
        clients.each_with_index do |(client, headers), index|
          workers << Thread.new do
            Thread.current.report_on_exception = false
            ApplicationRecord.connection_pool.with_connection do |connection|
              ready << connection.select_value("SELECT pg_backend_pid()").to_i
              Timeout.timeout(4) { start.pop }
              patch(client, headers, employment, revisions[index], roles[index + 1])
            end
          ensure
            Current.reset
          end
        end
        pids = Timeout.timeout(3, Failed, "Competing PostgreSQL connections did not reach the barrier") { 2.times.map { ready.pop } }
        check(pids.uniq.length == 2, "Competing requests must use distinct PostgreSQL connections")
        2.times { start << true }
        # Deterministic overlap: both actual PATCH requests must reach and wait
        # on SELECT ... FOR UPDATE before this transaction releases its lock.
        Timeout.timeout(3, Failed, "Both PATCHes did not wait on the held employment row lock") do
          loop do
            # PostgreSQL caches activity snapshots within a transaction. Refresh
            # this observer's snapshot only; do not reset server statistics.
            ApplicationRecord.connection.execute("SELECT pg_stat_clear_snapshot()")
            waiting = ApplicationRecord.connection.select_value(<<~SQL).to_i
              SELECT count(*) FROM pg_stat_activity
              WHERE pid IN (#{pids.join(",")}) AND datname = current_database()
                AND wait_event_type = 'Lock'
                AND query LIKE '%clinic_workforce_employments%' AND query LIKE '%FOR UPDATE%'
            SQL
            break if waiting == 2
            sleep 0.01
          end
        end
      end
      results = Timeout.timeout(8, Failed, "Competing PATCHes did not complete after lock release") { workers.map(&:value) }
      check(results.map(&:first).sort == [ 200, 409 ], "Same-revision competing PATCH requests must yield exactly 200 and 409")
      rejected = results.find { |status, _body| status == 409 }
      check(rejected.last.fetch("code") == "stale_record", "Competing loser must be stale_record, not an authority/validation failure")
      winner = results.index { |status, _body| status == 200 }
      grants = employment.reload.membership.role_grants.active.where(source_employment_id: employment.id)
      check(grants.pluck(:role_version_id, :scope_kind, :site_id) == [ [ roles[winner + 1].id, "practice", nil ] ], "Winning role/scope was overwritten or broadened")
      after = snapshot(employment)
      check(after[6].length == before[6].length + 1 && after[8] == before[8] + 1, "Competing loser created an extra grant/event")
      check(after[0] == before[0] + 2 && after[7] == before[7], "One replacement must advance generation exactly twice and preserve site assignments")
      puts "PASS: two authenticated same-revision PATCHes wait on a real PostgreSQL row lock; one commits, one returns stale_record; one replacement only"
    ensure
      # Release Ruby barriers even on failure; database rollback releases the
      # held lock. The outer runner bounds the process, never another process.
      2.times { start << true }
      workers.each { |worker| worker.join(6) }
    end
  end

  def stale_scope(pair, roles)
    client, headers = pair
    location = RoleVersion.create!(role_code: "workforce-location-manager",
      version: (RoleVersion.where(role_code: "workforce-location-manager").maximum(:version) || 0) + 1)
    employment = employee("site-scoped", location)
    revision = reviewed(client, employment)
    before = snapshot(employment)
    # This synthetic competing writer uses the real service and transaction.
    Clinic::Workforce::LinkEmployment.update!(employment: employment, actor: @actors.last,
      site_ids: [ @main.id, @north.id ], role_version: location, expected_access_revision: revision)
    changed = snapshot(employment)
    check(changed != before, "Scope fixture did not change")
    status, body = patch(client, headers, employment, revision, roles.last,
      site_ids: [ @main.id, @north.id ], status: "inactive")
    check(status == 409 && body.fetch("code") == "stale_record", "Stale request must reject before site/status/role mutation")
    check(snapshot(employment) == changed, "Stale request altered grants, events, generation, status or sites")
    fresh = reviewed(client, employment)
    status, body = patch(client, headers, employment, fresh, roles.last)
    check(status == 409 && body.fetch("code") == "stale_record", "Even a fresh role-only request must not widen site access to practice access")
    check(snapshot(employment) == changed, "Role-only request silently widened scope")
    puts "PASS: stale scope/status/site edit makes no changes; fresh role-only edit cannot broaden site grants into practice access"
  end

  def unknown_response(pair, roles)
    client, headers = pair
    saved = employee("saved-before-408", roles.first)
    unknown = employee("commit-response-408", roles.first)
    pending = employee("not-attempted", roles.first)
    revisions = [ saved, unknown, pending ].map { |record| reviewed(client, record) }
    pending_before = snapshot(pending)
    status, = patch(client, headers, saved, revisions[0], roles[1])
    check(status == 200, "First per-account update failed")
    saved_after = snapshot(saved)
    lost = false
    fault_app = lambda do |env|
      result = Rails.application.call(env)
      if !lost && env["REQUEST_METHOD"] == "PATCH" && env["PATH_INFO"] == "/api/clinic/workforce/employments/#{unknown.id}" && result[0] == 200
        lost = true
        result[2].close if result[2].respond_to?(:close)
        [ 408, { "content-type" => "application/json" }, [ JSON.generate(error: "Synthetic committed response lost") ] ]
      else
        result
      end
    end
    fault_client, fault_headers = session(@actors.last, app: fault_app)
    status, = patch(fault_client, fault_headers, unknown, revisions[1], roles[1])
    check(status == 408 && lost, "Fault must replace a real committed success response with 408")
    committed = snapshot(unknown)
    check(unknown.membership.role_grants.active.pluck(:role_version_id) == [ roles[1].id ], "408 fixture did not actually commit")
    check(snapshot(saved) == saved_after && snapshot(pending) == pending_before, "Per-account partial outcome changed saved/pending accounts")
    fresh = reviewed(client, unknown)
    check(fresh != revisions[1] && snapshot(unknown) == committed, "Read-only reconciliation must observe commit without reposting grants")
    # Adversarial old-payload replay, only on generated synthetic records. The
    # browser must never issue this replay; its separate tests prove that rule.
    [ [ saved, revisions[0], saved_after ], [ unknown, revisions[1], committed ] ].each do |record, revision, expected|
      status, body = patch(client, headers, record, revision, roles[1])
      check(status == 409 && body.fetch("code") == "stale_record", "A lost/successful old payload must not create another grant")
      check(snapshot(record) == expected, "Old-payload replay duplicated grants/events or changed generation")
    end
    check(snapshot(pending) == pending_before, "Pending account was silently attempted")
    puts "PASS: real per-account success then commit-with-408; GET does not mutate; old reviewed payloads cannot repost either committed account; pending remains unchanged"
  end
end

begin
  WorkforcePostgresAcceptance.new.run
rescue WorkforcePostgresAcceptance::Failed => error
  warn "FAIL: #{error.message}"
  exit 1
rescue StandardError => error
  # No raw database diagnostics, request bodies, cookies or passwords.
  warn "FAIL: unexpected #{error.class.name} during Workforce PostgreSQL acceptance"
  exit 1
end
