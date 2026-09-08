#!/usr/bin/env ruby
require "rbconfig"

client = ARGV.shift
allowed_clients = %w[createdb dropdb psql pg_dump pg_restore pg_isready]
abort "Unsupported PostgreSQL client" unless allowed_clients.include?(client)

api_root = File.expand_path("..", __dir__)
postgres_helper = File.join(api_root, "bin", "postgres")
arguments = ARGV.dup
spawn_options = {}

if client == "pg_dump"
  output = nil
  forwarded = []
  index = 0
  while index < arguments.length
    argument = arguments[index]
    case argument
    when "--file", "-f"
      output = arguments.fetch(index + 1)
      index += 2
    when /\A--file=(.+)\z/
      output = Regexp.last_match(1)
      index += 1
    when /\A-f(.+)\z/
      output = Regexp.last_match(1)
      index += 1
    else
      forwarded << argument
      index += 1
    end
  end
  if output && output != "-"
    spawn_options[:out] = File.expand_path(output, Dir.pwd)
    arguments = forwarded
  end
elsif client == "psql"
  # Docker's psql cannot open a Windows host path supplied by Rails schema load.
  # Keep the file option in place, but stream the local file to its stdin.
  file_index = arguments.index("--file") || arguments.index("-f")
  if file_index && arguments[file_index + 1] && File.file?(arguments[file_index + 1])
    spawn_options[:in] = File.expand_path(arguments[file_index + 1], Dir.pwd)
    arguments[file_index + 1] = "-"
  end
elsif client == "pg_restore" && arguments.last && File.file?(arguments.last)
  spawn_options[:in] = File.expand_path(arguments.pop, Dir.pwd)
end

environment = { "APPLY_POSTGRES_CLIENT_WRAPPER" => "1" }
pid = Process.spawn(environment, RbConfig.ruby, postgres_helper, "exec", client, *arguments, **spawn_options)
_, status = Process.wait2(pid)
exit(status.exitstatus || 1)
