# frozen_string_literal: true

require "bundler"
require "json"
require "minitest/autorun"
require "open3"
require "rbconfig"

class ClinicWorkerBootTest < Minitest::Test
  API_ROOT = File.expand_path("../../apps/api", __dir__)
  WORKER = File.join(API_ROOT, "bin/clinic-worker")
  LOCKED_JSON_VERSION = File.read(File.join(API_ROOT, "Gemfile.lock"))[/^    json \(([^)]+)\)$/, 1]
  PROBE = <<~RUBY
    worker = ARGV.shift
    at_exit { warn "worker_json_version=\#{Gem.loaded_specs.fetch('json').version}" }
    load worker
  RUBY

  def test_help_activates_locked_json_without_loading_the_application
    stdout, stderr, status = run_worker("--help")

    assert_equal 0, status.exitstatus
    assert_includes stdout, "Usage: bin/clinic-worker"
    assert_locked_json(stderr)
    assert_equal "", without_probe(stderr)
  end

  def test_invalid_option_retains_json_error_and_exit_status
    _stdout, stderr, status = run_worker("--unknown-worker-option")

    assert_equal 2, status.exitstatus
    assert_includes JSON.parse(without_probe(stderr)).fetch("error"), "invalid option"
    assert_locked_json(stderr)
  end

  def test_invalid_interval_retains_json_error_and_exit_status
    _stdout, stderr, status = run_worker("--interval", "0")

    assert_equal 2, status.exitstatus
    assert_equal "Interval must be between 1 and 3600 seconds.", JSON.parse(without_probe(stderr)).fetch("error")
    assert_locked_json(stderr)
  end

  private

  def run_worker(*arguments)
    bundle_path = ENV["BUNDLE_PATH"]
    Bundler.with_unbundled_env do
      Open3.capture3(
        {
          "RUBYOPT" => nil,
          "RUBYLIB" => nil,
          "BUNDLE_GEMFILE" => File.join(API_ROOT, "Gemfile"),
          "BUNDLE_PATH" => bundle_path,
          "BUNDLE_FROZEN" => "true",
          "RAILS_ENV" => "worker_boot_probe_without_application"
        },
        RbConfig.ruby, "-e", PROBE, WORKER, *arguments,
        chdir: API_ROOT
      )
    end
  end

  def assert_locked_json(stderr)
    refute_nil LOCKED_JSON_VERSION
    assert_includes stderr.lines.map(&:strip), "worker_json_version=#{LOCKED_JSON_VERSION}"
  end

  def without_probe(stderr)
    stderr.lines.reject { |line| line.start_with?("worker_json_version=") }.join
  end
end
