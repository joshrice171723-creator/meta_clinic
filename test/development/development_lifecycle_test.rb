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
    lifecycle.define_singleton_method(:spawn_missing_services!) { |roles| roles << "api" }
    lifecycle.define_singleton_method(:require_database_ready!) do
      raise Apply::DevelopmentLifecycle::Failure, "synthetic readiness failure"
    end
    lifecycle.define_singleton_method(:cleanup_started_roles) { |roles| cleaned = roles.dup }

    assert_raises(Apply::DevelopmentLifecycle::Failure) do
      lifecycle.send(:start_services, {no_browser: true, no_docker_start: true})
    end
    assert_equal ["api"], cleaned
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
    File.write(File.join(@temporary_directory, "apps/web/package-lock.json"), "synthetic lock\n")
    lifecycle = build_lifecycle

    refute lifecycle.send(:web_lock_digest_matches?)

    digest = Digest::SHA256.file(File.join(@temporary_directory, "apps/web/package-lock.json")).hexdigest
    File.write(File.join(@temporary_directory, "apps/web/node_modules/.apply-lock-digest"), "#{digest}\n")
    assert lifecycle.send(:web_lock_digest_matches?)
  end

  def test_web_install_writes_the_lock_digest_after_dependency_validation
    web_root = File.join(@temporary_directory, "apps/web")
    FileUtils.mkdir_p(web_root)
    File.write(File.join(web_root, "package-lock.json"), "synthetic lock\n")
    lifecycle = build_lifecycle
    npm_checks = 0

    lifecycle.define_singleton_method(:system!) do |*arguments, **options|
      raise "unexpected install command" unless arguments == ["npm", "ci", "--ignore-scripts"]
      raise "unexpected install directory" unless options.fetch(:chdir) == web_root

      FileUtils.mkdir_p(File.join(web_root, "node_modules/.bin"))
      File.write(File.join(web_root, "node_modules/.bin/vite"), "")
    end
    lifecycle.define_singleton_method(:capture) do |*arguments, **options|
      raise "unexpected validation command" unless arguments == ["npm", "ls", "--depth=0", "--silent"]
      raise "unexpected validation directory" unless options.fetch(:chdir) == web_root

      npm_checks += 1
      ["", true]
    end

    lifecycle.send(:install_web_dependencies!)

    assert_equal 1, npm_checks
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

  def test_windows_process_liveness_requires_a_matching_cim_process
    lifecycle = build_lifecycle
    lifecycle.define_singleton_method(:capture) { |*_arguments, **_options| ["4242\n", true] }
    original_win_platform = Gem.method(:win_platform?)
    Gem.singleton_class.send(:define_method, :win_platform?) { true }

    assert lifecycle.send(:process_alive?, 4242)

    lifecycle.define_singleton_method(:capture) { |*_arguments, **_options| ["4241\n", true] }
    refute lifecycle.send(:process_alive?, 4242)
  ensure
    Gem.singleton_class.send(:define_method, :win_platform?, original_win_platform) if original_win_platform
  end

  def test_windows_process_liveness_fails_closed_when_cim_query_fails
    lifecycle = build_lifecycle
    lifecycle.define_singleton_method(:capture) { |*_arguments, **_options| ["CIM unavailable", false] }
    original_win_platform = Gem.method(:win_platform?)
    Gem.singleton_class.send(:define_method, :win_platform?) { true }

    error = assert_raises(Apply::DevelopmentLifecycle::Failure) do
      lifecycle.send(:process_alive?, 4242)
    end
    assert_includes error.message, "could not verify whether Windows PID 4242 is running"
  ensure
    Gem.singleton_class.send(:define_method, :win_platform?, original_win_platform) if original_win_platform
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
