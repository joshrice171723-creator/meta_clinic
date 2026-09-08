ENV["RAILS_ENV"] ||= "test"
require_relative "../../config/environment"
require "minitest/autorun"

# Dependency/boot checks only: no fixtures, database connection or version writes.
class PaperTrailConfigurationTest < Minitest::Test
  def test_paper_trail_is_loaded_and_version_errors_raise
    assert_respond_to ApplicationRecord, :has_paper_trail
    assert PaperTrail.enabled?
    assert_equal :exception, PaperTrail.config.version_error_behavior
  end

  def test_models_have_explicit_versioning_dispositions
    [ User, MemberSession, Clinic::Inventory::Entry ].each do |model|
      refute model < PaperTrail::Model::InstanceMethods, "#{model.name} needs an explicit versioning review"
    end

    [ Clinic::Care::Patient, Clinic::Care::Note, Clinic::Document ].each do |model|
      assert model < PaperTrail::Model::InstanceMethods, "#{model.name} should be explicitly versioned"
    end
  end
end
