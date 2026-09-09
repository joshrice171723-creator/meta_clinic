require "test_helper"

class ClinicRecordObservationTest < ActiveSupport::TestCase
  setup do
    @practice = Clinic::Practice.create!(name: "Synthetic Observation Seed Practice", timezone: "UTC")
    @patient = @practice.patients.create!(display_name: "Synthetic Observation Seed Patient", reference: "OBS-SEED")
    @user = User.create!(email_address: "observation-seed@example.invalid", password: SecureRandom.hex(18))
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "observations.write")
    @encounter = @practice.encounters.create!(patient: @patient, started_at: Time.current, status: "open")
  end

  test "repeated association-based recording is encounter-idempotent" do
    attributes = {
      encounter: @encounter, code: "synthetic-seed-vital", code_system: "synthetic", code_version: "1",
      value_kind: "numeric", numeric_value: "12.34", unit_code: "cm", observed_at: Time.current, recorded_at: Time.current
    }

    2.times do
      Clinic::Care::RecordObservation.call(practice: @practice, actor: @user, patient: @patient,
        attributes: attributes, request_key: "seed-vital-retry")
    end

    assert_equal 1, @patient.observations.where(encounter: @encounter, code: attributes[:code]).count
  end

  test "an identical retry returns the recorded observation and a changed payload conflicts" do
    attributes = observation_attributes
    first = Clinic::Care::RecordObservation.call(practice: @practice, actor: @user, patient: @patient,
      attributes: attributes, request_key: "observation-retry")
    second = Clinic::Care::RecordObservation.call(practice: @practice, actor: @user, patient: @patient,
      attributes: attributes, request_key: "observation-retry")

    assert_equal first.id, second.id
    receipt = Clinic::OperationReceipt.find_by!(practice: @practice, request_key: "observation-retry")
    assert_equal "Clinic::Care::Observation", receipt.resource_type
    assert_equal first.id, receipt.resource_id
    assert_not_includes receipt.attributes.to_json, attributes[:numeric_value].to_s
    assert_raises(Clinic::Idempotency::Conflict) do
      Clinic::Care::RecordObservation.call(practice: @practice, actor: @user, patient: @patient,
        attributes: attributes.merge(numeric_value: "12.35"), request_key: "observation-retry")
    end
    assert_equal 1, @patient.observations.where(encounter: @encounter).count
  end

  test "omitted recorded_at is assigned once and remains stable on retry" do
    attributes = observation_attributes.except(:recorded_at)
    first = Clinic::Care::RecordObservation.call(practice: @practice, actor: @user, patient: @patient,
      attributes: attributes, request_key: "observation-timestamp")
    recorded_at = first.recorded_at
    second = Clinic::Care::RecordObservation.call(practice: @practice, actor: @user, patient: @patient,
      attributes: attributes, request_key: "observation-timestamp")

    assert_equal recorded_at, second.recorded_at
    assert_equal 1, @patient.observations.where(encounter: @encounter).count
  end

  test "a permission revoked before the idempotency lock is denied with evidence" do
    grant = permission_grant!(@membership, "observations.write")
    original_lock = Clinic::Idempotency.method(:lock_request!)
    Clinic::Idempotency.define_singleton_method(:lock_request!) do |practice_id, membership_id, request_key|
      grant.update_columns(revoked_at: Time.current, revision: grant.revision + 1)
      original_lock.call(practice_id, membership_id, request_key)
    end

    assert_raises(Clinic::Authorization::Denied) do
      Clinic::Care::RecordObservation.call(practice: @practice, actor: @user, patient: @patient,
        attributes: observation_attributes, request_key: "observation-denied")
    end
    assert_not Clinic::OperationReceipt.exists?(practice: @practice, request_key: "observation-denied")
    assert @practice.audit_events.where(action_code: "observations.write", outcome: "denied").exists?
  ensure
    Clinic::Idempotency.define_singleton_method(:lock_request!, original_lock) if original_lock
  end

  test "site-scoped observation authorization is rechecked under the lock" do
    site = @practice.sites.create!(code: "OBS-SITE")
    @encounter.update!(site: site)
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "observations.write", scope_kind: "site", site: site)

    observation = Clinic::Care::RecordObservation.call(practice: @practice, actor: @user, patient: @patient,
      attributes: observation_attributes, request_key: "observation-site")

    assert_equal @encounter.id, observation.encounter_id
    assert_equal 1, @patient.observations.where(encounter: @encounter).count
  end

  test "a required commit audit failure rolls back the observation and receipt" do
    original_record = Clinic::AuditRecorder.method(:record!)
    Clinic::AuditRecorder.define_singleton_method(:record!) do |practice:, actor:, action_code:, **|
      raise Clinic::AuditRecorder::Unavailable if action_code == Clinic::Care::RecordObservation::OPERATION_CODE

      original_record.call(practice: practice, actor: actor, action_code: action_code, outcome: :denied)
    end

    assert_raises(Clinic::AuditRecorder::Unavailable) do
      Clinic::Care::RecordObservation.call(practice: @practice, actor: @user, patient: @patient,
        attributes: observation_attributes, request_key: "observation-audit-failure")
    end
    assert_empty @patient.observations
    assert_not Clinic::OperationReceipt.exists?(practice: @practice, request_key: "observation-audit-failure")
  ensure
    Clinic::AuditRecorder.define_singleton_method(:record!, original_record) if original_record
  end

  test "concurrent identical commands create one observation and receipt" do
    ready = Queue.new
    release = Queue.new
    outcomes = Queue.new
    attributes = observation_attributes
    threads = 2.times.map do
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          ready << true
          release.pop
          outcomes << Clinic::Care::RecordObservation.call(practice: @practice, actor: @user, patient: @patient,
            attributes: attributes, request_key: "observation-concurrent")
        end
      end
    end
    2.times { ready.pop }
    2.times { release << true }
    threads.each(&:join)

    results = 2.times.map { outcomes.pop }
    assert_equal 1, results.map(&:id).uniq.size
    assert_equal 1, @patient.observations.where(encounter: @encounter).count
    assert_equal 1, Clinic::OperationReceipt.where(practice: @practice, request_key: "observation-concurrent").count
  ensure
    threads&.each { |thread| thread.kill unless thread.stop? || !thread.alive? }
  end

  test "wrong patient, encounter and parent references cannot cross the practice binding" do
    foreign_practice = Clinic::Practice.create!(name: "Synthetic Foreign Observation Practice", timezone: "UTC")
    foreign_patient = foreign_practice.patients.create!(display_name: "Synthetic Foreign Patient", reference: "OBS-FOREIGN")
    foreign_encounter = foreign_practice.encounters.create!(patient: foreign_patient, started_at: Time.current, status: "open")

    assert_raises(ActiveRecord::RecordNotFound) do
      Clinic::Care::RecordObservation.call(practice: @practice, actor: @user, patient: foreign_patient,
        attributes: observation_attributes, request_key: "observation-foreign-patient")
    end
    assert_raises(ActiveRecord::RecordNotFound) do
      Clinic::Care::RecordObservation.call(practice: @practice, actor: @user, patient: @patient,
        attributes: observation_attributes.merge(encounter_id: foreign_encounter.id), request_key: "observation-foreign-encounter")
    end
    assert_raises(ActiveRecord::RecordNotFound) do
      Clinic::Care::RecordObservation.call(practice: @practice, actor: @user, patient: @patient,
        attributes: observation_attributes.merge(parent_observation_id: foreign_encounter.id), request_key: "observation-foreign-parent")
    end
  end

  private

  def observation_attributes
    {
      encounter: @encounter, code: "synthetic-observation", code_system: "synthetic", code_version: "1",
      value_kind: "numeric", numeric_value: "12.34", unit_code: "cm", observed_at: Time.current, recorded_at: Time.current
    }
  end
end
