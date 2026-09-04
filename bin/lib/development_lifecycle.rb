# frozen_string_literal: true

require "digest"
require "fileutils"
require "json"
require "net/http"
require "open3"
require "rbconfig"
require "socket"
require "time"
require "timeout"
require "uri"
require_relative "task_trace"

module Apply
  class DevelopmentLifecycle
    class Failure < StandardError; end

    Check = Struct.new(:name, :ok, :detail, keyword_init: true)

    COMMANDS = %w[start stop restart status setup refresh reset-data].freeze
    PROCESS_ROLES = {
      "api" => {port_key: :api, directory: "apps/api"},
      "web" => {port_key: :web, directory: "apps/web"}
    }.freeze

    attr_reader :root

    def initialize(root:, environment: ENV, output: $stdout, error: $stderr)
      @root = File.expand_path(root)
      @environment = environment
      @output = output
      @error = error
      @output.sync = true if @output.respond_to?(:sync=)
      @error.sync = true if @error.respond_to?(:sync=)
      @api_root = File.join(@root, "apps/api")
      @web_root = File.join(@root, "apps/web")
      @runtime_root = File.join(@root, "tmp/dev")
      @log_root = File.join(@runtime_root, "logs")
      @pid_root = File.join(@runtime_root, "pids")
      @trace_root = File.join(@root, "tmp/task-traces")
      @container = @environment.fetch("APPLY_POSTGRES_CONTAINER", "apply-postgres-development")
      @database = @environment.fetch("APPLY_DEVELOPMENT_DATABASE", "apply_development")
      @ports = {
        web: parse_port("APPLY_WEB_PORT", 3000),
        api: parse_port("APPLY_API_PORT", 3001)
      }
      @trace = nil
      @owns_trace = false
      @trace_parent = @environment["APPLY_TASK_TRACE_PARENT"]
    end

    def run(arguments)
      command = arguments.shift || "start"
      return print_help(0) if %w[help --help -h].include?(command)
      return print_help(1, "Unknown command: #{command}") unless COMMANDS.include?(command)

      options = parse_options(command, arguments)
      start_trace(command)
      status = "ok"
      dispatch(command, options)
      0
    rescue Failure, TaskTrace::TraceError => exception
      status = "failed"
      @error.puts "dev: #{exception.message}"
      1
    rescue Interrupt
      status = "interrupted"
      @error.puts "dev: interrupted"
      130
    ensure
      finish_trace(status) if @trace
    end

    def print_help(exit_code = 0, message = nil)
      @error.puts message if message
      @output.puts <<~HELP
        Usage: bin/dev [command] [options]

        Commands:
          start                 Migrate, start, and strictly verify the local stack
          stop                  Stop checkout-owned services and PostgreSQL
          restart               Restart services without reinstalling or resetting data
          status                Run strict runtime, process, database, and HTTP checks
          setup                 Install locked dependencies and prepare the database
          refresh               Fast-forward a clean checkout, reconcile dependencies, and restart
          reset-data --yes      Replant only the guarded local development database

        Options for start/restart/refresh: --no-browser, --no-docker-start

        start never performs Git operations, installs dependencies, or resets data.
        refresh never creates merge commits and stops before runtime mutation when Git diverges.
        Every command writes a metadata-only timing trace under tmp/task-traces/.
      HELP
      exit_code
    end

    private

    def parse_options(command, arguments)
      allowed = case command
      when "start", "restart", "refresh"
        %w[--no-browser --no-docker-start]
      when "reset-data"
        %w[--yes]
      else
        []
      end
      unknown = arguments - allowed
      fail_with("Unknown option for #{command}: #{unknown.first}") unless unknown.empty?
      {
        no_browser: arguments.include?("--no-browser"),
        no_docker_start: arguments.include?("--no-docker-start"),
        confirmed: arguments.include?("--yes")
      }
    end

    def dispatch(command, options)
      case command
      when "start"
        start_services(options)
      when "stop"
        stop_services(stop_database: true)
      when "restart"
        validate_local_boundary!
        phase("Validate pinned runtimes") { require_runtime_versions! }
        phase("Check locked dependencies", category: "dependency") { require_dependencies! }
        stop_services(stop_database: false)
        start_services(options, prerequisites_checked: true)
      when "status"
        run_status!
      when "setup"
        setup
      when "refresh"
        refresh(options)
      when "reset-data"
        reset_data(options)
      end
    end

    def start_trace(command)
      provided_path = @environment["APPLY_TASK_TRACE"]
      if provided_path && !provided_path.empty?
        @trace = TaskTrace.open(provided_path)
      else
        @trace = TaskTrace.start(name: "APPly dev #{command}", output_root: @trace_root, source: "bin/dev")
        @owns_trace = true
      end
    end

    def finish_trace(status)
      if @owns_trace
        artifact = @trace.finish(status: status || "failed")
        @output.puts
        @output.puts @trace.summary
        @output.puts "Timeline: #{artifact}"
        @output.puts "Trace: #{@trace.path}"
      else
        @trace.render
        @output.puts "Trace updated: #{@trace.path}"
      end
    rescue TaskTrace::TraceError => exception
      @error.puts "dev: could not finalize trace: #{exception.message}"
    end

    def phase(name, category: "setup")
      @output.puts "==> #{name}"
      started = monotonic_time
      span_id = @trace.start_span(name: name, category: category, parent_id: @trace_parent)
      result = yield
      @trace.finish_span(span_id, status: "ok")
      @output.puts "<== #{name} (#{format_elapsed(monotonic_time - started)})"
      result
    rescue Exception # rubocop:disable Lint/RescueException -- preserve interrupt/failure timing
      @trace.finish_span(span_id, status: "failed") if span_id && trace_span_running?(span_id)
      @error.puts "<!! #{name} failed (#{format_elapsed(monotonic_time - started)})" if started
      raise
    end

    def trace_span_running?(span_id)
      @trace.read.fetch("spans").any? { |span| span.fetch("id") == span_id && span.fetch("status") == "running" }
    end

    def monotonic_time
      Process.clock_gettime(Process::CLOCK_MONOTONIC)
    end

    def format_elapsed(seconds)
      seconds < 1 ? format("%.0fms", seconds * 1000) : format("%.2fs", seconds)
    end

    def fail_with(message)
      raise Failure, message
    end

    def setup
      validate_local_boundary!
      phase("Validate pinned runtimes") { require_runtime_versions! }
      stop_services(stop_database: false)
      phase("Install locked API dependencies", category: "dependency") { install_api_dependencies! }
      phase("Install locked web dependencies", category: "dependency") { install_web_dependencies! }
      phase("Start PostgreSQL", category: "database") { ensure_postgres!(auto_start_docker: true) }
      phase("Migrate the development database", category: "database") { migrate_database! }
      @output.puts "Setup complete. Run bin/dev start."
    end

    def refresh(options)
      validate_local_boundary!
      changed_paths = synchronize_git!
      phase("Validate pinned runtimes") { require_runtime_versions! }
      reconcile_dependencies!(changed_paths)
      stop_services(stop_database: false)
      start_services(options, prerequisites_checked: true)
    end

    def reset_data(options)
      fail_with("reset-data is destructive; rerun exactly as: bin/dev reset-data --yes") unless options.fetch(:confirmed)
      validate_local_boundary!
      phase("Validate pinned runtimes") { require_runtime_versions! }
      phase("Check locked dependencies", category: "dependency") { require_dependencies! }
      stop_services(stop_database: false)
      phase("Start PostgreSQL", category: "database") { ensure_postgres!(auto_start_docker: true) }
      phase("Migrate the development database", category: "database") { migrate_database! }
      phase("Replant synthetic development data", category: "database") do
        environment = database_environment.merge(
          "APP_SYNTHETIC_SEEDS" => "1",
          "APP_DEV_SEED_PROFILE" => "bulk"
        )
        system!(environment, RbConfig.ruby, "bin/postgres", "exec", "bin/rails", "db:seed:replant", chdir: @api_root)
      end
      @output.puts "Replanted #{@database}. Services remain stopped; run bin/dev start."
    end

    def start_services(options, prerequisites_checked: false)
      started_roles = []
      validate_local_boundary!
      unless prerequisites_checked
        phase("Validate pinned runtimes") { require_runtime_versions! }
        phase("Check locked dependencies", category: "dependency") { require_dependencies! }
      end
      phase("Start PostgreSQL", category: "database") do
        ensure_postgres!(auto_start_docker: !options.fetch(:no_docker_start))
      end
      phase("Migrate the development database", category: "database") { migrate_database! }
      phase("Validate application ports", category: "server") { require_ports_available_or_owned! }
      phase("Start Rails and Vite", category: "server") { spawn_missing_services!(started_roles) }
      phase("Verify migrations and database access", category: "database") { require_database_ready! }
      phase("Verify HTTP readiness", category: "server") { require_http_readiness! }
      phase("Verify managed process ownership", category: "server") do
        PROCESS_ROLES.each do |role, configuration|
          check = process_check(role, @ports.fetch(configuration.fetch(:port_key)))
          fail_with("#{check.name} failed ownership verification: #{check.detail}") unless check.ok
        end
      end
      @output.puts "APPly is ready: #{web_url}/login"
      @output.puts "API health: #{api_url}/up"
      @output.puts "Logs: #{@log_root}"
      open_browser unless options.fetch(:no_browser)
    rescue Exception # rubocop:disable Lint/RescueException -- do not strand children on interrupts
      cleanup_started_roles(started_roles) if started_roles
      raise
    end

    def stop_services(stop_database:)
      validate_container_name!
      phase("Validate managed stop scope", category: "server") { require_stoppable_scope! }
      phase("Stop checkout-owned application services", category: "server") do
        PROCESS_ROLES.each_key { |role| stop_role(role) }
      end
      return unless stop_database

      phase("Stop PostgreSQL", category: "database") do
        next unless docker_ready?
        next unless container_running?

        system!("docker", "stop", @container, out: File::NULL, err: File::NULL)
      end
      @output.puts "APPly stopped. Persistent PostgreSQL storage was preserved."
    end

    def synchronize_git!
      status = capture!("git", "status", "--porcelain=v1", "--untracked-files=all", chdir: @root).strip
      fail_with("the checkout is dirty; preserve or commit those changes before refresh") unless status.empty?
      branch_output, branch_ok = capture("git", "symbolic-ref", "--quiet", "--short", "HEAD", chdir: @root)
      branch = branch_output.strip
      fail_with("HEAD is detached; select the intended branch before refresh") unless branch_ok && !branch.empty?
      upstream_output, upstream_ok = capture("git", "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}", chdir: @root)
      upstream = upstream_output.strip
      fail_with("branch #{branch} has no configured upstream") unless upstream_ok && !upstream.empty?
      remote = capture!("git", "config", "--get", "branch.#{branch}.remote", chdir: @root).strip
      fail_with("branch #{branch} does not track a remote repository") if remote.empty? || remote == "."
      starting_commit = capture!("git", "rev-parse", "HEAD", chdir: @root).strip

      phase("Fetch #{remote} for #{branch}", category: "git") { system!("git", "fetch", remote, chdir: @root) }
      ahead, behind = git_counts
      if ahead.positive? && behind.positive?
        fail_with("#{branch} diverged from #{upstream} (ahead #{ahead}, behind #{behind}); reconcile it explicitly before refresh")
      elsif behind.positive?
        phase("Fast-forward #{branch} by #{behind} commit(s)", category: "git") do
          system!("git", "merge", "--ff-only", "@{upstream}", chdir: @root)
        end
      elsif ahead.positive?
        @output.puts "#{branch} is ahead of #{upstream} by #{ahead} commit(s); retaining local commits."
      else
        @output.puts "#{branch} already matches #{upstream}."
      end

      final_status = capture!("git", "status", "--porcelain=v1", "--untracked-files=all", chdir: @root).strip
      fail_with("the checkout became dirty during refresh") unless final_status.empty?
      _final_ahead, final_behind = git_counts
      fail_with("#{branch} remains behind #{upstream} after refresh") unless final_behind.zero?
      final_commit = capture!("git", "rev-parse", "HEAD", chdir: @root).strip
      return [] if starting_commit == final_commit

      capture!("git", "diff", "--name-only", starting_commit, final_commit, chdir: @root).lines.map(&:strip)
    end

    def git_counts
      values = capture!("git", "rev-list", "--left-right", "--count", "HEAD...@{upstream}", chdir: @root)
        .split.map { |value| Integer(value, 10) }
      fail_with("could not compare HEAD with its upstream") unless values.length == 2
      values
    rescue ArgumentError
      fail_with("could not parse the upstream comparison")
    end

    def reconcile_dependencies!(changed_paths)
      api_changed = changed_paths.any? { |path| %w[apps/api/Gemfile apps/api/Gemfile.lock].include?(path) }
      web_changed = changed_paths.any? { |path| %w[apps/web/package.json apps/web/package-lock.json].include?(path) }
      api_ready = api_dependencies_ready?
      web_ready = web_dependencies_ready?

      if api_changed || !api_ready
        phase("Reconcile locked API dependencies", category: "dependency") { install_api_dependencies! }
      else
        @output.puts "Locked API dependencies are current."
      end
      if web_changed || !web_ready
        phase("Reconcile locked web dependencies", category: "dependency") { install_web_dependencies! }
      else
        @output.puts "Locked web dependencies are current."
      end
    end

    def validate_local_boundary!
      fail_with("DATABASE_URL must be unset for local development") unless @environment.fetch("DATABASE_URL", "").empty?
      fail_with("RAILS_ENV must be unset or development") unless ["", "development"].include?(@environment.fetch("RAILS_ENV", ""))
      fail_with("APPLY_WEB_PORT and APPLY_API_PORT must be different") if @ports.fetch(:web) == @ports.fetch(:api)
      unless @database.match?(/\Aapply[a-z0-9_]*_development\z/)
        fail_with("development database #{@database.inspect} is outside the apply*_development boundary")
      end
      validate_container_name!
      host = @environment.fetch("PGHOST", "127.0.0.1")
      fail_with("PGHOST must be loopback for local development") unless %w[127.0.0.1 localhost ::1].include?(host)
    end

    def validate_container_name!
      fail_with("Invalid APPly PostgreSQL container name") unless @container.match?(/\Aapply-[a-z0-9-]+\z/)
    end

    def require_runtime_versions!
      checks = runtime_checks
      checks.each { |check| print_check(check) }
      failed = checks.reject(&:ok)
      fail_with("runtime validation failed: #{failed.map(&:name).join(', ')}") unless failed.empty?
    end

    def runtime_checks
      expected_ruby = File.read(File.join(@api_root, ".ruby-version")).strip.sub(/\Aruby-/, "")
      expected_node = File.read(File.join(@web_root, ".node-version")).strip
      expected_bundler = File.read(File.join(@api_root, "Gemfile.lock"))[/BUNDLED WITH\s+([0-9.]+)/m, 1]
      node_output, node_ok = capture("node", "--version")
      node_actual = node_output[/v?(\d+(?:\.\d+){0,2})/, 1]
      node_matches = node_ok && node_actual && if expected_node.match?(/\A\d+\z/)
        node_actual.split(".").first == expected_node
      else
        node_actual == expected_node.sub(/\Av/, "")
      end
      bundler_output, bundler_ok = capture("bundle", "--version")
      bundler_actual = bundler_output[/([0-9]+(?:\.[0-9]+)+)/, 1]
      npm_output, npm_ok = capture("npm", "--version")
      [
        Check.new(name: "Ruby", ok: RUBY_VERSION == expected_ruby, detail: "#{RUBY_VERSION} (expected #{expected_ruby})"),
        Check.new(name: "Bundler", ok: bundler_ok && bundler_actual == expected_bundler, detail: "#{bundler_actual || 'not found'} (expected #{expected_bundler})"),
        Check.new(name: "Node", ok: !!node_matches, detail: "#{node_actual || 'not found'} (expected major #{expected_node})"),
        Check.new(name: "npm", ok: npm_ok, detail: first_line(npm_output))
      ]
    end

    def require_dependencies!
      checks = [
        Check.new(name: "API dependencies", ok: api_dependencies_ready?, detail: "bundle check"),
        Check.new(name: "Web dependencies", ok: web_dependencies_ready?, detail: "npm dependency tree")
      ]
      checks.each { |check| print_check(check) }
      failed = checks.reject(&:ok)
      fail_with("locked dependencies are missing; run bin/dev setup") unless failed.empty?
    end

    def api_dependencies_ready?
      capture("bundle", "check", chdir: @api_root).last
    end

    def web_dependencies_ready?
      web_lock_digest_matches? && web_dependency_tree_ready?
    end

    def web_dependency_tree_ready?
      File.file?(File.join(@web_root, "node_modules/.bin/vite")) &&
        capture("npm", "ls", "--depth=0", "--silent", chdir: @web_root).last
    end

    def web_lock_digest_matches?
      lockfile = File.join(@web_root, "package-lock.json")
      marker = File.join(@web_root, "node_modules/.apply-lock-digest")
      File.file?(lockfile) && File.file?(marker) &&
        File.read(marker).strip == Digest::SHA256.file(lockfile).hexdigest
    end

    def install_api_dependencies!
      return @output.puts("Locked API dependencies are already installed.") if api_dependencies_ready?

      system!({"BUNDLE_FROZEN" => "true"}, "bundle", "install", chdir: @api_root)
      fail_with("bundle check still fails after installation") unless api_dependencies_ready?
    end

    def install_web_dependencies!
      return @output.puts("Locked web dependencies are already installed.") if web_dependencies_ready?

      system!("npm", "ci", "--ignore-scripts", chdir: @web_root)
      fail_with("npm dependency validation fails after installation") unless web_dependency_tree_ready?
      digest = Digest::SHA256.file(File.join(@web_root, "package-lock.json")).hexdigest
      File.write(File.join(@web_root, "node_modules/.apply-lock-digest"), "#{digest}\n")
    end

    def ensure_postgres!(auto_start_docker:)
      unless docker_ready?
        if auto_start_docker && RUBY_PLATFORM.match?(/darwin/)
          system("open", "-a", "Docker", out: File::NULL, err: File::NULL)
          @output.puts "Waiting for Docker Desktop..."
          wait_until(90) { docker_ready? }
        end
      end
      fail_with("Docker is not running; start it and retry") unless docker_ready?

      unless container_running?
        system!(RbConfig.ruby, "bin/postgres", "start", chdir: @api_root)
      end
      ready = wait_until(45) do
        system("docker", "exec", @container, "pg_isready", "-U", "postgres", "-d", "postgres", out: File::NULL, err: File::NULL)
      end
      fail_with("PostgreSQL did not become ready; inspect docker logs #{@container}") unless ready
    end

    def migrate_database!
      sentinel = File.join(@api_root, "tmp", "dev-source-migrations-#{Process.pid}.sql")
      fail_with("schema sentinel unexpectedly exists: #{sentinel}") if File.exist?(sentinel)
      environment = database_environment.merge(
        "APPLY_STARTDEV_SKIP_SCHEMA_DUMP" => "1",
        "SCHEMA" => sentinel,
        "SKIP_TEST_DATABASE" => "1"
      )
      system!(environment, RbConfig.ruby, "bin/postgres", "exec", "bin/rails", "db:create", chdir: @api_root)
      system!(environment, RbConfig.ruby, "bin/postgres", "exec", "bin/rails", "db:migrate", chdir: @api_root)
    ensure
      File.delete(sentinel) if defined?(sentinel) && File.file?(sentinel)
    end

    def database_environment
      {
        "APPLY_DEVELOPMENT_DATABASE" => @database,
        "DATABASE_URL" => nil,
        "RAILS_ENV" => "development"
      }
    end

    def require_database_ready!
      migration_output, migrations_ok = capture(
        database_environment, RbConfig.ruby, "bin/postgres", "exec", "bin/rails", "db:abort_if_pending_migrations", chdir: @api_root
      )
      fail_with("pending database migrations remain: #{first_line(migration_output)}") unless migrations_ok
      probe = 'value = ActiveRecord::Base.connection.select_value("SELECT 1"); abort "database probe failed" unless value.to_i == 1'
      probe_output, probe_ok = capture(
        database_environment, RbConfig.ruby, "bin/postgres", "exec", "bin/rails", "runner", probe, chdir: @api_root
      )
      fail_with("database-backed readiness failed: #{first_line(probe_output)}") unless probe_ok
    end

    def run_status!
      validate_local_boundary!
      checks = []
      phase("Inspect pinned runtimes") { checks.concat(runtime_checks) }
      bundle_ok = false
      web_dependencies_ok = false
      phase("Inspect locked dependencies", category: "dependency") do
        bundle_ok = api_dependencies_ready?
        web_dependencies_ok = web_dependencies_ready?
        checks.concat([
          Check.new(name: "API dependencies", ok: bundle_ok, detail: bundle_ok ? "installed" : "run bin/dev setup"),
          Check.new(name: "Web dependencies", ok: web_dependencies_ok, detail: web_dependencies_ok ? "installed" : "run bin/dev setup")
        ])
      end

      docker_ok = false
      postgres_container_ok = false
      postgres_ok = false
      phase("Inspect PostgreSQL", category: "database") do
        docker_ok = docker_ready?
        postgres_container_ok = docker_ok && container_running?
        postgres_ok = postgres_container_ok && system(
          "docker", "exec", @container, "pg_isready", "-U", "postgres", "-d", "postgres", out: File::NULL, err: File::NULL
        )
        checks.concat([
          Check.new(name: "Docker engine", ok: docker_ok, detail: docker_ok ? first_line(capture("docker", "info", "--format", "{{.ServerVersion}}").first) : "not running"),
          Check.new(name: "PostgreSQL container", ok: postgres_container_ok, detail: postgres_container_ok ? @container : "not running"),
          Check.new(name: "PostgreSQL readiness", ok: !!postgres_ok, detail: postgres_ok ? "accepting connections" : "not ready")
        ])
      end

      phase("Inspect managed processes", category: "server") do
        PROCESS_ROLES.each do |role, configuration|
          checks << process_check(role, @ports.fetch(configuration.fetch(:port_key)))
        end
      end

      phase("Inspect migrations and database access", category: "database") do
        if postgres_ok && bundle_ok
          migration_output, migration_ok = capture(
            database_environment, RbConfig.ruby, "bin/postgres", "exec", "bin/rails", "db:abort_if_pending_migrations", chdir: @api_root
          )
          checks << Check.new(
            name: "Database migrations",
            ok: migration_ok,
            detail: migration_ok ? "current" : first_line(migration_output)
          )
          probe_output, probe_ok = capture(
            database_environment,
            RbConfig.ruby, "bin/postgres", "exec", "bin/rails", "runner",
            'abort "database probe failed" unless ActiveRecord::Base.connection.select_value("SELECT 1").to_i == 1',
            chdir: @api_root
          )
          checks << Check.new(name: "Database query", ok: probe_ok, detail: probe_ok ? "SELECT 1" : first_line(probe_output))
        else
          checks << Check.new(name: "Database migrations", ok: false, detail: "not checked")
          checks << Check.new(name: "Database query", ok: false, detail: "not checked")
        end
      end

      phase("Inspect HTTP readiness", category: "server") do
        checks << Check.new(name: "Frontend HTTP", ok: http_ready?("#{web_url}/login"), detail: "#{web_url}/login")
        checks << Check.new(name: "API HTTP", ok: http_ready?("#{api_url}/up"), detail: "#{api_url}/up")
      end
      checks.each { |check| print_check(check) }
      failures = checks.reject(&:ok)
      fail_with("strict status failed: #{failures.map(&:name).join(', ')}") unless failures.empty?
      @output.puts "APPly development environment is ready."
    end

    def print_check(check)
      @output.puts "[#{check.ok ? 'OK' : 'FAIL'}] #{check.name}: #{check.detail}"
    end

    def first_line(value)
      line = value.to_s.lines.find { |candidate| !candidate.strip.empty? }
      line ? line.strip[0, 200] : "unavailable"
    end

    def require_ports_available_or_owned!
      PROCESS_ROLES.each do |role, configuration|
        port = @ports.fetch(configuration.fetch(:port_key))
        next unless port_in_use?(port)
        check = process_check(role, port)
        fail_with("port #{port} is not owned by this checkout: #{check.detail}") unless check.ok
      end
    end

    def process_check(role, port)
      record = read_pid_record(role)
      return Check.new(name: "#{role} process", ok: false, detail: "port #{port} is not listening") unless port_in_use?(port)
      return Check.new(name: "#{role} process", ok: false, detail: "port #{port} has no checkout PID record") unless record
      pid = record.fetch("pid")
      return Check.new(name: "#{role} process", ok: false, detail: "recorded PID #{pid} is not running") unless process_alive?(pid)
      if unsafe_process_group?(pid)
        return Check.new(name: "#{role} process", ok: false, detail: "recorded process shares or has an unverifiable process group")
      end
      if record["root"] && File.expand_path(record.fetch("root")) != @root
        return Check.new(name: "#{role} process", ok: false, detail: "PID record belongs to another checkout")
      end
      if record["role"] && record.fetch("role") != role
        return Check.new(name: "#{role} process", ok: false, detail: "PID record role does not match")
      end
      unless process_directory_matches?(pid, role)
        return Check.new(name: "#{role} process", ok: false, detail: "PID #{pid} is not rooted in this checkout")
      end
      listeners = listener_pids(port)
      return Check.new(name: "#{role} process", ok: false, detail: "could not resolve the port #{port} listener") if listeners.empty?
      owned = listeners.all? { |listener| descendant_or_group_member?(pid, listener) }
      Check.new(
        name: "#{role} process",
        ok: owned,
        detail: owned ? "port #{port}, managed PID #{pid}" : "port #{port} listener is outside managed PID #{pid}"
      )
    end

    def process_directory_matches?(pid, role)
      expected = File.join(@root, PROCESS_ROLES.fetch(role).fetch(:directory))
      return true if Gem.win_platform? && read_pid_record(role)&.fetch("root", nil) == @root
      cwd = process_cwd(pid)
      cwd && File.expand_path(cwd) == expected
    end

    def process_cwd(pid)
      return nil unless command_available?("lsof")
      output, ok = capture("lsof", "-a", "-p", pid.to_s, "-d", "cwd", "-Fn")
      return nil unless ok
      output.lines.map(&:strip).find { |line| line.start_with?("n") }&.delete_prefix("n")
    end

    def listener_pids(port)
      if Gem.win_platform?
        output, ok = capture(
          "powershell", "-NoProfile", "-Command",
          "(Get-NetTCPConnection -State Listen -LocalPort #{port} -ErrorAction SilentlyContinue).OwningProcess"
        )
        return [] unless ok
        output.lines.filter_map { |line| Integer(line.strip, 10) rescue nil }.uniq
      elsif command_available?("lsof")
        output, _ok = capture("lsof", "-nP", "-iTCP:#{port}", "-sTCP:LISTEN", "-t")
        output.lines.filter_map { |line| Integer(line.strip, 10) rescue nil }.uniq
      else
        []
      end
    end

    def descendant_or_group_member?(root_pid, candidate_pid)
      return true if root_pid == candidate_pid
      if Gem.win_platform?
        current = candidate_pid
        20.times do
          output, ok = capture(
            "powershell", "-NoProfile", "-Command",
            "(Get-CimInstance Win32_Process -Filter \"ProcessId = #{current}\").ParentProcessId"
          )
          return false unless ok
          parent = Integer(output.strip, 10) rescue 0
          return true if parent == root_pid
          return false if parent <= 0 || parent == current
          current = parent
        end
        false
      else
        Process.getpgid(root_pid) == Process.getpgid(candidate_pid)
      end
    rescue Errno::ESRCH, Errno::EPERM
      false
    end

    def spawn_missing_services!(started_roles)
      FileUtils.mkdir_p(@log_root)
      FileUtils.mkdir_p(@pid_root)
      PROCESS_ROLES.each do |role, configuration|
        next if port_in_use?(@ports.fetch(configuration.fetch(:port_key)))

        Thread.handle_interrupt(Interrupt => :never) do
          spawn_role(role)
          started_roles << role
        end
      end
    end

    def spawn_role(role)
      rotate_log(role)
      log_path = File.join(@log_root, "#{role}.log")
      log = File.open(log_path, "a")
      pid = nil
      recorded = false
      environment = {
        "APP_DEVELOPMENT_LOGIN" => "1",
        "APPLY_API_PORT" => @ports.fetch(:api).to_s,
        "APPLY_WEB_PORT" => @ports.fetch(:web).to_s,
        "APPLY_DEVELOPMENT_DATABASE" => @database,
        "RAILS_ENV" => "development"
      }
      command, directory = if role == "api"
        [[RbConfig.ruby, "bin/postgres", "exec", "bundle", "exec", "rails", "server", "-b", "127.0.0.1", "-p", @ports.fetch(:api).to_s], @api_root]
      else
        [["npm", "run", "dev"], @web_root]
      end
      process_options = {chdir: directory, out: log, err: log}
      process_options[Gem.win_platform? ? :new_pgroup : :pgroup] = true
      pid = Process.spawn(environment, *command, **process_options)
      write_pid_record(role, pid)
      recorded = true
      pid
    ensure
      log&.close
      if pid && !recorded
        cleanup_unrecorded_process(pid)
        File.delete(pid_path(role)) if File.file?(pid_path(role))
      end
    end

    def rotate_log(role)
      path = File.join(@log_root, "#{role}.log")
      return unless File.file?(path) && File.size(path) > 10 * 1024 * 1024
      previous = "#{path}.1"
      File.delete(previous) if File.file?(previous)
      File.rename(path, previous)
    end

    def write_pid_record(role, pid)
      FileUtils.mkdir_p(@pid_root)
      record = {
        "pid" => pid,
        "role" => role,
        "root" => @root,
        "started_at" => Time.now.utc.iso8601(6)
      }
      File.write(pid_path(role), "#{JSON.generate(record)}\n")
    end

    def read_pid_record(role)
      path = pid_path(role)
      return nil unless File.file?(path)
      content = File.read(path).strip
      record = if content.start_with?("{")
        record = JSON.parse(content)
        record["pid"] = Integer(record.fetch("pid").to_s, 10)
        record
      else
        {"pid" => Integer(content, 10)}
      end
      record.fetch("pid") > 1 ? record : nil
    rescue JSON::ParserError, ArgumentError, KeyError
      nil
    end

    def pid_path(role)
      File.join(@pid_root, "#{role}.pid")
    end

    def stop_role(role)
      record = read_pid_record(role)
      return unless record
      pid = record.fetch("pid")
      unless process_alive?(pid)
        File.delete(pid_path(role)) if File.file?(pid_path(role))
        return
      end

      validate_record_for_stop!(role, record)

      if Gem.win_platform?
        system("taskkill", "/PID", pid.to_s, "/T", "/F", out: File::NULL, err: File::NULL)
        fail_with("could not stop #{role} PID #{pid}") unless wait_until(8) { !process_alive?(pid) }
      else
        begin
          Process.kill("TERM", -Process.getpgid(pid))
        rescue Errno::ESRCH
          nil
        end
        stopped = wait_until(8) { !process_alive?(pid) }
        unless stopped
          Process.kill("KILL", -Process.getpgid(pid))
          fail_with("could not stop #{role} PID #{pid}") unless wait_until(2) { !process_alive?(pid) }
        end
      end
      File.delete(pid_path(role)) if File.file?(pid_path(role))
    rescue Errno::ESRCH
      File.delete(pid_path(role)) if File.file?(pid_path(role))
      nil
    end

    def validate_record_for_stop!(role, record)
      pid = record.fetch("pid")
      if record["root"] && File.expand_path(record.fetch("root")) != @root
        fail_with("refusing to stop #{role}: PID record belongs to another checkout")
      end
      if record["role"] && record.fetch("role") != role
        fail_with("refusing to stop #{role}: PID record role does not match")
      end
      unless process_directory_matches?(pid, role)
        fail_with("refusing to stop #{role}: recorded process is not rooted in this checkout")
      end
      if unsafe_process_group?(pid)
        fail_with("refusing to stop #{role}: recorded process shares or has an unverifiable process group")
      end
    end

    def cleanup_started_roles(roles)
      roles.reverse_each do |role|
        stop_role(role)
      rescue StandardError => exception
        @error.puts "dev: startup cleanup failed: #{exception.message}"
      end
    end

    def cleanup_unrecorded_process(pid)
      if Gem.win_platform?
        system("taskkill", "/PID", pid.to_s, "/T", "/F", out: File::NULL, err: File::NULL)
      else
        process_group = Process.getpgid(pid)
        Process.kill("TERM", -process_group)
        Process.kill("KILL", -process_group) unless wait_until(2) { !process_alive?(pid) }
      end
    rescue Errno::ESRCH
      nil
    rescue SystemCallError => exception
      @error.puts "dev: could not clean up unrecorded PID #{pid}: #{exception.class}"
    end

    def require_stoppable_scope!
      PROCESS_ROLES.each do |role, configuration|
        port = @ports.fetch(configuration.fetch(:port_key))
        record = read_pid_record(role)
        if port_in_use?(port)
          check = process_check(role, port)
          fail_with("refusing to stop #{role}: #{check.detail}") unless check.ok
        elsif record && process_alive?(record.fetch("pid"))
          validate_record_for_stop!(role, record)
        end
      end
    end

    def require_http_readiness!
      api_ready = wait_until(45) { http_ready?("#{api_url}/up") }
      fail_with("API failed readiness; inspect #{@log_root}/api.log") unless api_ready
      web_ready = wait_until(60) { http_ready?("#{web_url}/login") }
      fail_with("frontend failed readiness; inspect #{@log_root}/web.log") unless web_ready
    end

    def http_ready?(url)
      uri = URI(url)
      response = Net::HTTP.start(uri.host, uri.port, open_timeout: 2, read_timeout: 3) do |http|
        http.get(uri.request_uri)
      end
      response.code.to_i == 200
    rescue SystemCallError, Timeout::Error, Net::OpenTimeout, Net::ReadTimeout
      false
    end

    def open_browser
      if RUBY_PLATFORM.match?(/darwin/)
        system("open", "#{web_url}/login", out: File::NULL, err: File::NULL)
      elsif Gem.win_platform?
        system("cmd", "/c", "start", "", "#{web_url}/login", out: File::NULL, err: File::NULL)
      elsif command_available?("xdg-open")
        system("xdg-open", "#{web_url}/login", out: File::NULL, err: File::NULL)
      end
    end

    def api_url
      "http://127.0.0.1:#{@ports.fetch(:api)}"
    end

    def web_url
      "http://127.0.0.1:#{@ports.fetch(:web)}"
    end

    def docker_ready?
      system("docker", "info", out: File::NULL, err: File::NULL)
    rescue Errno::ENOENT
      false
    end

    def container_running?
      output, ok = capture("docker", "inspect", "--format", "{{.State.Running}}", @container)
      ok && output.strip == "true"
    end

    def port_in_use?(port)
      socket = TCPServer.new("127.0.0.1", port)
      socket.close
      false
    rescue Errno::EADDRINUSE
      true
    end

    def process_alive?(pid)
      Process.kill(0, pid)
      true
    rescue Errno::ESRCH
      false
    rescue Errno::EPERM
      true
    end

    def unsafe_process_group?(pid)
      return false if Gem.win_platform?

      Process.getpgid(pid) == Process.getpgrp
    rescue Errno::ESRCH, Errno::EPERM
      true
    end

    def parse_port(key, fallback)
      port = Integer(@environment.fetch(key, fallback.to_s), 10)
      fail_with("#{key} must be between 1024 and 65535") unless port.between?(1024, 65_535)
      port
    rescue ArgumentError
      fail_with("#{key} must be a numeric port")
    end

    def wait_until(timeout_seconds)
      deadline = monotonic_time + timeout_seconds
      loop do
        return true if yield
        return false if monotonic_time >= deadline
        sleep 0.5
      end
    end

    def command_available?(command)
      paths = @environment.fetch("PATH", "").split(File::PATH_SEPARATOR)
      extensions = Gem.win_platform? ? @environment.fetch("PATHEXT", ".EXE;.BAT;.CMD").split(";") : [""]
      paths.any? do |path|
        extensions.any? { |extension| File.executable?(File.join(path, "#{command}#{extension.downcase}")) || File.executable?(File.join(path, "#{command}#{extension.upcase}")) }
      end
    end

    def capture(*command, chdir: nil)
      environment = command.first.is_a?(Hash) ? command.shift : {}
      options = {}
      options[:chdir] = chdir if chdir
      output, status = Open3.capture2e(environment, *command, **options)
      [output, status.success?]
    rescue Errno::ENOENT => exception
      [exception.message, false]
    end

    def capture!(*command, chdir: nil)
      output, success = capture(*command, chdir: chdir)
      fail_with("#{command.join(' ')} failed: #{first_line(output)}") unless success
      output
    end

    def system!(*command, chdir: nil, out: nil, err: nil)
      environment = command.first.is_a?(Hash) ? command.shift : {}
      options = {}
      options[:chdir] = chdir if chdir
      options[:out] = out if out
      options[:err] = err if err
      success = system(environment, *command, **options)
      fail_with("#{command.first} failed") unless success
      true
    rescue Errno::ENOENT
      fail_with("#{command.first} was not found")
    end
  end
end
