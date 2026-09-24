require "test_helper"

class DevelopmentBackendSamplesTest < ActiveSupport::TestCase
  test "two rich synthetic tenants rerun without duplicating records or restoring access" do
    practices = Development::BackendSamples.call
    assert_equal 2, practices.size
    practices.each do |practice|
      assert_equal 30, practice.patients.count
      assert_equal 20, practice.patient_memberships.count
      assert_equal 10, practice.patient_memberships.where(status: "member").count
      assert_equal 10, practice.patient_memberships.where(status: "nonmember").count
      assert_equal 2, practice.sites.count
      assert_equal 6, practice.rooms.count
      assert_operator practice.memberships.count, :>=, 27
      assert_operator practice.memberships.active.count, :>=, 18
      assert_operator practice.memberships.where(active: false).count, :>=, 9
      assert_equal 3, practice.clinician_profiles.count
      assert_equal 4, practice.documents.count
      assert_equal 3, practice.message_intents.count
      assert_equal 5, practice.invoices.count
      assert_equal 3, practice.invoices.where(status: "posted").count
      assert_equal 1, practice.invoices.where(status: "draft").count
      assert_equal 1, practice.invoices.where(status: "void").count
      assert_equal BigDecimal("305.00"), Clinic::PaymentAllocation.where(practice: practice).sum(:amount)
      assert_equal 79, practice.appointments.count
      assert_equal 18, practice.encounters.count
      assert_equal 6, practice.encounters.open.count
      assert_equal 105, practice.observations.count
      assert_equal 12, practice.encounter_notes.where(note_kind: "soap").count
      assert_equal 11, Clinic::EncounterNoteRevision.where(practice: practice, revision_no: 2).count
      assert_equal 10, Clinic::EncounterNoteSignature.where(practice: practice).count
      assert practice.model_versions.exists?
      patient = practice.patients.order(:reference).first
      assert_match(/\A[^,]+, .+\z/, patient.display_name)
      assert_no_match(/\ASYN_/, patient.display_name)
      assert_match(/\ASYN-[A-Z]+-\d{3}\z/, patient.reference)
      assert patient.demographics
      assert_equal 2, patient.contacts.count
      assert patient.emergency_contacts.exists?
      assert patient.communication_preference
      assert patient.social_histories.exists?
      assert patient.primary_address_version
      assert_equal 7, patient.observations.where(value_kind: "numeric").count
      board_encounters = practice.encounters.open.includes(:patient, :room, appointment: :visit_type)
      scenarios = board_encounters.map { |encounter| Development::BackendSamples.tracking_board_scenario_for(encounter) }
      assert_equal Development::BackendSamples::BOARD_SCENARIOS.pluck(:stage).sort,
        scenarios.pluck(:stage).sort
      assert_equal Development::BackendSamples::BOARD_SCENARIOS.pluck(:reason).sort,
        scenarios.pluck(:reason).sort
      assert_equal 6, board_encounters.map { |encounter| encounter.room.code }.uniq.length
      assert board_encounters.all? { |encounter| encounter.started_at <= Time.current }

      %w[admin clinician staff inventory billing reader].each do |role|
        label = practice.name.last.downcase
        primary_suffix = Development::BackendSamples::LEGACY_ROLE_PERMISSIONS.key?(role) ? "" : "-1"
        expected_emails = [
          "synthetic-review-#{label}-#{role}#{primary_suffix}@example.invalid",
          "synthetic-review-#{label}-#{role}-2@example.invalid",
          "synthetic-review-#{label}-#{role}-inactive@example.invalid"
        ]
        identities = practice.memberships.joins(:user)
          .where(users: { email_address: expected_emails })
        assert_equal 3, identities.count, role
        assert_equal 2, identities.active.count, role
      end
      reader = practice.memberships.joins(:user).find_by!(users: { email_address: "synthetic-review-#{practice.name.last.downcase}-reader@example.invalid" })
      ability = Ability.new(reader.user, practice: practice)
      assert ability.can?(:read, practice.patients.first)
      assert ability.cannot?(:create, Clinic::Care::Patient)
      assert ability.cannot?(:read, (practices - [ practice ]).first.patients.first)
      %w[admin-2 inventory-1].each do |identity|
        operator = practice.memberships.joins(:user)
          .find_by!(users: { email_address: "synthetic-review-#{practice.name.last.downcase}-#{identity}@example.invalid" })
        operator_ability = Ability.new(operator.user, practice: practice)
        assert operator_ability.can?(:create, Clinic::Inventory::PurchaseOrder), identity
        assert operator.role_grants.active.joins(:role_version)
          .exists?(role_versions: { version: 3 }), identity
      end
      billing_operator = practice.memberships.joins(:user)
        .find_by!(users: { email_address: "synthetic-review-#{practice.name.last.downcase}-billing-1@example.invalid" })
      assert Ability.new(billing_operator.user, practice: practice).can?(:read, Clinic::Invoice)
      assert billing_operator.role_grants.active.joins(:role_version)
        .exists?(role_versions: { role_code: "synthetic-review-billing", version: 3 })
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

  test "an existing practice receives rich scenarios without changing its identity or edited fixtures" do
    user = User.create!(email_address: "existing-seed-owner@example.invalid", password: SecureRandom.hex(20))
    membership = Development::TestClinic.create!(user)
    practice = membership.practice

    assert_difference [ "User.count", "Clinic::Membership.count" ], 2 do
      Development::BackendSamples.populate_practice!(practice: practice, actor: user, label: "EXISTING")
    end

    rich_patients = practice.patients.where("reference LIKE ?", "SYN-EXISTING-%")
    assert_equal 30, rich_patients.count
    assert_equal [ "SYN_Mercer, Alex", "SYN_Vale, Briar" ],
      practice.patients.where(reference: %w[SYN-BASE-001 SYN-BASE-002]).order(:reference).pluck(:display_name)
    assert_equal 12, practice.encounter_notes.where(note_kind: "soap").count
    assert_equal 20, practice.patient_memberships.count
    assert_equal 3, practice.clinician_profiles.count
    assert_equal [ "Alex Rowan, NP", "Morgan Ellis, MD", "Riley Chen, DO" ], practice.clinician_profiles.order(:id).pluck(:display_name)
    assert_equal 105, practice.observations.where(value_kind: "numeric").count
    assert_equal 6, practice.encounters.open.count
    assert_equal 5, practice.invoices.count

    edited_patient = rich_patients.order(:reference).first
    edited_patient.update!(display_name: "Locally edited synthetic patient")
    edited_profile = practice.clinician_profiles.order(:id).first
    edited_profile.update!(display_name: "Locally edited clinician")
    counts = -> { ApplicationRecord.connection.tables.to_h { |table| [ table, ApplicationRecord.connection.select_value("SELECT COUNT(*) FROM #{ApplicationRecord.connection.quote_table_name(table)}") ] } }
    before = counts.call
    Development::BackendSamples.populate_practice!(practice: practice, actor: user, label: "EXISTING")

    assert_equal before, counts.call
    assert_equal "Locally edited synthetic patient", edited_patient.reload.display_name
    assert_equal "Locally edited clinician", edited_profile.reload.display_name
    assert_equal practice.id, user.reload.clinic_membership.practice_id

    completed = practice.encounters.open.order(:id).first
    Clinic::Scheduling::CloseEncounter.call(
      encounter: completed,
      actor: user,
      ended_at: completed.started_at + 30.minutes,
      request_key: "synthetic-test-close-#{completed.id}"
    )
    before_replacement = practice.encounters.count

    Development::BackendSamples.populate_practice!(practice: practice, actor: user, label: "EXISTING")

    assert_equal 6, practice.encounters.open.count
    assert_equal before_replacement + 1, practice.encounters.count
    assert_not practice.encounters.open.exists?(id: completed.id)
    replacement = practice.encounters.open.joins(appointment: :visit_type)
      .find_by!(patient: completed.patient, clinic_visit_types: { id: completed.appointment.visit_type_id })
    assert_operator replacement.started_at, :>, 12.hours.ago
    assert_equal "Locally edited synthetic patient", edited_patient.reload.display_name
  end

  test "a seeded board encounter uses the server-owned close time without discharge semantics" do
    user = User.create!(email_address: "seeded-board-close@example.invalid", password: SecureRandom.hex(20))
    membership = Development::TestClinic.create!(user)
    practice = membership.practice
    Development::BackendSamples.populate_practice!(practice: practice, actor: user, label: "SEEDED-CLOSE")

    encounter = practice.encounters.open.joins(appointment: :visit_type)
      .find_by!(clinic_visit_types: { code: "SYN-BOARD-ANNUAL" })
    started_at = encounter.started_at
    assert_operator started_at, :<=, Time.current

    closed = Clinic::Scheduling::CloseEncounter.call(
      encounter: encounter,
      actor: user,
      request_key: "synthetic-seeded-board-close"
    )

    assert_equal "completed", closed.status
    assert_operator closed.ended_at, :>, started_at
    assert_not closed.respond_to?(:discharged_at)
    assert_not closed.attributes.key?("discharged_at")
  end

  test "a second seed pass repairs legacy future vitals after an earlier encounter-only normalization" do
    user = User.create!(email_address: "future-board-owner@example.invalid", password: SecureRandom.hex(20))
    membership = Development::TestClinic.create!(user)
    practice = membership.practice
    Development::BackendSamples.populate_practice!(practice: practice, actor: user, label: "FUTURE-BOARD")

    encounter = practice.encounters.open.joins(appointment: :visit_type)
      .find_by!(clinic_visit_types: { code: "SYN-BOARD-MED-FOLLOW-UP" })
    prior_normalized_started_at = encounter.started_at
    prior_normalized_appointment_start = encounter.appointment.starts_at
    prior_normalized_appointment_end = encounter.appointment.ends_at
    future_started_at = 1.year.from_now.change(usec: 0)
    legacy_vitals = encounter.observations.where(code_system: "synthetic-vitals", code_version: "1").to_a
    assert legacy_vitals.present?
    legacy_vitals.each do |observation|
      observation.update!(
        observed_at: future_started_at + 10.minutes,
        recorded_at: future_started_at + 11.minutes
      )
    end
    encounter.update!(started_at: future_started_at)
    encounter.appointment.update!(starts_at: future_started_at, ends_at: future_started_at + 30.minutes)
    encounter.update!(started_at: prior_normalized_started_at)
    encounter.appointment.update!(
      starts_at: prior_normalized_appointment_start,
      ends_at: prior_normalized_appointment_end
    )
    assert_operator encounter.started_at, :<=, Time.current
    assert legacy_vitals.all? { |observation| observation.reload.observed_at > Time.current }

    original_receipt_ids = Development::BackendSamples.method(:seed_vital_receipt_resource_ids)
    Development::BackendSamples.define_singleton_method(:seed_vital_receipt_resource_ids) { |_| [] }
    begin
      Development::BackendSamples.populate_practice!(practice: practice, actor: user, label: "FUTURE-BOARD")
    ensure
      Development::BackendSamples.define_singleton_method(:seed_vital_receipt_resource_ids, original_receipt_ids)
      Development::BackendSamples.singleton_class.send(:private, :seed_vital_receipt_resource_ids)
    end

    encounter.reload
    assert_operator encounter.started_at, :<=, Time.current
    assert_operator encounter.appointment.reload.starts_at, :<=, Time.current
    displayed_vitals = legacy_vitals.map { |observation| Clinic::Care::ObservationSerializer.call(observation.reload) }
    displayed_vitals.each do |observation|
      assert_operator Time.iso8601(observation.fetch(:observed_at)), :<=, Time.current
      assert_operator Time.iso8601(observation.fetch(:recorded_at)), :<=, Time.current
    end
    summary = Clinic::Care::PatientCareSummarySerializer.call(encounter.patient, encounter: encounter, as_of: Time.current)
    summary.fetch(:reviews).each_value do |review|
      assert_operator Time.iso8601(review.fetch(:reviewed_at)), :<=, Time.current if review[:reviewed_at]
    end
    summary.fetch(:precautions).fetch(:items).each do |precaution|
      assert_operator Time.iso8601(precaution.fetch(:recorded_at)), :<=, Time.current
    end
    closed = Clinic::Scheduling::CloseEncounter.call(
      encounter: encounter,
      actor: user,
      request_key: "synthetic-future-board-close"
    )
    assert_equal "completed", closed.status
    assert_operator closed.ended_at, :>, closed.started_at
  end

  test "test clinic repairs only exact legacy managed patient labels" do
    user = User.create!(email_address: "managed-seed-owner@example.invalid", password: SecureRandom.hex(20))
    membership = Development::TestClinic.create!(user)
    practice = membership.practice
    managed = practice.patients.find_by!(reference: "SYN-BASE-001")
    edited = practice.patients.find_by!(reference: "SYN-BASE-002")
    managed.update!(display_name: "Sample Patient A", reference: "DEMO-001")
    edited.update!(display_name: "Locally edited patient", reference: "DEMO-002")

    Development::TestClinic.create!(user)

    assert_equal "SYN_Mercer, Alex", managed.reload.display_name
    assert_equal "SYN-BASE-001", managed.reference
    assert_equal "Locally edited patient", edited.reload.display_name
    assert_equal "DEMO-002", edited.reference
  end
end
