require "test_helper"

class QaCoverageExportTest < ActiveSupport::TestCase
  test "keyed exports reject either conflicting alias" do
    [ { "id" => "WF-002" }, { "workflow" => "WF-002" }, { "id" => "WF-001", "workflow" => "WF-002" } ].each do |record|
      error = assert_raises(ArgumentError) { Qa::Workspace.coverage_export("workflows" => { "WF-001" => record }) }
      assert_equal "Workflow id differs from its key.", error.message
    end
  end

  test "keyed exports preserve compatible omitted or matching aliases" do
    [ {}, { "id" => "WF-001" }, { "workflow" => "WF-001" }, { "id" => "WF-001", "workflow" => "WF-001" } ].each do |record|
      exported = Qa::Workspace.coverage_export("coverage" => { "WF-001" => record }, "pointer" => "WF-001")
      assert_equal "WF-001", exported.fetch("coverage").first.fetch("id")
      assert_equal true, exported.fetch("coverage").first.fetch("historical")
      assert_equal "WF-001", exported.fetch("coverage_pointer")
    end
  end

  test "array exports reject conflicting aliases and preserve single aliases" do
    assert_raises(ArgumentError) do
      Qa::Workspace.coverage_export("coverage" => [ { "id" => "WF-001", "workflow" => "WF-002" } ])
    end
    [ { "id" => "WF-001" }, { "workflow" => "WF-001" }, { "id" => "WF-001", "workflow" => "WF-001" } ].each do |record|
      exported = Qa::Workspace.coverage_export("coverage" => [ record ])
      assert_equal "WF-001", exported.fetch("coverage").first.fetch("id")
    end
  end
end
