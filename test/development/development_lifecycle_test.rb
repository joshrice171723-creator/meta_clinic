# frozen_string_literal: true

require "fileutils"
require "minitest/autorun"
require "open3"
require "stringio"
require "tmpdir"
require_relative "../../bin/lib/development_lifecycle"

class DevelopmentLifecycleTest < Minitest::Test
  def setup
    @temporary_directory = Dir.mktmpdir("apply-dev-lifecycle-")
    @output = StringIO.new
    @error = StringIO.new
  end

  def teardown
    FileUtils.remove_entry(@temporary_directory)
  end

  def test_help_exposes_one_public_lifecycle_contract
    lifecycle = build_lifecycle

    assert_equal 0, lifecycle.run(["help"])
    assert_includes @output.string, "Usage: bin/dev"
    assert_includes @output.string, "start                 Migrate"
    assert_includes @output.string, "reset-data --yes"
    assert_includes @output.string, "prewarm"
    assert_includes @output.string, "refresh never creates merge commits"
  end

  def test_reset_data_requires_explicit_confirmation_before_external_work
    lifecycle = build_lifecycle

    assert_equal 1, lifecycle.run(["reset-data"])
    assert_includes @error.string, "bin/dev reset-data --yes"
    refute_includes @output.string, "Start PostgreSQL"
  end

  def test_local_boundary_rejects_database_url
    lifecycle = build_lifecycle("DATABASE_URL" => "postgres://example.invalid/not-used")

    assert_equal 1, lifecycle.run(["start", "--no-browser"])
    assert_includes @error.string, "DATABASE_URL must be unset"
    refute_includes @output.string, "Start PostgreSQL"
  end

  def test_local_boundary_rejects_shared_application_port
    lifecycle = build_lifecycle("APPLY_WEB_PORT" => "3100", "APPLY_API_PORT" => "3100")

    assert_equal 1, lifecycle.run(["start", "--no-browser"])
    assert_includes @error.string, "must be different"
    refute_includes @output.string, "Start PostgreSQL"
  end

  def test_runtime_check_rejects_a_node_major_that_does_not_match_the_pin
    write_runtime_contract(node: "999")
    lifecycle = build_lifecycle

    node_check = lifecycle.send(:runtime_checks).find { |check| check.name == "Node" }

    refute node_check.ok
    assert_includes node_check.detail, "expected major 999"
  end

  def test_prewarm_installs_dependencies_without_starting_database_or_services
    lifecycle = build_lifecycle
    events = []
    lifecycle.define_singleton_method(:validate_local_boundary!) { events << "boundary" }
    lifecycle.define_singleton_method(:require_runtime_versions!) { events << "runtime" }
    lifecycle.define_singleton_method(:install_api_dependencies!) { events << "api" }
    lifecycle.define_singleton_method(:install_web_dependencies!) { events << "web" }
    lifecycle.define_singleton_method(:ensure_postgres!) { |_auto_start_docker| raise "database should not start" }
    lifecycle.define_singleton_method(:spawn_missing_services!) { raise "services should not start" }

    assert_equal 0, lifecycle.run(["prewarm"])
    assert_equal %w[boundary runtime api web], events
    assert_includes @output.string, "shared Bundler and pnpm caches"
  end

  def test_pnpm_command_uses_the_windows_command_shim
    command = build_lifecycle.send(:pnpm_command)

    assert_equal(Gem.win_platform? ? "pnpm.cmd" : "pnpm", command)
  end

  def test_http_readiness_timeouts_can_be_extended_for_deliberate_browser_proof
    lifecycle = build_lifecycle(
      "APPLY_API_READINESS_TIMEOUT" => "120",
      "APPLY_WEB_READINESS_TIMEOUT" => "150"
    )
    observed = []
    lifecycle.define_singleton_method(:wait_until) do |timeout, &_probe|
      observed << timeout
      true
    end

    lifecycle.send(:require_http_readiness!)

    assert_equal [120, 150], observed
  end

  def test_restart_validates_prerequisites_before_stopping_services
    lifecycle = build_lifecycle
    stopped = false
    lifecycle.define_singleton_method(:require_runtime_versions!) do
      raise Apply::DevelopmentLifecycle::Failure, "synthetic runtime failure"
    end
    lifecycle.define_singleton_method(:stop_services) { |stop_database:| stopped = stop_database || true }

    assert_equal 1, lifecycle.run(["restart", "--no-browser"])
    refute stopped
    assert_includes @error.string, "synthetic runtime failure"
  end

  def test_failed_start_cleans_only_roles_started_by_that_attempt
    lifecycle = build_lifecycle
    trace = Apply::TaskTrace.start(name: "Start cleanup", output_root: File.join(@temporary_directory, "traces"))
    lifecycle.instance_variable_set(:@trace, trace)
    cleaned = nil
    lifecycle.define_singleton_method(:validate_local_boundary!) {}
    lifecycle.define_singleton_method(:require_runtime_versions!) {}
    lifecycle.define_singleton_method(:require_dependencies!) {}
    lifecycle.define_singleton_method(:ensure_postgres!) { |auto_start_docker:| auto_start_docker }
    lifecycle.define_singleton_method(:migrate_database!) {}
    lifecycle.define_singleton_method(:require_ports_available_or_owned!) {}
    lifecycle.define_singleton_method(:spawn_missing_services!) do |started_roles, roles:|
      started_roles << "api" if roles.include?("api")
    end
    lifecycle.define_singleton_method(:require_database_ready!) do
      raise Apply::DevelopmentLifecycle::Failure, "synthetic readiness failure"
    end
    lifecycle.define_singleton_method(:cleanup_started_roles) { |roles| cleaned = roles.dup }

    assert_raises(Apply::DevelopmentLifecycle::Failure) do
      lifecycle.send(:start_services, {no_browser: true, no_docker_start: true})
    end
    assert_equal ["api"], cleaned
  end

  def test_start_defers_worker_until_database_and_http_are_ready
    lifecycle = build_lifecycle
    trace = Apply::TaskTrace.start(name: "Ordered startup", output_root: File.join(@temporary_directory, "traces"))
    lifecycle.instance_variable_set(:@trace, trace)
    events = []
    lifecycle.define_singleton_method(:validate_local_boundary!) {}
    lifecycle.define_singleton_method(:running_stack_ready?) { false }
    lifecycle.define_singleton_method(:require_runtime_versions!) {}
    lifecycle.define_singleton_method(:require_dependencies!) {}
    lifecycle.define_singleton_method(:ensure_postgres!) { |auto_start_docker:| auto_start_docker }
    lifecycle.define_singleton_method(:migrate_database!) {}
    lifecycle.define_singleton_method(:require_ports_available_or_owned!) {}
    lifecycle.define_singleton_method(:spawn_missing_services!) do |_started_roles, roles:|
      events << "start:#{roles.join(',')}"
    end
    lifecycle.define_singleton_method(:require_database_ready!) { events << "database" }
    lifecycle.define_singleton_method(:require_http_readiness!) { events << "http" }
    lifecycle.define_singleton_method(:process_check) do |role, _port|
      Apply::DevelopmentLifecycle::Check.new(name: role, ok: true, detail: "ok")
    end

    lifecycle.send(:start_services, {no_browser: true, no_docker_start: true})

    assert_equal ["start:api,web", "database", "http", "start:worker"], events
  end

  def test_start_returns_immediately_when_the_managed_stack_is_already_ready
    lifecycle = build_lifecycle
    trace = Apply::TaskTrace.start(name: "Ready stack", output_root: File.join(@temporary_directory, "traces"))
    lifecycle.instance_variable_set(:@trace, trace)
    announced = false
    lifecycle.define_singleton_method(:validate_local_boundary!) {}
    lifecycle.define_singleton_method(:running_stack_ready?) { true }
    lifecycle.define_singleton_method(:require_runtime_versions!) { raise "runtime checks should be skipped" }
    lifecycle.define_singleton_method(:require_dependencies!) { raise "dependency checks should be skipped" }
    lifecycle.define_singleton_method(:ensure_postgres!) { |auto_start_docker:| raise "database startup should be skipped" }
    lifecycle.define_singleton_method(:migrate_database!) { raise "migrations should be skipped" }
    lifecycle.define_singleton_method(:announce_ready) { |_options| announced = true }

    lifecycle.send(:start_services, {no_browser: true, no_docker_start: true})

    assert announced
  end

  def test_database_schema_check_uses_source_versions_and_direct_postgres
    migration_root = File.join(@temporary_directory, "apps/api/db/migrate")
    FileUtils.mkdir_p(migration_root)
    File.write(File.join(migration_root, "20260910000100_first.rb"), "")
    File.write(File.join(migration_root, "20260910000200_second.rb"), "")
    lifecycle = build_lifecycle
    captured_arguments = nil
    captured_options = nil
    lifecycle.define_singleton_method(:capture) do |*arguments, **options|
      captured_arguments = arguments
      captured_options = options
      ["migration:20260910000100\nmigration:20260910000200\nprobe:1\n", true]
    end

    assert lifecycle.send(:database_schema_current?)
    assert_includes captured_arguments, "psql"
    assert_equal File.join(@temporary_directory, "apps/api"), captured_options.fetch(:chdir)
  end

  def test_database_schema_check_rejects_a_pending_source_migration
    migration_root = File.join(@temporary_directory, "apps/api/db/migrate")
    FileUtils.mkdir_p(migration_root)
    File.write(File.join(migration_root, "20260910000100_first.rb"), "")
    File.write(File.join(migration_root, "20260910000200_second.rb"), "")
    lifecycle = build_lifecycle
    lifecycle.define_singleton_method(:capture) do |*_arguments, **_options|
      ["migration:20260910000100\nprobe:1\n", true]
    end

    refute lifecycle.send(:database_schema_current?)
  end

  def test_migration_fast_path_does_not_boot_rails_when_schema_is_current
    lifecycle = build_lifecycle
    lifecycle.define_singleton_method(:database_schema_current?) { true }
    lifecycle.define_singleton_method(:system!) { |*_arguments| raise "Rails should not boot" }

    lifecycle.send(:migrate_database!)

    assert_includes @output.string, "Development database schema is current."
  end

  def test_pid_records_bind_processes_to_role_and_checkout
    lifecycle = build_lifecycle

    lifecycle.send(:write_pid_record, "api", Process.pid)
    record = lifecycle.send(:read_pid_record, "api")

    assert_equal Process.pid, record.fetch("pid")
    assert_equal "api", record.fetch("role")
    assert_equal @temporary_directory, record.fetch("root")
  end

  def test_pid_records_reject_non_process_identifiers
    path = File.join(@temporary_directory, "tmp/dev/pids/api.pid")
    FileUtils.mkdir_p(File.dirname(path))
    File.write(path, "-1\n")

    assert_nil build_lifecycle.send(:read_pid_record, "api")
  end

  def test_process_check_rejects_an_unrecorded_listener
    lifecycle = build_lifecycle
    lifecycle.define_singleton_method(:port_in_use?) { |_port| true }

    check = lifecycle.send(:process_check, "api", 3001)

    refute check.ok
    assert_includes check.detail, "no checkout PID record"
  end

  def test_web_dependencies_require_the_current_lockfile_digest
    FileUtils.mkdir_p(File.join(@temporary_directory, "apps/web/node_modules/.bin"))
    File.write(File.join(@temporary_directory, "apps/web/node_modules/.bin/vite"), "")
    File.write(File.join(@temporary_directory, "apps/web/pnpm-lock.yaml"), "synthetic lock\n")
    File.write(File.join(@temporary_directory, "apps/web/package.json"), "{}")
    File.write(File.join(@temporary_directory, "apps/web/pnpm-workspace.yaml"), "ignoreScripts: true\n")
    lifecycle = build_lifecycle

    refute lifecycle.send(:web_lock_digest_matches?)

    digest = lifecycle.send(:web_dependency_digest)
    File.write(File.join(@temporary_directory, "apps/web/node_modules/.apply-lock-digest"), "#{digest}\n")
    assert lifecycle.send(:web_lock_digest_matches?)
    File.write(File.join(@temporary_directory, "apps/web/package.json"), '{"changed":true}')
    refute lifecycle.send(:web_lock_digest_matches?)
  end

  def test_web_install_writes_the_lock_digest_after_dependency_validation
    web_root = File.join(@temporary_directory, "apps/web")
    FileUtils.mkdir_p(web_root)
    File.write(File.join(web_root, "pnpm-lock.yaml"), "synthetic lock\n")
    File.write(File.join(web_root, "package.json"), "{}")
    File.write(File.join(web_root, "pnpm-workspace.yaml"), "ignoreScripts: true\n")
    lifecycle = build_lifecycle
    pnpm_command = lifecycle.send(:pnpm_command)
    pnpm_checks = 0

    lifecycle.define_singleton_method(:system!) do |*arguments, **options|
      raise "unexpected install command" unless arguments == [pnpm_command, "install", "--frozen-lockfile", "--ignore-scripts", "--prefer-offline"]
      raise "unexpected install directory" unless options.fetch(:chdir) == web_root

      FileUtils.mkdir_p(File.join(web_root, "node_modules/.bin"))
      File.write(File.join(web_root, "node_modules/.bin/vite"), "")
      File.write(File.join(web_root, "node_modules/.modules.yaml"), "")
    end
    lifecycle.define_singleton_method(:capture) do |*arguments, **options|
      raise "unexpected validation command" unless arguments == ["node", "scripts/check-dependencies.mjs"]
      raise "unexpected validation directory" unless options.fetch(:chdir) == web_root

      pnpm_checks += 1
      ["", true]
    end

    lifecycle.send(:install_web_dependencies!)

    assert_equal 1, pnpm_checks
    assert lifecycle.send(:web_lock_digest_matches?)
  end

  def test_local_twilio_environment_loads_only_allowlisted_values
    File.write(File.join(@temporary_directory, ".env.twilio.local"), <<~ENVIRONMENT)
      # Local-only provider configuration
      APP_TELEHEALTH_ENABLED=true
      APP_TELEHEALTH_TWILIO_API_KEY_SECRET=synthetic-secret-with-equals==
      TWILIO_TEST_AUTH_TOKEN=synthetic-test-token
      PATH=must-not-replace-the-launcher-path
    ENVIRONMENT

    environment = build_lifecycle.send(:local_twilio_environment)

    assert_equal "true", environment.fetch("APP_TELEHEALTH_ENABLED")
    assert_equal "synthetic-secret-with-equals==", environment.fetch("APP_TELEHEALTH_TWILIO_API_KEY_SECRET")
    assert_equal "synthetic-test-token", environment.fetch("TWILIO_TEST_AUTH_TOKEN")
    refute environment.key?("PATH")

    assert_equal "synthetic-test-token", build_lifecycle.send(:role_environment, "api").fetch("TWILIO_TEST_AUTH_TOKEN")
    refute build_lifecycle.send(:role_environment, "web").key?("TWILIO_TEST_AUTH_TOKEN")
  end

  def test_local_twilio_environment_rejects_a_null_byte_in_an_allowlisted_value
    File.binwrite(File.join(@temporary_directory, ".env.twilio.local"), "APP_TELEHEALTH_TWILIO_AUTH_TOKEN=invalid\0value\n")

    error = assert_raises(Apply::DevelopmentLifecycle::Failure) do
      build_lifecycle.send(:local_twilio_environment)
    end

    assert_includes error.message, ".env.twilio.local has an invalid value"
  end

  def test_stop_scope_rejects_a_pid_record_from_another_checkout
    lifecycle = build_lifecycle
    lifecycle.send(:write_pid_record, "api", Process.pid)
    record_path = File.join(@temporary_directory, "tmp/dev/pids/api.pid")
    record = JSON.parse(File.read(record_path))
    record["root"] = File.join(@temporary_directory, "other-checkout")
    File.write(record_path, "#{JSON.generate(record)}\n")
    lifecycle.define_singleton_method(:port_in_use?) { |_port| false }
    lifecycle.define_singleton_method(:process_alive?) { |_pid| true }

    error = assert_raises(Apply::DevelopmentLifecycle::Failure) do
      lifecycle.send(:require_stoppable_scope!)
    end

    assert_includes error.message, "another checkout"
  end

  def test_process_liveness_uses_the_operating_system_process_table
    lifecycle = build_lifecycle
    lifecycle.instance_variable_set(:@windows_process_parent_map, {})

    assert lifecycle.send(:process_alive?, Process.pid)
    refute lifecycle.send(:process_alive?, 2_147_483_647)
  end

  def test_exited_unreaped_process_is_not_alive_and_its_owned_record_is_cleaned
    with_unreaped_process do |pid|
      lifecycle = build_lifecycle
      lifecycle.send(:write_pid_record, "worker", pid)
      refute lifecycle.send(:process_alive?, pid)
      lifecycle.send(:stop_role, "worker")
      refute File.exist?(File.join(@temporary_directory, "tmp/dev/pids/worker.pid"))
    end
  end

  def test_failed_or_malformed_process_state_inspection_remains_alive
    lifecycle = build_lifecycle
    [["Z", false], ["", true], ["invalid", true], ["Z foreign", true], ["Z\nS", true], ["ZA", true], ["ps unavailable", false]].each do |output, success|
      lifecycle.define_singleton_method(:capture_process_state) { |_pid| [output, success] }
      assert lifecycle.send(:process_alive?, Process.pid), [output, success].inspect
    end
  end

  def test_failed_process_state_inspection_still_refuses_a_live_foreign_directory
    skip "POSIX working-directory inspection required" if Gem.win_platform?

    lifecycle = build_lifecycle
    lifecycle.define_singleton_method(:capture_process_state) { |_pid| ["ps unavailable", false] }
    lifecycle.send(:write_pid_record, "worker", Process.pid)
    lifecycle.define_singleton_method(:port_in_use?) { |_port| false }

    error = assert_raises(Apply::DevelopmentLifecycle::Failure) do
      lifecycle.send(:require_stoppable_scope!)
    end
    assert_includes error.message, "not rooted in this checkout"
    assert File.exist?(File.join(@temporary_directory, "tmp/dev/pids/worker.pid"))
    assert lifecycle.send(:process_alive?, Process.pid)
  end

  def test_hung_process_state_probe_is_bounded_reaped_and_conservatively_alive
    skip "POSIX process inspection required" if Gem.win_platform?

    probe_directory = File.join(@temporary_directory, "probe-bin")
    probe_pid_path = File.join(@temporary_directory, "probe.pid")
    FileUtils.mkdir_p(probe_directory)
    probe = File.join(probe_directory, "ps")
    File.write(probe, <<~RUBY)
      #!#{RbConfig.ruby}
      File.write(#{probe_pid_path.inspect}, Process.pid.to_s)
      STDOUT.sync = true
      STDOUT.write("Z")
      sleep 5
    RUBY
    File.chmod(0o755, probe)
    previous_path = ENV.fetch("PATH", "")
    ENV["PATH"] = [probe_directory, previous_path].join(File::PATH_SEPARATOR)
    lifecycle = build_lifecycle
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    alive = lifecycle.send(:process_alive?, Process.pid)
    elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - started

    assert_operator elapsed, :<, 3
    assert alive
    probe_pid = Integer(File.read(probe_pid_path), 10)
    assert_raises(Errno::ESRCH) { Process.kill(0, probe_pid) }
    assert_equal 1, Process.kill(0, Process.pid)
  ensure
    ENV["PATH"] = previous_path if previous_path
  end

  def test_live_listener_is_refused_even_when_its_recorded_parent_is_a_zombie
    listener = TCPServer.new("127.0.0.1", 0)
    with_unreaped_process do |pid|
      lifecycle = build_lifecycle
      lifecycle.instance_variable_get(:@ports)[:api] = listener.addr[1]
      lifecycle.send(:write_pid_record, "api", pid)

      error = assert_raises(Apply::DevelopmentLifecycle::Failure) do
        lifecycle.send(:require_stoppable_scope!)
      end
      assert_includes error.message, "refusing to stop api"
      assert File.exist?(File.join(@temporary_directory, "tmp/dev/pids/api.pid"))
      socket = TCPSocket.new("127.0.0.1", listener.addr[1])
      socket.close
    end
  ensure
    listener&.close
  end

  def test_direct_and_startup_cleanup_preserve_record_for_a_live_listener_with_a_dead_parent
    listener = TCPServer.new("127.0.0.1", 0)
    with_unreaped_process do |pid|
      lifecycle = build_lifecycle
      lifecycle.instance_variable_get(:@ports)[:api] = listener.addr[1]
      lifecycle.send(:write_pid_record, "api", pid)
      path = File.join(@temporary_directory, "tmp/dev/pids/api.pid")
      original = File.read(path)

      error = assert_raises(Apply::DevelopmentLifecycle::Failure) { lifecycle.send(:stop_role, "api") }
      assert_includes error.message, "still listening"
      assert_equal original, File.read(path)
      lifecycle.send(:cleanup_started_roles, ["api"])
      assert_includes @error.string, "still listening"
      assert_equal original, File.read(path)
      TCPSocket.new("127.0.0.1", listener.addr[1]).close
    end
  ensure
    listener&.close
  end

  def test_record_survives_term_when_an_owned_child_listener_outlives_the_parent_group
    with_detached_listener_parent do |pid, child|
      lifecycle = build_lifecycle
      lifecycle.instance_variable_get(:@ports)[:api] = child.fetch("port")
      lifecycle.send(:write_pid_record, "api", pid)
      path = File.join(@temporary_directory, "tmp/dev/pids/api.pid")
      original = File.read(path)

      error = assert_raises(Apply::DevelopmentLifecycle::Failure) { lifecycle.send(:stop_role, "api") }
      assert_includes error.message, "still listening"
      refute lifecycle.send(:process_alive?, pid)
      assert_equal original, File.read(path)
      assert_equal 1, Process.kill(0, child.fetch("pid"))
      TCPSocket.new("127.0.0.1", child.fetch("port")).close
    end
  end

  def test_failed_pid_record_write_preserves_record_when_unrecorded_cleanup_leaves_a_listener
    skip "POSIX process groups required" unless Process.respond_to?(:fork)

    api = File.join(@temporary_directory, "apps/api")
    FileUtils.mkdir_p(File.join(api, "bin"))
    FileUtils.mkdir_p(File.join(@temporary_directory, "tmp/dev/logs"))
    ready = File.join(@temporary_directory, "child-ready.json")
    File.write(File.join(api, "bin/postgres"), detached_listener_program(ready))
    lifecycle = build_lifecycle
    original_write = lifecycle.method(:write_pid_record)
    original_record = nil
    record_path = File.join(@temporary_directory, "tmp/dev/pids/api.pid")
    lifecycle.define_singleton_method(:write_pid_record) do |role, pid|
      original_write.call(role, pid)
      original_record = File.read(record_path)
      Timeout.timeout(3) { sleep 0.01 until File.file?(ready) }
      child = JSON.parse(File.read(ready))
      @ports[:api] = child.fetch("port")
      raise Apply::DevelopmentLifecycle::Failure, "Synthetic PID record failure"
    end

    error = assert_raises(Apply::DevelopmentLifecycle::Failure) { lifecycle.send(:spawn_role, "api") }
    assert_includes error.message, "still listening"
    assert_equal original_record, File.read(record_path)
    record = JSON.parse(File.read(record_path))
    refute lifecycle.send(:process_alive?, record.fetch("pid"))
    child = JSON.parse(File.read(ready))
    assert_equal 1, Process.kill(0, child.fetch("pid"))
    TCPSocket.new("127.0.0.1", child.fetch("port")).close
  ensure
    if ready && File.file?(ready)
      child = JSON.parse(File.read(ready))
      kill_test_process(child.fetch("pid"))
    end
    Process.wait(record.fetch("pid")) if record
  end

  def test_foreign_root_zombie_record_is_preserved
    with_unreaped_process do |pid|
      assert_dead_record_identity_refused(pid, "root", File.join(@temporary_directory, "foreign-checkout"), "another checkout")
    end
  end

  def test_wrong_role_zombie_record_is_preserved
    with_unreaped_process do |pid|
      assert_dead_record_identity_refused(pid, "role", "web", "role does not match")
    end
  end

  def test_foreign_root_missing_pid_record_is_preserved
    assert_dead_record_identity_refused(2_147_483_647, "root", File.join(@temporary_directory, "foreign-checkout"), "another checkout")
  end

  def test_dead_record_without_checkout_metadata_is_preserved
    assert_dead_record_identity_refused(2_147_483_647, "root", nil, "lacks checkout/role metadata")
  end

  def test_wrong_role_missing_pid_record_is_preserved
    assert_dead_record_identity_refused(2_147_483_647, "role", "web", "role does not match")
  end

  def test_windows_process_liveness_rejects_an_exited_process_with_an_open_handle
    skip unless Gem.win_platform?

    lifecycle = build_lifecycle
    pid = Process.spawn(RbConfig.ruby, "-e", "sleep 0.2")
    api = lifecycle.send(:windows_process_api)
    handle = api.fetch(:open).call(0x1000, 0, pid)
    assert_operator handle.to_i, :>, 0

    Process.wait(pid)
    refute lifecycle.send(:process_alive?, pid)
  ensure
    api&.fetch(:close)&.call(handle) if handle && handle.to_i > 0
  end

  def test_refresh_refuses_diverged_git_before_changing_head
    remote = File.join(@temporary_directory, "remote.git")
    seed = File.join(@temporary_directory, "seed")
    work = File.join(@temporary_directory, "work")
    other = File.join(@temporary_directory, "other")
    git!("init", "--bare", "--initial-branch=main", remote)
    git!("clone", remote, seed)
    configure_git(seed)
    File.write(File.join(seed, "file.txt"), "base\n")
    git!("add", "file.txt", chdir: seed)
    git!("commit", "-m", "base", chdir: seed)
    git!("push", "origin", "main", chdir: seed)
    git!("clone", remote, work)
    git!("clone", remote, other)
    configure_git(work)
    configure_git(other)

    File.write(File.join(work, "local.txt"), "local\n")
    git!("add", "local.txt", chdir: work)
    git!("commit", "-m", "local", chdir: work)
    original_head = git!("rev-parse", "HEAD", chdir: work).strip

    File.write(File.join(other, "remote.txt"), "remote\n")
    git!("add", "remote.txt", chdir: other)
    git!("commit", "-m", "remote", chdir: other)
    git!("push", "origin", "main", chdir: other)

    lifecycle = Apply::DevelopmentLifecycle.new(root: work, environment: ENV.to_h, output: @output, error: @error)
    trace = Apply::TaskTrace.start(name: "Git divergence", output_root: File.join(@temporary_directory, "traces"))
    lifecycle.instance_variable_set(:@trace, trace)

    error = assert_raises(Apply::DevelopmentLifecycle::Failure) do
      lifecycle.send(:synchronize_git!)
    end
    assert_includes error.message, "diverged"
    assert_equal original_head, git!("rev-parse", "HEAD", chdir: work).strip
  end

  private

  def assert_dead_record_identity_refused(pid, field, value, expected_error)
    lifecycle = build_lifecycle
    lifecycle.send(:write_pid_record, "worker", pid)
    path = File.join(@temporary_directory, "tmp/dev/pids/worker.pid")
    record = JSON.parse(File.read(path))
    record[field] = value
    File.write(path, JSON.generate(record))
    original = File.read(path)

    error = assert_raises(Apply::DevelopmentLifecycle::Failure) { lifecycle.send(:stop_role, "worker") }
    assert_includes error.message, expected_error
    assert_equal original, File.read(path)
  end

  def kill_test_process(pid)
    Process.kill("KILL", pid)
  rescue Errno::ESRCH
    nil
  end

  def detached_listener_program(ready)
    <<~RUBY
      require "json"
      require "socket"
      fork do
        Process.setsid
        listener = TCPServer.new("127.0.0.1", 0)
        File.write(#{ready.inspect}, JSON.generate(pid: Process.pid, port: listener.addr[1]))
        loop { sleep 1 }
      end
      loop { sleep 1 }
    RUBY
  end

  def with_detached_listener_parent
    skip "POSIX process groups required" unless Process.respond_to?(:fork)

    api = File.join(@temporary_directory, "apps/api")
    FileUtils.mkdir_p(api)
    ready = File.join(@temporary_directory, "detached-child.json")
    program = detached_listener_program(ready)
    pid = Process.spawn(RbConfig.ruby, "-e", program, chdir: api, pgroup: true)
    Timeout.timeout(3) { sleep 0.01 until File.file?(ready) }
    child = JSON.parse(File.read(ready))
    yield pid, child
  ensure
    if child
      kill_test_process(child.fetch("pid"))
    end
    if pid
      kill_test_process(pid)
      Process.wait(pid)
    end
  end

  def with_unreaped_process
    skip "POSIX fork required" unless Process.respond_to?(:fork)

    pid = fork { exit! 0 }
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 3
    loop do
      output, status = Open3.capture2("ps", "-o", "stat=", "-p", pid.to_s)
      break if status.success? && output.strip.start_with?("Z")
      raise "Exited child did not become observable as a zombie" if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
      sleep 0.01
    end
    yield pid
  ensure
    Process.wait(pid) if pid
  end

  def build_lifecycle(environment = {})
    Apply::DevelopmentLifecycle.new(
      root: @temporary_directory,
      environment: ENV.to_h.merge(environment),
      output: @output,
      error: @error
    )
  end

  def write_runtime_contract(node:)
    FileUtils.mkdir_p(File.join(@temporary_directory, "apps/api"))
    FileUtils.mkdir_p(File.join(@temporary_directory, "apps/web"))
    File.write(File.join(@temporary_directory, "apps/api/.ruby-version"), "ruby-#{RUBY_VERSION}\n")
    File.write(File.join(@temporary_directory, "apps/api/Gemfile.lock"), "BUNDLED WITH\n  4.0.15\n")
    File.write(File.join(@temporary_directory, "apps/web/.node-version"), "#{node}\n")
    File.write(File.join(@temporary_directory, "apps/web/package.json"), '{"packageManager":"pnpm@11.19.0"}')
  end

  def configure_git(directory)
    git!("config", "user.name", "APPly Test", chdir: directory)
    git!("config", "user.email", "apply-test@example.invalid", chdir: directory)
  end

  def git!(*arguments, chdir: nil)
    options = {}
    options[:chdir] = chdir if chdir
    output, status = Open3.capture2e("git", *arguments, **options)
    assert status.success?, output
    output
  end
end
