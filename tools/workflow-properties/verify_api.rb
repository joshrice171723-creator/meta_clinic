# Runs against one generated scratch database; never resets the shared dev database.
require "json"
require "open3"
require "securerandom"

root = File.expand_path("../..", __dir__)
api = File.join(root, "apps/api")
abort "Loopback PostgreSQL required" unless [nil, "localhost", "127.0.0.1", "::1"].include?(ENV["PGHOST"])
database = "apply_properties_#{SecureRandom.hex(6)}"
env = { "RAILS_ENV" => "test", "APPLY_TEST_DATABASE" => database,
  "DATABASE_URL" => nil, "SKIP_TEST_DATABASE" => "1",
  "SCHEMA" => File.join(api, "tmp", "#{database}.sql") }
prefix = ENV["PGPASSWORD"] ? [] : ["ruby", "bin/postgres", "exec"]
created = false
begin
  abort "Could not create scratch database" unless system(env, *prefix, "createdb", database, chdir: api)
  created = true
  warn "Loading repository structure into #{database}"
  output, status = Open3.capture2e(env, *prefix, "psql", "-X", "--single-transaction", "-v", "ON_ERROR_STOP=1", "-d", database,
    stdin_data: File.read(File.join(api, "db", "structure.sql")), chdir: api)
  unless status.success?
    warn output.lines.grep(/ERROR|invalid command|does not exist|FATAL/).first(5).join
    abort "Scratch structure load failed"
  end
  warn "Running properties against isolated repository schema"
  bridge = File.join(__dir__, "bridge.rb")
  command = [*prefix, "ruby", "bin/rails", "runner", "--skip-executor", bridge]
  test_env = env.merge("WORKFLOW_BRIDGE_COMMAND" => JSON.generate(command), "WORKFLOW_BRIDGE_CWD" => api)
  success = system(test_env, "node", "--import", "tsx", "run.mjs", "--api", chdir: __dir__)
  exit(success ? 0 : 1)
ensure
  if created
    # Exact generated target, validated before any destructive cleanup.
    abort "Unexpected scratch database name" unless database.match?(/\Aapply_properties_[0-9a-f]{12}\z/)
    warn "Scratch database cleanup failed: #{database}" unless system(env, *prefix, "dropdb", database, chdir: api)
  end
end
