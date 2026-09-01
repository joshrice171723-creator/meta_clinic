require "test_helper"

class DevelopmentBackendSamplesTest < ActiveSupport::TestCase
  test "two rich synthetic tenants rerun without duplicating records or restoring access" do
    practices = Development::BackendSamples.call
    assert_equal 2, practices.size
    practices.each do |practice|
      assert_equal 30, practice.patients.count
      assert_equal 2, practice.sites.count
      assert_equal 4, practice.rooms.count
      assert_equal 18, practice.memberships.count
      assert_equal 12, practice.memberships.active.count
      assert_equal 6, practice.memberships.where(active: false).count
      assert_equal 2, practice.clinician_profiles.count
      assert_equal 4, practice.documents.count
      assert_equal 3, practice.message_intents.count
      assert_equal 16, practice.appointments.count
      assert_equal 12, practice.encounters.count
      assert_equal 84, practice.observations.count
      assert_equal 12, practice.encounter_notes.where(note_kind: "soap").count
      assert_equal 11, Clinic::EncounterNoteRevision.where(practice: practice, revision_no: 2).count
      assert_equal 10, Clinic::EncounterNoteSignature.where(practice: practice).count
      assert practice.model_versions.exists?
      patient = practice.patients.order(:reference).first
      assert patient.display_name.end_with?("[Synthetic]")
      assert patient.demographics
      assert_equal 2, patient.contacts.count
      assert patient.emergency_contacts.exists?
      assert patient.communication_preference
      assert patient.social_histories.exists?
      assert patient.primary_address_version
      assert_equal 7, patient.observations.where(value_kind: "numeric").count

      %w[admin clinician staff inventory billing reader].each do |role|
        identities = practice.memberships.joins(:user)
          .where("users.email_address LIKE ?", "synthetic-review-#{practice.name.last.downcase}-#{role}%")
        assert_equal 3, identities.count
        assert_equal 2, identities.active.count
      end
      reader = practice.memberships.joins(:user).find_by!(users: { email_address: "synthetic-review-#{practice.name.last.downcase}-reader@example.invalid" })
      ability = Ability.new(reader.user, practice: practice)
      assert ability.can?(:read, practice.patients.first)
      assert ability.cannot?(:create, Clinic::Care::Patient)
      assert ability.cannot?(:read, (practices - [ practice ]).first.patients.first)
    end
    grant = practices.first.memberships.active.first.role_grants.first
    grant.update!(revoked_at: Time.current, revision: grant.revision + 1)
    inactive_membership = practices.first.memberships.where(active: false).first
    tables = ApplicationRecord.connection.tables - %w[schema_migrations ar_internal_metadata]
    counts = -> { tables.to_h { |table| [ table, ApplicationRecord.connection.select_value("SELECT COUNT(*) FROM #{ApplicationRecord.connection.quote_table_name(table)}") ] } }
    before = counts.call
    assert_equal practices.map(&:id), Development::BackendSamples.call.map(&:id)
    assert_equal before, counts.call
    assert grant.reload.revoked_at.present?
    assert_not inactive_membership.reload.active?
  end
end
