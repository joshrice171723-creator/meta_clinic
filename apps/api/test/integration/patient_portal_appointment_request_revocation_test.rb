require "test_helper"

class PatientPortalAppointmentRequestRevocationTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    password = SecureRandom.hex(18)
    @practice = Clinic::Practice.create!(name: "Synthetic appointment request revocation", timezone: "UTC")
    @patient = @practice.patients.create!(display_name: "Synthetic portal appointment patient", reference: "APPT-REVOKE")
    @portal_user = User.create!(email_address: "portal-appt-revoke@example.invalid", password:)
    @staff = User.create!(email_address: "portal-appt-revoke-staff@example.invalid", password: SecureRandom.hex(18))
    membership = @practice.memberships.create!(user: @staff)
    grant_permissions!(membership, "patient_portal.identity.revoke", "facilities.write")
    @identity = Clinic::PatientPortal::Identity.create!(practice: @practice, patient: @patient, user: @portal_user,
      status: "active", invited_at: Time.current, activated_at: Time.current)
    @patient.patient_memberships.create!(practice: @practice, recorded_by_membership: membership,
      status: "member", version: 1, effective_from: 1.day.ago)
    @site = @practice.sites.create!(code: "APPT-REVOKE", status: "active")
    @visit_type = @practice.visit_types.create!(code: "Synthetic appointment request visit")
    Clinic::Configuration::PracticeFeatures.revise(practice: @practice, site: @site, actor: membership,
      request_key: "appointment-revocation-site-profile", expected_revision: 0, insurance_workflows_enabled: false,
      clinic_type: "primary_care", service_scope: [], assessment_scope: [], finalize: true)
    @starts_at = 2.days.from_now.change(usec: 0)
    post "/api/session", params: { email_address: @portal_user.email_address, password: }, headers: csrf_headers, as: :json
    assert_response :success
  end

  test "revocation after controller auth denies new appointment request without new work" do
    audits = request_audits
    assert_no_difference counters do
      revoke_after_normalization { submit("revoked-new") }
      assert_equal 404, response.status
      refute response.parsed_body.key?("appointment_request")
    end
    assert_equal audits, request_audits
    assert_revoked
  end

  test "revocation after controller auth denies exact appointment replay and preserves saved content" do
    submit("revoked-replay")
    assert_response :created
    saved = Clinic::PatientPortal::AppointmentRequest.find(response.parsed_body.dig("appointment_request", "id"))
    evidence = saved.attributes
    audits = request_audits
    assert_no_difference counters do
      revoke_after_normalization { submit("revoked-replay") }
      assert_equal 404, response.status
      refute response.parsed_body.key?("appointment_request")
    end
    assert_equal evidence, saved.reload.attributes
    assert_equal audits, request_audits
    assert_revoked
  end

  test "active appointment request creates exactly replays and rejects changed intent" do
    assert_no_difference -> { Clinic::Appointment.count } do
      assert_difference -> { Clinic::PatientPortal::AppointmentRequest.count }, 1 do
        submit("active-request")
        assert_response :created
        id = response.parsed_body.dig("appointment_request", "id")
        submit("active-request")
        assert_equal 200, response.status
        assert_equal id, response.parsed_body.dig("appointment_request", "id")
        submit("active-request", starts_at: (@starts_at + 1.hour).iso8601, ends_at: (@starts_at + 90.minutes).iso8601)
        assert_equal 409, response.status
        assert_equal "request_conflict", response.parsed_body.fetch("code")
      end
    end
  end

  test "active change requests preserve source and lock appointment before portal identity" do
    %w[cancel reschedule].each_with_index do |kind, index|
      source = create_source(@starts_at + (index + 1).days)
      evidence = source.attributes
      payload = change_payload("active-#{kind}", kind, source)
      locks = []
      subscriber = ->(_name, _start, _finish, _id, event) do
        locks << event.fetch(:sql) if event.fetch(:sql).include?("FOR UPDATE")
      end
      assert_difference -> { Clinic::PatientPortal::AppointmentRequest.count }, 1 do
        ActiveSupport::Notifications.subscribed(subscriber, "sql.active_record") { submit_payload(payload) }
        assert_response :created
        id = response.parsed_body.dig("appointment_request", "id")
        appointment_lock = locks.index { |sql| sql.include?('"clinic_appointments"') }
        identity_lock = locks.index { |sql| sql.include?('"clinic_patient_portal_identities"') }
        refute_nil appointment_lock
        refute_nil identity_lock
        assert_operator appointment_lock, :<, identity_lock
        submit_payload(payload)
        assert_equal 200, response.status
        assert_equal id, response.parsed_body.dig("appointment_request", "id")
      end
      assert_equal evidence, source.reload.attributes
    end
  end

  test "revocation denies saved cancellation replay without changing the source appointment" do
    source = create_source(@starts_at + 1.day)
    payload = change_payload("revoked-cancel", "cancel", source)
    submit_payload(payload)
    assert_response :created
    saved = Clinic::PatientPortal::AppointmentRequest.find(response.parsed_body.dig("appointment_request", "id"))
    request_evidence, source_evidence = saved.attributes, source.attributes
    assert_no_difference counters do
      revoke_after_normalization { submit_payload(payload) }
      assert_equal 404, response.status
      refute response.parsed_body.key?("appointment_request")
    end
    assert_equal request_evidence, saved.reload.attributes
    assert_equal source_evidence, source.reload.attributes
    assert_revoked
  end

  test "unique-conflict recovery rechecks current appointment request access before rendering" do
    submit("conflict-recovery")
    assert_response :created
    saved = Clinic::PatientPortal::AppointmentRequest.find(response.parsed_body.dig("appointment_request", "id"))
    evidence = saved.attributes
    original_lookup = Clinic::PatientPortal::AppointmentRequest.method(:find_by)
    lookups = 0
    lookup = ->(*arguments, **keywords) do
      lookups += 1
      lookups == 1 ? nil : original_lookup.call(*arguments, **keywords)
    end
    original_guard = Clinic::PatientPortal::RequestAccess.method(:authorize!)
    checks = 0
    guard = ->(**arguments) do
      checks += 1
      raise ActiveRecord::RecordNotFound, "Simulated current portal access denial" if checks == 2

      original_guard.call(**arguments)
    end
    conflict = ->(**_arguments) { raise ActiveRecord::RecordNotUnique }
    assert_no_difference counters do
      # Simulated insert conflict/second-guard denial; this is not concurrent
      # revocation evidence and does not abort PostgreSQL's outer test transaction.
      with_stubbed_singleton_method(Clinic::PatientPortal::AppointmentRequest, :find_by, lookup) do
        with_stubbed_singleton_method(Clinic::PatientPortal::AppointmentRequest, :create!, conflict) do
          with_stubbed_singleton_method(Clinic::PatientPortal::RequestAccess, :authorize!, guard) do
            submit("conflict-recovery")
            assert_equal 404, response.status
            refute response.parsed_body.key?("appointment_request")
          end
        end
      end
    end
    assert_equal 2, checks
    assert_equal evidence, saved.reload.attributes
    assert @identity.reload.active?
  end

  private

  def with_stubbed_singleton_method(target, method_name, implementation)
    singleton = target.singleton_class
    original = target.method(method_name)
    owned = singleton.instance_methods(false).include?(method_name)
    singleton.define_method(method_name) do |*arguments, **keywords, &block|
      implementation.call(*arguments, **keywords, &block)
    end
    yield
  ensure
    if owned
      singleton.define_method(method_name, original)
    else
      singleton.remove_method(method_name)
    end
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    assert_response :success
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def submit(key, **changes)
    payload = { request_key: key, starts_at: @starts_at.iso8601, ends_at: (@starts_at + 30.minutes).iso8601,
      site_id: @site.id, visit_type_id: @visit_type.id }.merge(changes)
    submit_payload(payload)
  end

  def submit_payload(payload)
    post "/api/patient_portal/appointment_requests", params: { appointment_request: payload }, headers: csrf_headers, as: :json
  end

  def create_source(starts_at)
    @practice.appointments.create!(patient: @patient, site: @site, visit_type: @visit_type,
      starts_at:, ends_at: starts_at + 30.minutes, status: "scheduled", visit_modality: "in_person")
  end

  def change_payload(key, kind, source)
    payload = { request_key: key, request_kind: kind, source_appointment_id: source.id,
      source_appointment_updated_at: source.updated_at.iso8601(6) }
    payload.merge!(starts_at: (source.starts_at + 1.hour).iso8601,
      ends_at: (source.ends_at + 1.hour).iso8601) if kind == "reschedule"
    payload
  end

  def revoke_after_normalization
    controller = Clinic::PatientPortal::AppointmentRequestsController
    original = controller.instance_method(:normalized_request)
    calls = 0
    revoke = ->(cached) do
      calls += 1
      assert cached.active?
      fresh = Clinic::PatientPortal::Identity.find(@identity.id)
      Clinic::PatientPortal::RevokeIdentity.call(identity: fresh, actor: @staff, reason: "Synthetic appointment access revocation")
      assert cached.active?, "The controller's independent cached identity remains stale"
    end
    controller.define_method(:normalized_request) do |input|
      normalized = original.bind_call(self, input)
      revoke.call(patient_portal_identity)
      normalized
    end
    controller.send(:private, :normalized_request)
    yield
    assert_equal 1, calls
  ensure
    if original
      controller.define_method(:normalized_request, original)
      controller.send(:private, :normalized_request)
    end
  end

  def counters
    [ -> { Clinic::PatientPortal::AppointmentRequest.count }, -> { Clinic::Appointment.count },
      -> { Clinic::ModelVersion.where(item_type: "Clinic::PatientPortal::AppointmentRequest").count } ]
  end

  def request_audits
    Clinic::AuditEvent.where(practice: @practice, action_code: "patient_portal.appointment_request.create").count
  end

  def assert_revoked
    assert @identity.reload.revoked?
    assert_empty @portal_user.member_sessions
  end
end
