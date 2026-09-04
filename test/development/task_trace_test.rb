# frozen_string_literal: true

require "json"
require "minitest/autorun"
require "open3"
require "tmpdir"
require_relative "../../bin/lib/task_trace"

class TaskTraceTest < Minitest::Test
  ROOT = File.expand_path("../..", __dir__)

  def setup
    @temporary_directory = Dir.mktmpdir("apply-task-trace-")
    @recorder = Apply::TaskTrace.start(
      name: "Synthetic trace",
      output_root: @temporary_directory,
      source: "test"
    )
  end

  def teardown
    FileUtils.remove_entry(@temporary_directory)
  end

  def test_records_incremental_spans_and_renders_timeline
    span_id = @recorder.start_span(name: "Inspect repository", category: "git")
    running = JSON.parse(File.read(@recorder.path))
    assert_equal "running", running.fetch("spans").first.fetch("status")

    @recorder.finish_span(span_id, status: "ok")
    artifact = @recorder.finish(status: "ok")
    completed = JSON.parse(File.read(@recorder.path))

    assert_equal "ok", completed.fetch("status")
    assert_operator completed.fetch("duration_ms"), :>=, 0
    assert_equal "ok", completed.fetch("spans").first.fetch("status")
    assert File.file?(artifact)
    assert_includes File.read(artifact), "Inspect repository"
    assert_includes @recorder.summary, "unattributed"
  end

  def test_finish_marks_unclosed_spans_as_interrupted
    @recorder.start_span(name: "Interrupted work", category: "agent")
    @recorder.finish(status: "failed")
    trace = JSON.parse(File.read(@recorder.path))

    assert_equal "failed", trace.fetch("status")
    assert_equal "interrupted", trace.fetch("spans").first.fetch("status")
  end

  def test_finish_is_idempotent
    @recorder.finish(status: "ok")
    completed = JSON.parse(File.read(@recorder.path))

    @recorder.finish(status: "failed")
    repeated = JSON.parse(File.read(@recorder.path))

    assert_equal completed.fetch("status"), repeated.fetch("status")
    assert_equal completed.fetch("ended_at"), repeated.fetch("ended_at")
    assert_equal completed.fetch("duration_ms"), repeated.fetch("duration_ms")
  end

  def test_summary_preserves_parent_time_outside_nested_spans
    parent = @recorder.start_span(name: "Outer test", category: "test")
    sleep 0.002
    child = @recorder.start_span(name: "Nested setup", category: "setup", parent_id: parent)
    sleep 0.002
    @recorder.finish_span(child)
    sleep 0.002
    @recorder.finish_span(parent)
    @recorder.finish

    summary = @recorder.summary
    assert_includes summary, "test"
    assert_includes summary, "setup"
  end

  def test_span_command_does_not_record_command_arguments_or_output
    synthetic_argument = "synthetic-sensitive-command-argument"
    stdout, stderr, status = Open3.capture3(
      "ruby", File.join(ROOT, "bin/task-trace"), "span", @recorder.path,
      "test", "Safe command label", "--", "ruby", "-e", "puts ARGV.fetch(0)", synthetic_argument
    )

    assert status.success?, stderr
    assert_includes stdout, synthetic_argument
    refute_includes File.read(@recorder.path), synthetic_argument
  end

  def test_svg_escapes_labels
    span_id = @recorder.start_span(name: "<unsafe & label>", category: "other")
    @recorder.finish_span(span_id)
    artifact = @recorder.finish
    svg = File.read(artifact)

    assert_includes svg, "&lt;unsafe &amp; label&gt;"
    refute_includes svg, "<unsafe & label>"
  end
end
