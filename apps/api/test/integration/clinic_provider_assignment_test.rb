require "test_helper"

class ClinicProviderAssignmentTest < ActionDispatch::IntegrationTest
  setup do
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Synthetic Assignment Organization")
    @actor = User.create!(email_address: "assignment-actor@example.invalid", password: @password)
    provider_user = User.create!(email_address: "assignment-provider@example.invalid", password: SecureRandom.hex(18))
    @practice = Clinic::Practice.create!(name: "Synthetic Assignment Practice", organization: organization)
    @membership = @practice.memberships.create!(user: @actor)
    provider_membership = @practice.memberships.create!(user: provider_user)
    @site = @practice.sites.create!(code: "ASSIGN")
    department = @practice.departments.create!(code: "GENERAL")
    @profile = @practice.clinician_profiles.create!(membership: provider_membership, display_name: "Dr. Synthetic")
    @profile.assignments.create!(practice: @practice, department: department, site: @site, effective_from: 1.hour.ago)
    @patient = @practice.patients.create!(display_name: "SYN_Assignment, Avery", reference: "SYN-ASSIGN-001")
    @encounter = @practice.encounters.create!(patient: @patient, site: @site,
      started_at: 1.hour.ago, status: "open")
    grant_permissions!(@membership, "encounters.assign_provider")
  end

  test "requires expected token and nil means no current assignment" do
    assert_raises(ArgumentError) do
      Clinic::Scheduling::AssignProvider.call(encounter: @encounter, actor: @actor,
        clinician_profile: @profile, request_key: "missing-token", unassign: false)
    end

    result = assign(expected_token: nil, key: "assign-null")
    assert result[:participant].present?
    assert_equal result[:participant].id.to_s, result[:token]
  end

  test "HTTP assignment requires the expected token and accepts explicit null" do
    login
    post "/api/clinic/encounters/#{@encounter.id}/provider_assignment", params: {
      assignment: { patient_id: @patient.id, clinician_profile_id: @profile.id, request_key: "http-missing-token" }
    }, headers: csrf_headers, as: :json
    assert_response :bad_request
    assert_equal "expected_token", response.parsed_body.fetch("field")

    post "/api/clinic/encounters/#{@encounter.id}/provider_assignment", params: {
      assignment: { patient_id: @patient.id, clinician_profile_id: @profile.id, request_key: "http-null-token", expected_token: nil }
    }, headers: csrf_headers, as: :json
    assert_response :success
  end

  test "same provider with a fresh request key is a no-op" do
    first = assign(expected_token: nil, key: "assign-noop-first")
    second = assign(expected_token: first[:token], key: "assign-noop-second")
    assert_equal first[:token], second[:token]
    assert_equal 1, @encounter.participants.queue_providers.current.count
  end

  test "replay retains its committed token after reassignment" do
    first = assign(expected_token: nil, key: "assign-first")
    second_user = User.create!(email_address: "second-assignment-provider@example.invalid", password: SecureRandom.hex(18))
    second_membership = @practice.memberships.create!(user: second_user)
    second_profile = @practice.clinician_profiles.create!(membership: second_membership, display_name: "Second Synthetic")
    second_profile.assignments.create!(practice: @practice, department: @practice.departments.first, site: @site, effective_from: 1.hour.ago)
    second = assign_to(second_profile, key: "assign-second", expected_token: first[:token])
    assert_not_equal first[:token], second[:token]

    replay = assign(expected_token: nil, key: "assign-first")
    assert_equal first[:token], replay[:token]
  end

  test "explicit unassign closes the current row and replays a nil token" do
    assigned = assign(expected_token: nil, key: "assign-before-unassign")
    result = Clinic::Scheduling::AssignProvider.call(encounter: @encounter, actor: @actor,
      clinician_profile: nil, request_key: "assign-unassign", expected_token: assigned[:token], unassign: true)
    assert_nil result[:token]
    assert_not @encounter.participants.find(assigned[:participant].id).reload.effective_until.nil?

    replay = Clinic::Scheduling::AssignProvider.call(encounter: @encounter, actor: @actor,
      clinician_profile: nil, request_key: "assign-unassign", expected_token: assigned[:token], unassign: true)
    assert_nil replay[:token]
  end

  test "stale, completed, and ineligible assignments fail closed" do
    assigned = assign(expected_token: nil, key: "assign-stale")
    assert_raises(ActiveRecord::StaleObjectError) do
      assign(expected_token: nil, key: "assign-stale-new")
    end
    @encounter.update!(status: "completed", ended_at: Time.current)
    assert_raises(ArgumentError) do
      Clinic::Scheduling::AssignProvider.call(encounter: @encounter, actor: @actor, clinician_profile: @profile,
        request_key: "assign-completed", expected_token: assigned[:token])
    end
  end

  test "inactive and site-ineligible clinicians are rejected" do
    inactive_user = User.create!(email_address: "inactive-assignment@example.invalid", password: SecureRandom.hex(18))
    inactive_membership = @practice.memberships.create!(user: inactive_user, active: false)
    inactive_profile = @practice.clinician_profiles.create!(membership: inactive_membership, display_name: "Inactive Synthetic")
    assert_raises(ArgumentError) { assign_to(inactive_profile, key: "assign-inactive") }

    other_site = @practice.sites.create!(code: "OTHER-ASSIGN")
    department = @practice.departments.create!(code: "OTHER")
    site_user = User.create!(email_address: "other-site-assignment@example.invalid", password: SecureRandom.hex(18))
    site_profile = @practice.clinician_profiles.create!(membership: @practice.memberships.create!(user: site_user), display_name: "Other Site Synthetic")
    site_profile.assignments.create!(practice: @practice, department: department, site: other_site, effective_from: 1.hour.ago)
    assert_raises(ArgumentError) { assign_to(site_profile, key: "assign-other-site") }
  end

  test "missing permission and cross-practice clinician are rejected" do
    revoke_all_permissions!(@membership)
    assert_raises(Clinic::Authorization::Denied) { assign(expected_token: nil, key: "assign-denied") }

    grant_permissions!(@membership, "encounters.assign_provider")
    foreign_org = Organization.create!(name: "Synthetic Foreign Provider Organization")
    foreign_practice = Clinic::Practice.create!(name: "Synthetic Foreign Provider Practice", organization: foreign_org)
    foreign_user = User.create!(email_address: "foreign-provider-assignment@example.invalid", password: SecureRandom.hex(18))
    foreign_membership = foreign_practice.memberships.create!(user: foreign_user)
    foreign_profile = foreign_practice.clinician_profiles.create!(membership: foreign_membership, display_name: "Foreign Synthetic")
    assert_raises(ArgumentError) { assign_to(foreign_profile, key: "assign-foreign") }
  end

  test "database invariant prevents two current queue providers" do
    assign(expected_token: nil, key: "assign-invariant-first")
    assert_raises(ActiveRecord::RecordNotUnique) do
      @encounter.participants.create!(practice: @practice, patient: @patient, membership: @membership,
        participation_role: "queue_provider", effective_from: Time.current)
    end
  end

  test "audit failure rolls back participant and receipt" do
    original = Clinic::AuditRecorder.method(:record!)
    Clinic::AuditRecorder.define_singleton_method(:record!) { |**| raise Clinic::AuditRecorder::Unavailable }
    begin
      assert_raises(Clinic::AuditRecorder::Unavailable) { assign(expected_token: nil, key: "assign-audit-failure") }
    ensure
      Clinic::AuditRecorder.define_singleton_method(:record!, original)
    end
    assert_not @encounter.participants.exists?(participation_role: "queue_provider")
    assert_not Clinic::OperationReceipt.exists?(request_key: "assign-audit-failure")
  end

  test "tracking board projects current provider and bounded eligible site IDs" do
    foreign_org = Organization.create!(name: "Synthetic Foreign Assignment Organization")
    foreign_practice = Clinic::Practice.create!(name: "Synthetic Foreign Assignment Practice", organization: foreign_org)
    foreign_membership = foreign_practice.memberships.create!(user: User.create!(email_address: "foreign-assignment@example.invalid", password: SecureRandom.hex(18)))
    foreign_site = foreign_practice.sites.create!(code: "FOREIGN")
    foreign_department = foreign_practice.departments.create!(code: "GENERAL")
    foreign_profile = foreign_practice.clinician_profiles.create!(membership: foreign_membership, display_name: "Foreign Synthetic")
    foreign_profile.assignments.create!(practice: foreign_practice, department: foreign_department, site: foreign_site, effective_from: 1.hour.ago)
    result = assign(expected_token: nil, key: "assign-board")
    batch = Clinic::Scheduling::TrackingBoardSerializer.build_provider_batch(
      [ @encounter ], practice: @practice, as_of: Time.current
    )

    assert_equal({ clinician_profile_id: @profile.id, display_name: "Dr. Synthetic", token: result[:token] },
      batch.call(@encounter))
    assert_equal [ @site.id ], batch.eligible.sole.fetch(:site_ids)
    assert_equal @profile.id, batch.eligible.sole.fetch(:clinician_profile_id)
    assert_not_includes batch.eligible.map { |provider| provider.fetch(:clinician_profile_id) }, foreign_profile.id
  end

  private

  def assign(expected_token:, key:)
    Clinic::Scheduling::AssignProvider.call(encounter: @encounter, actor: @actor,
      clinician_profile: @profile, request_key: key, expected_token: expected_token)
  end

  def assign_to(profile, key:, expected_token: nil)
    Clinic::Scheduling::AssignProvider.call(encounter: @encounter, actor: @actor,
      clinician_profile: profile, request_key: key, expected_token: expected_token)
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def login
    post "/api/session", params: { email_address: @actor.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end
end
