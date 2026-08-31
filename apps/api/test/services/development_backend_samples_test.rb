require "test_helper"

class DevelopmentBackendSamplesTest < ActiveSupport::TestCase
  test "two complete synthetic tenants rerun without duplicating records or restoring revoked grants" do
    practices = Development::BackendSamples.call
    assert_equal 2, practices.size
    practices.each do |practice|
      assert_equal 30, practice.patients.count
      assert_equal 2, practice.sites.count
      assert_equal 4, practice.memberships.count
      assert_equal 4, practice.documents.count
      assert_equal 3, practice.message_intents.count
      assert_equal 2, practice.encounters.count
      assert practice.model_versions.exists?
      reader = practice.memberships.joins(:user).find_by!(users: { email_address: "synthetic-review-#{practice.name.last.downcase}-reader@example.invalid" })
      ability = Ability.new(reader.user, practice: practice)
      assert ability.can?(:read, practice.patients.first)
      assert ability.cannot?(:create, Clinic::Care::Patient)
      assert ability.cannot?(:read, (practices - [ practice ]).first.patients.first)
    end
    grant = practices.first.memberships.first.role_grants.first
    grant.update!(revoked_at: Time.current, revision: grant.revision + 1)
    tables = ApplicationRecord.connection.tables - %w[schema_migrations ar_internal_metadata]
    counts = -> { tables.to_h { |table| [ table, ApplicationRecord.connection.select_value("SELECT COUNT(*) FROM #{ApplicationRecord.connection.quote_table_name(table)}") ] } }
    before = counts.call
    assert_equal practices.map(&:id), Development::BackendSamples.call.map(&:id)
    assert_equal before, counts.call
    assert grant.reload.revoked_at.present?
  end
end
