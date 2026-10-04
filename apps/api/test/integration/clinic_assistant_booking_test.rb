require "test_helper"

class ClinicAssistantBookingTest < ActionDispatch::IntegrationTest
  setup do
    travel_to Time.utc(2026, 10, 4, 8)
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @organization = Organization.create!(name: "Assistant test organization")
    @practice = Clinic::Practice.create!(organization: @organization, name: "Assistant test practice", timezone: "UTC")
    @actor = User.create!(email_address: "assistant-#{SecureRandom.hex(6)}@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "appointments.read", "appointments.book", "patients.identity.read")
    @site = @practice.sites.create!(code: "ASSISTANT", status: "active")
    @clinician = @practice.clinician_profiles.create!(membership: @membership, display_name: "Assistant Clinician")
    @visit_type = @practice.visit_types.create!(code: "ASSISTANT-VISIT")
    configure_site!(@site, membership: @membership)
    @patient = @practice.patients.create!(display_name: "Synthetic Assistant Patient", reference: "ASSISTANT-001")
    7.times do |weekday|
      Clinic::Scheduling::CapacityRule.create!(practice: @practice, site: @site, clinician: @clinician,
        kind: "weekly", weekday:, start_minute: 8 * 60, end_minute: 17 * 60, active: true)
    end
    login(@actor)
    get "/api/clinic/context", headers: @headers
    assert_response :success
  end

  teardown { travel_back }

  test "named availability requires an explicit proposal and returns the persisted receipt" do
    context = create_context
    selection = context.fetch("visit_types").sole.fetch("selection_id")
    clinician_selection = context.fetch("clinicians").sole.fetch("selection_id")

    post "/api/clinic/assistant/openings", params: {
      context_id: context.fetch("context_id"), visit_type_selection_id: selection,
      clinician_selection_id: clinician_selection, date: "2026-10-05"
    }, headers: csrf_headers, as: :json
    assert_response :success
    opening = response.parsed_body.fetch("openings").first
    assert opening
    assert opening.fetch("opening_id").present?
    assert_equal "Assistant Clinician", opening.fetch("clinician_name")
    assert_equal 0, @practice.appointments.count

    post "/api/clinic/assistant/proposals", params: {
      context_id: context.fetch("context_id"), opening_id: opening.fetch("opening_id")
    }, headers: csrf_headers, as: :json
    assert_response :created
    proposal = response.parsed_body
    assert_equal true, proposal.fetch("confirmation_required")
    assert_equal "pending", proposal.fetch("status")
    assert_equal 0, @practice.appointments.count

    post "/api/clinic/assistant/proposals/#{proposal.fetch("proposal_id")}/confirm",
      params: { context_id: context.fetch("context_id") }, headers: csrf_headers, as: :json
    assert_response :created
    receipt = response.parsed_body
    appointment = @practice.appointments.sole
    assert_equal @patient.display_name, receipt.dig("appointment", "patient")
    assert_equal appointment.starts_at.iso8601(6), Time.iso8601(receipt.dig("appointment", "starts_at")).utc.iso8601(6)
    assert_equal appointment.ends_at.iso8601(6), Time.iso8601(receipt.dig("appointment", "ends_at")).utc.iso8601(6)
    assert_equal appointment.status, receipt.dig("appointment", "status")

    get "/api/clinic/assistant/proposals/#{proposal.fetch("proposal_id")}", headers: @headers
    assert_response :success
    assert_equal receipt, response.parsed_body
    post "/api/clinic/assistant/proposals/#{proposal.fetch("proposal_id")}/confirm",
      params: { context_id: context.fetch("context_id") }, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "duplicate_submission", response.parsed_body.fetch("code")
    assert_equal 1, @practice.appointments.count

    actions = Clinic::AuditEvent.where(practice: @practice).pluck(:action_code)
    assert_includes actions, "assistant.availability.read"
    assert_includes actions, "assistant.booking.proposed"
    assert_includes actions, "assistant.booking.confirmed"
    assert_includes actions, "assistant.proposal.read"
    assert_includes actions, "assistant.booking.duplicate"
  end

  test "calendar-backed openings exclude past slots and patient conflicts" do
    travel_to Time.utc(2026, 10, 4, 9)
    context = create_context
    selection = context.fetch("visit_types").sole.fetch("selection_id")
    clinician_selection = context.fetch("clinicians").sole.fetch("selection_id")
    other_user = User.create!(email_address: "assistant-other-#{SecureRandom.hex(6)}@example.invalid", password: @password)
    other_membership = @practice.memberships.create!(user: other_user)
    other_clinician = @practice.clinician_profiles.create!(membership: other_membership, display_name: "Other Clinician")
    @practice.appointments.create!(patient: @patient, site: @site, booked_clinician: other_clinician,
      visit_type: @visit_type, starts_at: Time.utc(2026, 10, 4, 10), ends_at: Time.utc(2026, 10, 4, 10, 30),
      status: "scheduled", visit_modality: "in_person")

    post "/api/clinic/assistant/openings", params: {
      context_id: context.fetch("context_id"), visit_type_selection_id: selection,
      clinician_selection_id: clinician_selection, date: "2026-10-04"
    }, headers: csrf_headers, as: :json

    assert_response :success
    times = response.parsed_body.fetch("openings").pluck("starts_at").map { |value| Time.iso8601(value).utc }
    assert_not_includes times, Time.utc(2026, 10, 4, 9)
    assert_not_includes times, Time.utc(2026, 10, 4, 10)
  end

  test "scope invalidation clears pending proposals and prevents old-context reuse" do
    context = create_context
    opening = create_opening(context)
    post "/api/clinic/assistant/proposals", params: {
      context_id: context.fetch("context_id"), opening_id: opening.fetch("opening_id")
    }, headers: csrf_headers, as: :json
    assert_response :created
    proposal = Clinic::Assistant::BookingProposal.find_by!(public_id: response.parsed_body.fetch("proposal_id"))

    delete "/api/clinic/assistant/context", headers: csrf_headers
    assert_response :no_content
    assert_equal "invalidated", proposal.reload.status
    post "/api/clinic/assistant/proposals/#{proposal.public_id}/confirm",
      params: { context_id: context.fetch("context_id") }, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal 0, @practice.appointments.count
    assert Clinic::AuditEvent.where(practice: @practice, action_code: "assistant.context.invalidated").exists?
  end

  test "a context created in another member session cannot read this session's proposal" do
    context = create_context
    opening = create_opening(context)
    post "/api/clinic/assistant/proposals", params: {
      context_id: context.fetch("context_id"), opening_id: opening.fetch("opening_id")
    }, headers: csrf_headers, as: :json
    assert_response :created
    proposal_id = response.parsed_body.fetch("proposal_id")

    other_browser = ActionDispatch::Integration::Session.new(Rails.application)
    other_browser.host! "localhost:3000"
    other_headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    other_browser.get "/api/csrf", headers: other_headers
    other_headers = other_headers.merge("X-CSRF-Token" => other_browser.response.parsed_body.fetch("csrf_token"))
    other_browser.post "/api/session", params: { email_address: @actor.email_address, password: @password },
      headers: other_headers, as: :json
    assert_equal 200, other_browser.response.status
    other_browser.get "/api/clinic/assistant/proposals/#{proposal_id}",
      headers: { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    assert_equal 404, other_browser.response.status
    assert_equal 0, @practice.appointments.count
  end

  test "proposal input cannot replace its server-held site, patient, or exact booking arguments" do
    context = create_context
    opening = create_opening(context)

    post "/api/clinic/assistant/proposals", params: {
      context_id: context.fetch("context_id"), opening_id: opening.fetch("opening_id"),
      patient_id: @practice.patients.create!(display_name: "Other patient", reference: "ASSISTANT-002").id,
      site_id: @site.id, starts_at: "2026-10-06T12:00:00Z", practice_id: @practice.id
    }, headers: csrf_headers, as: :json

    assert_response :bad_request
    assert_equal 0, Clinic::Assistant::BookingProposal.where(practice: @practice).count
    assert_equal 0, @practice.appointments.count
  end

  test "an opening token from one patient context cannot be used in another context" do
    first_context = create_context
    opening = create_opening(first_context)
    other_patient = @practice.patients.create!(display_name: "Synthetic Other Patient", reference: "ASSISTANT-002")
    second_context = create_context(patient: other_patient)

    post "/api/clinic/assistant/proposals", params: {
      context_id: second_context.fetch("context_id"), opening_id: opening.fetch("opening_id")
    }, headers: csrf_headers, as: :json

    assert_response :not_found
    assert_equal 0, Clinic::Assistant::BookingProposal.where(practice: @practice).count
    assert_equal 0, @practice.appointments.count
  end

  test "booking authority denial is audited and does not create a proposal" do
    read_only_user = User.create!(email_address: "assistant-readonly-#{SecureRandom.hex(6)}@example.invalid", password: @password)
    read_only_membership = @practice.memberships.create!(user: read_only_user)
    grant_permissions!(read_only_membership, "appointments.read", "patients.identity.read", "facilities.read")
    login(read_only_user)
    get "/api/clinic/context", headers: @headers
    assert_response :success
    context = create_context
    opening = create_opening(context)

    post "/api/clinic/assistant/proposals", params: {
      context_id: context.fetch("context_id"), opening_id: opening.fetch("opening_id")
    }, headers: csrf_headers, as: :json

    assert_response :forbidden
    assert_equal 0, Clinic::Assistant::BookingProposal.where(practice: @practice).count
    assert Clinic::AuditEvent.where(practice: @practice, action_code: "assistant.action.denied", outcome: "denied").exists?
  end

  test "an opening that becomes occupied before confirmation is rejected" do
    context = create_context
    proposal_payload = create_proposal(context)
    proposal = Clinic::Assistant::BookingProposal.find_by!(public_id: proposal_payload.fetch("proposal_id"))
    other_patient = @practice.patients.create!(display_name: "Synthetic Concurrent Patient", reference: "ASSISTANT-003")
    Clinic::Scheduling::BookAppointment.call(practice: @practice, actor: @actor, patient: other_patient,
      site: @site, room: nil, booked_clinician: @clinician, visit_type: @visit_type,
      starts_at: proposal.starts_at, ends_at: proposal.ends_at, request_key: "assistant-external-collision")

    post "/api/clinic/assistant/proposals/#{proposal.public_id}/confirm",
      params: { context_id: context.fetch("context_id") }, headers: csrf_headers, as: :json

    assert_response :conflict
    assert_equal "stale_availability", response.parsed_body.fetch("code")
    assert_equal "conflicted", proposal.reload.status
    assert_equal 1, @practice.appointments.count
    assert Clinic::AuditEvent.where(practice: @practice, action_code: "assistant.booking.conflict").exists?
  end

  test "a patient record version change invalidates its pending proposal" do
    context = create_context
    proposal = create_proposal(context)
    @patient.update!(display_name: "Updated synthetic patient")

    post "/api/clinic/assistant/proposals/#{proposal.fetch("proposal_id")}/confirm",
      params: { context_id: context.fetch("context_id") }, headers: csrf_headers, as: :json

    assert_response :conflict
    assert_equal "stale_context", response.parsed_body.fetch("code")
    assert_equal "invalidated", Clinic::Assistant::BookingProposal.find_by!(public_id: proposal.fetch("proposal_id")).status
    assert_equal 0, @practice.appointments.count
  end

  test "required audit persistence failure rolls back the appointment write" do
    context = create_context
    proposal = create_proposal(context)
    original_record = Clinic::AuditRecorder.method(:record!)
    recorder = lambda do |**arguments|
      raise Clinic::AuditRecorder::Unavailable if arguments[:action_code] == "assistant.booking.confirmed"

      original_record.call(**arguments)
    end

    with_stubbed_method(Clinic::AuditRecorder, :record!, recorder) do
      post "/api/clinic/assistant/proposals/#{proposal.fetch("proposal_id")}/confirm",
        params: { context_id: context.fetch("context_id") }, headers: csrf_headers, as: :json
    end

    assert_response :service_unavailable
    assert_equal 0, @practice.appointments.count
    assert_equal "pending", Clinic::Assistant::BookingProposal.find_by!(public_id: proposal.fetch("proposal_id")).status
  end

  test "a provider result is discarded when the bound member session expires during the wait" do
    context = create_context
    selection = context.fetch("visit_types").sole.fetch("selection_id")
    clinician_selection = context.fetch("clinicians").sole.fetch("selection_id")
    member_session_id = Clinic::Assistant::Context.find_by!(public_id: context.fetch("context_id")).member_session_id
    fake_gateway = lambda do |**_arguments|
      MemberSession.find(member_session_id).destroy!
      { status: "intent", intent: { date: "2026-10-05", time: "09:00", duration_minutes: 30 } }
    end

    with_stubbed_method(Clinic::Assistant::ModelGateway, :call, fake_gateway) do
      post "/api/clinic/assistant/messages", params: {
        context_id: context.fetch("context_id"), message: "Tomorrow morning",
        visit_type_selection_id: selection, clinician_selection_id: clinician_selection
      }, headers: csrf_headers, as: :json
    end

    assert_response :conflict
    assert_equal "stale_context", response.parsed_body.fetch("code")
    assert_equal 0, @practice.appointments.count
    assert Clinic::AuditEvent.where(practice: @practice, action_code: "assistant.model.requested").exists?
    assert Clinic::AuditEvent.where(practice: @practice, action_code: "assistant.context.conflict").exists?
  end

  test "an expired booking proposal cannot be confirmed" do
    context = create_context
    proposal = create_proposal(context)
    Clinic::Assistant::BookingProposal.find_by!(public_id: proposal.fetch("proposal_id"))
      .update!(expires_at: 1.second.ago)

    post "/api/clinic/assistant/proposals/#{proposal.fetch("proposal_id")}/confirm",
      params: { context_id: context.fetch("context_id") }, headers: csrf_headers, as: :json

    assert_response :conflict
    assert_equal "proposal_expired", response.parsed_body.fetch("code")
    assert_equal "expired", Clinic::Assistant::BookingProposal.find_by!(public_id: proposal.fetch("proposal_id")).status
    assert_equal 0, @practice.appointments.count
    assert Clinic::AuditEvent.where(practice: @practice, action_code: "assistant.booking.expired").exists?
  end

  test "revoked booking authority invalidates the context before the scheduler is called" do
    context = create_context
    proposal = create_proposal(context)
    grant_permissions!(@membership, "roles.manage")
    booking_grant = permission_grant!(@membership, "appointments.book")
    Clinic::Authorization::RevokeAccess.call(grant: booking_grant, grantor: @actor)

    post "/api/clinic/assistant/proposals/#{proposal.fetch("proposal_id")}/confirm",
      params: { context_id: context.fetch("context_id") }, headers: csrf_headers, as: :json

    assert_response :conflict
    assert_equal "stale_context", response.parsed_body.fetch("code")
    assert_equal 0, @practice.appointments.count
    assert Clinic::AuditEvent.where(practice: @practice, action_code: "assistant.context.conflict").exists?
  end

  private

  def create_context(patient: @patient)
    post "/api/clinic/assistant/context", params: { patient_id: patient.id }, headers: csrf_headers, as: :json
    assert_response :created
    response.parsed_body
  end

  def create_opening(context)
    post "/api/clinic/assistant/openings", params: {
      context_id: context.fetch("context_id"),
      visit_type_selection_id: context.fetch("visit_types").sole.fetch("selection_id"),
      clinician_selection_id: context.fetch("clinicians").sole.fetch("selection_id"), date: "2026-10-05"
    }, headers: csrf_headers, as: :json
    assert_response :success
    response.parsed_body.fetch("openings").first
  end

  def create_proposal(context)
    opening = create_opening(context)
    post "/api/clinic/assistant/proposals", params: {
      context_id: context.fetch("context_id"), opening_id: opening.fetch("opening_id")
    }, headers: csrf_headers, as: :json
    assert_response :created
    response.parsed_body
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def login(user)
    post "/api/session", params: { email_address: user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  def with_stubbed_method(receiver, name, implementation)
    original = receiver.method(name)
    receiver.define_singleton_method(name) do |*args, **kwargs, &block|
      implementation.call(*args, **kwargs, &block)
    end
    yield
  ensure
    receiver.define_singleton_method(name, original) if original
  end
end
