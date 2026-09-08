require "test_helper"
require "digest"
require "json"

class TelehealthWorkflowTest < ActionDispatch::IntegrationTest
  TEST_API_KEY = "daily-test-api-key-that-must-stay-server-side".freeze
  TEST_ACCOUNT_REF = "daily-test-account".freeze
  PASSWORD = "Telehealth-test-password-123!".freeze

  setup do
    @rails_environment = Rails.env
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @environment = %w[
      APP_TELEHEALTH_ENABLED APP_TELEHEALTH_PROVIDER APP_TELEHEALTH_DAILY_ACCOUNT_REF
      APP_TELEHEALTH_DAILY_API_KEY APP_TELEHEALTH_DAILY_WEBHOOK_SECRET APP_DEVELOPMENT_LOGIN
      APP_TELEHEALTH_TWILIO_ACCOUNT_SID APP_TELEHEALTH_TWILIO_API_KEY_SID
      APP_TELEHEALTH_TWILIO_API_KEY_SECRET APP_TELEHEALTH_TWILIO_AUTH_TOKEN
      APP_TELEHEALTH_TWILIO_STATUS_CALLBACK_URL
    ].to_h { |key| [ key, ENV[key] ] }
    ENV.update(
      "APP_TELEHEALTH_ENABLED" => "true",
      "APP_TELEHEALTH_PROVIDER" => "daily",
      "APP_TELEHEALTH_DAILY_ACCOUNT_REF" => TEST_ACCOUNT_REF,
      "APP_TELEHEALTH_DAILY_API_KEY" => TEST_API_KEY,
      "APP_DEVELOPMENT_LOGIN" => "1"
    )
    ENV.delete("APP_TELEHEALTH_DAILY_WEBHOOK_SECRET")

    organization = Organization.create!(name: "Telehealth Workflow Organization")
    @practice = Clinic::Practice.create!(name: "Telehealth Workflow Practice", organization: organization)
    @staff = User.create!(email_address: "telehealth-host@example.invalid", password: PASSWORD)
    @membership = @practice.memberships.create!(user: @staff)
    grant_permissions!(@membership,
      "appointments.read", "appointments.book", "encounters.write", "telehealth.read",
      "telehealth.prepare.read", "telehealth.prepare.verify", "telehealth.host",
      "telehealth.participate", "telehealth.configure", "telehealth.reconcile", "scribe.write")
    @site = create_site!(@practice, "VIDEO-MAIN")
    @other_site = create_site!(@practice, "VIDEO-OTHER")
    @visit_type = @practice.visit_types.create!(code: "VIDEO-FOLLOW-UP")
    @patient = @practice.patients.create!(display_name: "Telehealth Patient", reference: "TH-001")
    @patient_user = User.create!(email_address: Development::TestAccounts::PROFILES.dig("patient", :email),
      password: Development::TestAccounts.send(:password_for, "patient"))
    @identity = Clinic::PatientPortal::Identity.create!(practice: @practice, patient: @patient,
      user: @patient_user, status: :active, invited_at: 1.day.ago, activated_at: 1.day.ago)
    @clinician = @practice.clinician_profiles.create!(membership: @membership,
      display_name: "Telehealth Clinician", reference: "TH-CLINICIAN")
    create_ready_configuration!
    login(@staff)
  end

  teardown do
    Rails.env = @rails_environment
    @environment.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
  end

  test "booking persists modality and creates a policy-bound video visit without reserving a physical room" do
    in_person = Clinic::Scheduling::BookAppointment.call(practice: @practice, actor: @staff,
      patient: @patient, site: @site, starts_at: 3.hours.from_now, ends_at: 4.hours.from_now,
      visit_type: @visit_type, request_key: "telehealth-book-in-person", visit_modality: "in_person")
    assert_equal "in_person", in_person.visit_modality
    assert_nil in_person.telehealth_visit

    appointment = book_video!(starts_at: 5.hours.from_now)
    visit = appointment.telehealth_visit
    assert_equal "video", appointment.visit_modality
    assert_nil appointment.room_id
    assert_equal @setting.active_policy_version_id, visit.policy_version_id
    assert_equal [ "clinician", "patient" ], visit.participants.order(:role).pluck(:role)
    assert_equal @identity.id, visit.participants.patient.sole.portal_identity_id
    assert_equal @membership.id, visit.participants.clinician.sole.membership_id

    get "/api/clinic/telehealth/booking_options", headers: @headers
    assert_response :success
    assert_equal true, response.parsed_body.dig("data", "enabled")
    assert_equal %w[in_person video], response.parsed_body.dig("data", "allowed_modalities")
    assert_equal [ { "visit_type_id" => @visit_type.id, "site_id" => @site.id, "enabled" => true } ],
      response.parsed_body.dig("data", "visit_type_rules")
    assert_not_includes response.body, TEST_ACCOUNT_REF
    assert_not_includes response.body, TEST_API_KEY

    physical_room = @practice.rooms.create!(site: @site, code: "VIDEO-FORBIDDEN")
    assert_raises(ArgumentError) do
      Clinic::Scheduling::BookAppointment.call(practice: @practice, actor: @staff,
        patient: @patient, site: @site, room: physical_room, booked_clinician: @clinician,
        visit_type: @visit_type, starts_at: 7.hours.from_now, ends_at: 8.hours.from_now,
        visit_modality: "video")
    end
  end

  test "settings publish retires the prior snapshot exposes server-owned options and freezes published content" do
    old_policy = @setting.active_policy_version
    Clinic::Telehealth::SaveSettingsDraft.call(practice: @practice, actor: @staff,
      request_key: "telehealth-settings-draft-v2", expected_version: @setting.lock_version,
      settings: { provider_account_ref: TEST_ACCOUNT_REF, enabled: true },
      policy: policy_payload(consent_title: "Updated video consent"),
      visit_type_rules: [ { visit_type_id: @visit_type.id, site_id: @site.id, enabled: true,
        allowed_region_codes: [ "tx", "TX" ] } ])
    @setting.reload
    draft = @setting.policy_versions.draft.sole
    assert_equal [ "TX" ], Clinic::Telehealth::VisitTypeRule.find_by!(practice: @practice,
      site_id: @site.id).allowed_region_codes

    published = Clinic::Telehealth::PublishSettings.call(practice: @practice, actor: @staff,
      request_key: "telehealth-settings-publish-v2", expected_version: @setting.lock_version,
      draft_version: draft.version)
    assert_predicate published, :published?
    assert_predicate old_policy.reload, :retired?
    assert_equal published.id, @setting.reload.active_policy_version_id
    assert_equal 2, published.version
    assert published.versions.exists?

    assert_raises(ActiveRecord::StatementInvalid) do
      Clinic::Telehealth::PolicyVersion.transaction(requires_new: true) do
        published.update_column(:consent_body, "Changed after publication")
      end
    end

    get "/api/clinic/telehealth/settings", headers: @headers
    assert_response :success
    assert_equal [ { "id" => @visit_type.id, "name" => @visit_type.code } ],
      response.parsed_body.dig("data", "options", "visit_types")
    assert_equal [ @site.id, @other_site.id ].sort,
      response.parsed_body.dig("data", "options", "sites").pluck("id").sort
    next_draft = response.parsed_body.dig("data", "draft")
    assert_equal published.version + 1, next_draft.fetch("version")
    assert_equal "Updated video consent", next_draft.fetch("consent_title")
    assert_equal "I consent to care by live video.", next_draft.fetch("consent_body")
    assert_not next_draft.key?("content_digest")
    assert_not next_draft.key?("scribe_consent_digest")
    assert_empty @setting.policy_versions.draft
    assert_not_includes response.body, TEST_API_KEY
  end

  test "legacy appointment requests without modality remain reviewable without rewriting their history" do
    request = Clinic::PatientPortal::AppointmentRequest.create!(practice: @practice,
      patient: @patient, identity: @identity, request_key: "legacy-request-without-modality",
      request_kind: "new_booking", starts_at: 2.days.from_now, ends_at: 2.days.from_now + 1.hour,
      site: @site, visit_type: @visit_type, requested_at: Time.current, status: "pending",
      requested_modality: nil)

    assert_nil request.reload.requested_modality
    request.update!(status: "declined", reviewed_by_membership: @membership,
      reviewed_at: Time.current, review_note: "No availability")
    assert_predicate request.reload, :declined?
    assert_nil request.requested_modality
  end

  test "patient preparation keeps treatment and recording consent separate and admission requires verification" do
    visit = book_video!(starts_at: 10.minutes.from_now).telehealth_visit
    room = ready_room!(visit)
    patient = visit.participants.patient.sole
    version = visit.reload.lock_version

    checkin = Clinic::Telehealth::SubmitCheckin.call(visit: visit, identity: @identity,
      request_key: "telehealth-checkin", expected_version: version, checkin: complete_checkin)
    version = visit.reload.lock_version
    Clinic::Telehealth::RecordConsent.call(visit: visit, identity: @identity,
      request_key: "telehealth-treatment-consent", expected_version: version,
      policy_version: visit.policy_version.version, decision: "accepted", purpose: "telehealth")
    Clinic::Telehealth::RecordConsent.call(visit: visit, identity: @identity,
      request_key: "telehealth-recording-consent", expected_version: version,
      policy_version: visit.policy_version.version, decision: "accepted", purpose: "scribe_recording")
    Clinic::Telehealth::EnterWaitingRoom.call(visit: visit, identity: @identity,
      request_key: "telehealth-enter-waiting", expected_version: version)

    preparation = Clinic::Telehealth::CurrentPreparation.call(visit: visit)
    assert preparation[:complete]
    assert_not preparation[:verified]
    assert_equal %w[scribe_recording telehealth], visit.consents.order(:purpose).pluck(:purpose)
    assert_equal visit.policy_version.content_digest,
      visit.consents.find_by!(purpose: "telehealth").policy_content_digest
    assert_equal visit.policy_version.scribe_consent_digest,
      visit.consents.find_by!(purpose: "scribe_recording").policy_content_digest
    error = assert_raises(Clinic::Telehealth::Error) do
      Clinic::Telehealth::AdmitParticipant.call(visit: visit, participant: patient, actor: @staff,
        request_key: "telehealth-admit-too-early", expected_version: visit.reload.lock_version)
    end
    assert_equal "preparation_not_verified", error.code

    Clinic::Telehealth::VerifyPreparation.call(visit: visit, actor: @staff,
      request_key: "telehealth-verify-preparation", checkin_id: checkin.id,
      expected_version: visit.reload.lock_version)
    Clinic::Telehealth::AdmitParticipant.call(visit: visit, participant: patient.reload, actor: @staff,
      request_key: "telehealth-admit-patient", expected_version: visit.reload.lock_version)
    assert_predicate patient.reload, :admitted?
    assert_equal checkin.id, patient.admitted_checkin_id
    assert_predicate visit.reload, :in_progress?
    assert_predicate room.reload, :ready?

    treatment_consent = visit.consents.find_by!(purpose: "telehealth")
    assert_raises(ActiveRecord::StatementInvalid) do
      Clinic::Telehealth::Consent.transaction(requires_new: true) do
        treatment_consent.update_column(:decision, "withdrawn")
      end
    end
  end

  test "patient HTTP preparation contract resumes through device consent and explicit waiting entry" do
    visit = book_video!(starts_at: 10.minutes.from_now).telehealth_visit
    login_patient

    get "/api/patient_portal/telehealth/visits/#{visit.public_id}", headers: @headers
    assert_response :success
    initial = response.parsed_body
    assert_equal({ "id" => @patient.id, "display_name" => @patient.display_name },
      initial.dig("data", "appointment", "patient"))
    assert_equal @site.id, initial.dig("data", "appointment", "site_id")
    assert_equal @membership.id, initial.dig("data", "appointment", "clinician_membership_id")
    assert_equal({ "membership_id" => @membership.id, "display_name" => @clinician.display_name },
      initial.dig("data", "appointment", "clinician"))
    assert_equal true, initial.dig("data", "policy", "require_location")
    assert_equal true, initial.dig("data", "policy", "require_callback")
    assert_equal "visit", initial.dig("data", "current_step")
    initial_version = initial.fetch("version")

    missing_postal = complete_checkin
    missing_postal[:location].delete(:postal_code)
    post "/api/patient_portal/telehealth/visits/#{visit.public_id}/checkins",
      params: { request_key: "patient-http-missing-postal", expected_version: initial_version,
        checkin: missing_postal }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal "location_required", response.parsed_body.fetch("code")
    assert_equal "location", response.parsed_body.fetch("field")
    assert_equal initial_version, visit.reload.lock_version

    unchecked = complete_checkin
    unchecked[:location].delete(:unit)
    unchecked[:device_results].merge!(camera: "not_checked", microphone: "not_checked",
      speaker: "not_checked", browser: "unknown")
    post "/api/patient_portal/telehealth/visits/#{visit.public_id}/checkins",
      params: { request_key: "patient-http-initial-checkin", expected_version: initial_version,
        checkin: unchecked }, headers: csrf_headers, as: :json
    assert_response :created
    after_checkin = response.parsed_body
    assert_operator after_checkin.fetch("version"), :>, initial_version
    assert_equal "device_check", after_checkin.dig("data", "visit", "current_step")
    assert_nil after_checkin.dig("data", "visit", "preparation", "location", "unit")

    post "/api/patient_portal/telehealth/visits/#{visit.public_id}/checkins",
      params: { request_key: "patient-http-stale-checkin", expected_version: initial_version,
        checkin: complete_checkin }, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "stale_record", response.parsed_body.fetch("code")

    checkin_version = after_checkin.fetch("version")
    post "/api/patient_portal/telehealth/visits/#{visit.public_id}/checkins",
      params: { request_key: "patient-http-device-check", expected_version: checkin_version,
        checkin: complete_checkin }, headers: csrf_headers, as: :json
    assert_response :created
    after_devices = response.parsed_body
    assert_operator after_devices.fetch("version"), :>, checkin_version
    assert_equal "consent", after_devices.dig("data", "visit", "current_step")

    post "/api/patient_portal/telehealth/visits/#{visit.public_id}/consents",
      params: { request_key: "patient-http-consent", expected_version: after_devices.fetch("version"),
        consent: { policy_version: visit.policy_version.version, decision: "accepted" } },
      headers: csrf_headers, as: :json
    assert_response :created
    after_consent = response.parsed_body
    assert_equal "consent", after_consent.dig("data", "visit", "current_step")
    assert_includes after_consent.fetch("allowed_actions"), "telehealth.enter_waiting_room"

    post "/api/patient_portal/telehealth/visits/#{visit.public_id}/enter_waiting_room",
      params: { request_key: "patient-http-enter-waiting", expected_version: after_consent.fetch("version"),
        consent: { policy_version: visit.policy_version.version, decision: "accepted" } },
      headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "waiting_room", response.parsed_body.dig("data", "visit", "current_step")
    assert_equal "waiting", response.parsed_body.dig("data", "visit", "access_state")
  end

  test "patient HTTP checkin permits omitted location and callback only when the bound policy makes them optional" do
    optional_policy = @setting.policy_versions.create!(practice: @practice, version: 2, status: "published",
      **policy_payload.merge(require_location: false, require_callback: false,
        consent_title: "Optional preparation policy",
        content_digest: Digest::SHA256.hexdigest("optional-preparation-policy")),
      created_by_membership: @membership, published_by_membership: @membership, published_at: Time.current)
    appointment = @practice.appointments.create!(patient: @patient, site: @site,
      booked_clinician: @clinician, visit_type: @visit_type, starts_at: 10.minutes.from_now,
      ends_at: 40.minutes.from_now, status: "scheduled", visit_modality: "video")
    visit = Clinic::Telehealth::Visit.create!(practice: @practice, patient: @patient, appointment: appointment,
      policy_version: optional_policy, created_by_membership: @membership, status: "scheduled")
    visit.participants.create!(practice: @practice, role: "patient", portal_identity: @identity, status: "eligible")
    visit.participants.create!(practice: @practice, role: "clinician", membership: @membership, status: "eligible")
    login_patient

    get "/api/patient_portal/telehealth/visits/#{visit.public_id}", headers: @headers
    assert_response :success
    assert_equal false, response.parsed_body.dig("data", "policy", "require_location")
    assert_equal false, response.parsed_body.dig("data", "policy", "require_callback")
    version = response.parsed_body.fetch("version")
    post "/api/patient_portal/telehealth/visits/#{visit.public_id}/checkins",
      params: { request_key: "patient-http-optional-preparation", expected_version: version,
        checkin: { location_attested: false, device_results: complete_checkin.fetch(:device_results) } },
      headers: csrf_headers, as: :json
    assert_response :created
    payload = response.parsed_body.dig("data", "visit")
    assert_nil payload.dig("preparation", "location")
    assert_nil payload.dig("preparation", "callback_phone")
    assert_equal "consent", payload.fetch("current_step")
  end

  test "material patient checkin change fences admission grants Scribe capture and queues ejection" do
    visit = book_video!(starts_at: 10.minutes.from_now).telehealth_visit
    room = ready_room!(visit)
    patient = visit.participants.patient.sole
    original = Clinic::Telehealth::SubmitCheckin.call(visit: visit, identity: @identity,
      request_key: "material-change-original", expected_version: visit.reload.lock_version,
      checkin: complete_checkin)
    Clinic::Telehealth::RecordConsent.call(visit: visit, identity: @identity,
      request_key: "material-change-consent", expected_version: visit.reload.lock_version,
      policy_version: visit.policy_version.version, decision: "accepted")
    Clinic::Telehealth::EnterWaitingRoom.call(visit: visit, identity: @identity,
      request_key: "material-change-wait", expected_version: visit.reload.lock_version)
    Clinic::Telehealth::VerifyPreparation.call(visit: visit, actor: @staff,
      request_key: "material-change-verify", checkin_id: original.id,
      expected_version: visit.reload.lock_version)
    Clinic::Telehealth::AdmitParticipant.call(visit: visit, participant: patient, actor: @staff,
      request_key: "material-change-admit", expected_version: visit.reload.lock_version)
    grant = create_join_grant!(visit: visit, participant: patient, room: room, token: "material-change-grant")
    owner = visit.participants.clinician.sole
    visit.reload.update!(scribe_capture_owner_participant: owner,
      scribe_capture_owner_token_digest: Digest::SHA256.hexdigest("material-change-capture"),
      scribe_capture_epoch: 5, scribe_capture_lease_expires_at: 1.minute.from_now)
    expected_version = visit.reload.lock_version
    login_patient

    changed = complete_checkin
    changed[:callback_phone] = "+15555550199"
    post "/api/patient_portal/telehealth/visits/#{visit.public_id}/checkins",
      params: { request_key: "material-change-http", expected_version: expected_version, checkin: changed },
      headers: csrf_headers, as: :json
    assert_response :created
    assert_operator response.parsed_body.fetch("version"), :>, expected_version
    assert_equal "waiting_room", response.parsed_body.dig("data", "visit", "current_step")
    assert_equal original.id, visit.checkins.order(sequence: :desc).first.supersedes_checkin_id
    assert_not Clinic::Telehealth::CurrentPreparation.call(visit: visit.reload).fetch(:verified)
    assert_predicate patient.reload, :waiting?
    assert_nil patient.admitted_at
    assert_nil patient.admitted_generation
    assert_nil patient.admitted_checkin_id
    assert_equal "preparation_changed", grant.reload.revocation_reason
    assert_nil visit.reload.scribe_capture_owner_participant_id
    assert_nil visit.scribe_capture_owner_token_digest
    assert_nil visit.scribe_capture_lease_expires_at
    assert_equal 6, visit.scribe_capture_epoch
    eject = visit.commands.find_by!(kind: "eject_participant", participant_id: patient.id,
      room_attempt_id: room.id, status: "pending")
    assert_equal visit.access_generation, eject.access_generation
  end

  test "tenant patient and site boundaries deny forged visit access" do
    other_practice, other_staff, other_membership, other_patient, other_identity, other_visit = build_foreign_visit!
    assert_raises(Clinic::Telehealth::Error) do
      Clinic::Telehealth::AccessPolicy.authorize!(actor_context: { actor: @staff, practice: @practice },
        visit: other_visit, action: :read)
    end
    assert_raises(Clinic::Authorization::Denied) do
      Clinic::Telehealth::SubmitCheckin.call(visit: other_visit, identity: @identity,
        request_key: "telehealth-forged-patient", expected_version: other_visit.lock_version,
        checkin: complete_checkin)
    end

    site_reader = User.create!(email_address: "telehealth-site-reader@example.invalid", password: PASSWORD)
    site_membership = @practice.memberships.create!(user: site_reader)
    grant_permissions!(site_membership, "telehealth.read", scope_kind: "site", site: @site)
    other_site_visit = direct_video_visit!(site: @other_site)
    assert_raises(Clinic::Authorization::Denied) do
      Clinic::Telehealth::AccessPolicy.authorize!(actor_context: { actor: site_reader, practice: @practice },
        visit: other_site_visit, action: :read)
    end

    get "/api/clinic/telehealth/visits/#{other_visit.public_id}", headers: @headers
    assert_response :not_found
    assert_equal({ "error" => "Not found." }, response.parsed_body)
    assert_equal other_practice.id, other_membership.practice_id
    assert_equal other_patient.id, other_identity.patient_id
    assert_equal other_staff.id, other_membership.user_id
  end

  test "Daily meeting token uses REST authorization without leaking the API key or token ejection fields" do
    visit = book_video!(starts_at: 20.minutes.from_now).telehealth_visit
    participant = visit.participants.clinician.sole
    captured = []
    response_object = Struct.new(:code, :body).new("200", JSON.generate(token: "opaque-daily-token"))
    fake_http = Object.new
    fake_http.define_singleton_method(:request) do |request|
      captured << request
      response_object
    end
    starter = lambda do |*_args, **_kwargs, &block|
      block.call(fake_http)
    end

    token = with_stubbed_singleton_method(Net::HTTP, :start, starter) do
      Clinic::Telehealth::Providers::Daily.issue_join_token(room_name: "apply_test_room",
        participant: participant, expires_at: 2.minutes.from_now, owner: true, allow_screen_share: true)
    end
    request = captured.sole
    body = JSON.parse(request.body)
    assert_equal "opaque-daily-token", token
    assert_equal "/v1/meeting-tokens", request.path
    assert_equal "Bearer #{TEST_API_KEY}", request["Authorization"]
    assert_equal participant.provider_subject_id, body.dig("properties", "user_id")
    assert_equal true, body.dig("properties", "is_owner")
    assert_equal true, body.dig("properties", "enable_screenshare")
    assert_not body.fetch("properties").key?("eject_at_token_exp")
    assert_not_includes request.body, TEST_API_KEY
    assert_not_includes token, TEST_API_KEY

    room = ready_room!(visit)
    assistant_user = User.create!(email_address: "telehealth-assistant@example.invalid", password: PASSWORD)
    assistant_membership = @practice.memberships.create!(user: assistant_user)
    grant_permissions!(assistant_membership, "telehealth.participate", scope_kind: "site", site: @site)
    assistant = visit.participants.create!(practice: @practice, membership: assistant_membership,
      role: "assistant", status: "admitted", admitted_at: Time.current,
      admitted_by_membership: @membership, admitted_generation: visit.access_generation)
    issued_arguments = nil
    fake_issuer = lambda do |**arguments|
      issued_arguments = arguments
      "assistant-provider-token"
    end
    with_stubbed_singleton_method(Clinic::Telehealth::Providers::Daily, :issue_join_token, fake_issuer) do
      Clinic::Telehealth::IssueJoinGrant.call(visit: visit, participant: assistant, actor: assistant_user,
        request_key: "telehealth-assistant-grant", expected_version: visit.reload.lock_version)
    end
    assert_equal false, issued_arguments.fetch(:owner)
    assert_equal false, issued_arguments.fetch(:allow_screen_share)
    assert_equal room.provider_room_name, issued_arguments.fetch(:room_name)
  end

  test "request parameter filtering redacts preparation location callback room URLs and all token keys" do
    filter = ActiveSupport::ParameterFilter.new(Rails.application.config.filter_parameters)
    values = filter.filter(
      "location" => { "address_line1" => "100 Private Way", "region_code" => "TX" },
      "callback_phone" => "+15555550101",
      "room_url" => "https://private-room.example.invalid/secret",
      "owner_token" => "one-use-capture-token",
      "join_token" => "one-use-join-token"
    )
    %w[location callback_phone room_url owner_token join_token].each do |key|
      assert_equal "[FILTERED]", values.fetch(key)
    end
  end

  test "Daily presence rejects malformed success and never proves ejection from incomplete participant identities" do
    malformed = Struct.new(:code, :body).new("200", "{}")
    malformed_http = Object.new
    malformed_http.define_singleton_method(:request) { |_request| malformed }
    malformed_start = lambda { |*_args, **_kwargs, &block| block.call(malformed_http) }
    assert_raises(Clinic::Telehealth::Providers::Daily::Unavailable) do
      with_stubbed_singleton_method(Net::HTTP, :start, malformed_start) do
        Clinic::Telehealth::Providers::Daily.room_presence(name: "apply_presence_test")
      end
    end

    fractional = Struct.new(:code, :body).new("200", JSON.generate(total_count: 0.4, data: []))
    fractional_http = Object.new
    fractional_http.define_singleton_method(:request) { |_request| fractional }
    fractional_start = lambda { |*_args, **_kwargs, &block| block.call(fractional_http) }
    assert_raises(Clinic::Telehealth::Providers::Daily::Unavailable) do
      with_stubbed_singleton_method(Net::HTTP, :start, fractional_start) do
        Clinic::Telehealth::Providers::Daily.room_presence(name: "apply_presence_test")
      end
    end

    empty = Struct.new(:code, :body).new("200", JSON.generate(total_count: 0, data: []))
    empty_http = Object.new
    empty_http.define_singleton_method(:request) { |_request| empty }
    empty_start = lambda { |*_args, **_kwargs, &block| block.call(empty_http) }
    empty_presence = with_stubbed_singleton_method(Net::HTTP, :start, empty_start) do
      Clinic::Telehealth::Providers::Daily.room_presence(name: "apply_presence_test")
    end
    assert_equal true, empty_presence.fetch(:confirmed)
    assert_equal true, empty_presence.fetch(:participant_identifiers_complete)

    partial = Struct.new(:code, :body).new("200", JSON.generate(
      total_count: 2, data: [ { userId: "known-subject" } ]
    ))
    partial_http = Object.new
    partial_http.define_singleton_method(:request) { |_request| partial }
    partial_start = lambda { |*_args, **_kwargs, &block| block.call(partial_http) }
    presence = with_stubbed_singleton_method(Net::HTTP, :start, partial_start) do
      Clinic::Telehealth::Providers::Daily.room_presence(name: "apply_presence_test")
    end
    assert_equal 2, presence.fetch(:total_count)
    assert_equal false, presence.fetch(:participant_identifiers_complete)

    visit = book_video!(starts_at: 20.minutes.from_now).telehealth_visit
    room = ready_room!(visit)
    participant = visit.participants.clinician.sole
    command = visit.commands.create!(practice: @practice, room_attempt: room, participant: participant,
      kind: "eject_participant", dedupe_key: "presence-incomplete-eject",
      access_generation: visit.access_generation, status: "unknown", available_at: Time.current,
      completed_at: Time.current, last_error_code: "provider_operation_unsupported")
    Clinic::Telehealth::ReconcileRoom.reconcile_ejections!(room,
      presence.merge(presence_confirmed: true, provider_subject_ids: [ "known-subject" ],
        presence_identifiers_complete: false))
    assert_predicate command.reload, :unknown?

    missing_identifier = presence.merge(total_count: 1, provider_subject_ids: [],
      participant_identifiers_complete: false)
    Clinic::Telehealth::ReconcileRoom.reconcile_ejections!(room,
      missing_identifier.merge(presence_confirmed: true))
    assert_predicate command.reload, :unknown?
  end

  test "ending remains pending after provider acknowledgement and room absence until empty presence proves media ended" do
    visit = book_video!(starts_at: 20.minutes.from_now).telehealth_visit
    room = ready_room!(visit)
    command = Clinic::Telehealth::EndVisit.call(visit: visit, actor: @staff,
      request_key: "telehealth-end", expected_version: visit.reload.lock_version)
    assert_predicate visit.reload, :ending?
    assert_predicate room.reload, :ending?

    lease = Clinic::Telehealth::DispatchCommand.claim(command)
    with_stubbed_singleton_method(Clinic::Telehealth::Providers::Daily, :end_room, ->(**) { {} }) do
      Clinic::Telehealth::DispatchCommand.call(command: command, lease_token: lease)
    end
    assert_predicate command.reload, :succeeded?
    assert_predicate visit.reload, :ending?
    assert_predicate room.reload, :ending?

    Clinic::Telehealth::ReconcileRoom.apply_snapshot!(visit: visit.reload, room_attempt: room.reload,
      snapshot: { status: "succeeded", exists: false })
    assert_predicate visit.reload, :ending?
    assert_equal "provider_room_absent_without_end_event", room.reload.last_error_code

    Clinic::Telehealth::ReconcileRoom.apply_snapshot!(visit: visit.reload, room_attempt: room.reload,
      snapshot: { status: "succeeded", exists: true, presence_confirmed: true,
        presence_count: 0, provider_subject_ids: [] })
    assert_predicate visit.reload, :ended?
    assert_predicate room.reload, :ended?

    Clinic::Telehealth::ReconcileRoom.apply_snapshot!(visit: visit.reload, room_attempt: room.reload,
      snapshot: { status: "succeeded", exists: true, presence_confirmed: true,
        presence_count: 1, provider_subject_ids: [ "late-subject" ], room_url: "https://late.invalid" })
    assert_predicate visit.reload, :ended?
    assert_predicate room.reload, :ended?
    Clinic::Telehealth::ReconcileRoom.apply_snapshot!(visit: visit.reload, room_attempt: room.reload,
      snapshot: { status: "succeeded", exists: false })
    assert_predicate visit.reload, :ended?
    assert_predicate room.reload, :ended?
  end

  test "reschedule rotates admission generation revokes old grants and queues cleanup against the old room" do
    appointment = book_video!(starts_at: 3.hours.from_now)
    visit = appointment.telehealth_visit
    room = ready_room!(visit)
    old_generation = visit.access_generation
    visit.participants.find_each do |participant|
      participant.update!(status: "admitted", admitted_at: Time.current,
        admitted_by_membership: @membership, admitted_generation: old_generation)
    end
    patient = visit.participants.patient.sole
    grant = create_join_grant!(visit: visit, participant: patient, room: room, token: "old-generation-token")
    expected_updated_at = appointment.reload.updated_at

    Clinic::Scheduling::RescheduleAppointment.call(appointment: appointment, actor: @staff,
      starts_at: appointment.starts_at + 1.day, ends_at: appointment.ends_at + 1.day,
      expected_updated_at: expected_updated_at, request_key: "telehealth-reschedule")

    visit.reload
    assert_equal old_generation + 1, visit.access_generation
    assert_predicate visit, :scheduled?
    assert_nil visit.current_room_attempt_id
    assert_equal [ "eligible" ], visit.participants.reload.pluck(:status).uniq
    assert visit.participants.all? { |participant| participant.revoked_at.nil? && participant.admitted_generation.nil? }
    assert_equal "appointment_rescheduled", grant.reload.revocation_reason
    cleanup = visit.commands.find_by!(dedupe_key: "end:#{old_generation}:#{room.id}:rescheduled")
    assert_equal old_generation, cleanup.access_generation
    assert_equal room.id, cleanup.room_attempt_id
    assert_predicate cleanup, :pending?
  end

  test "role and patient account revocation synchronously fence access and enqueue durable ejection" do
    visit = book_video!(starts_at: 20.minutes.from_now).telehealth_visit
    room = ready_room!(visit)
    host = visit.participants.clinician.sole
    patient = visit.participants.patient.sole
    [ host, patient ].each do |participant|
      participant.update!(status: "admitted", admitted_at: Time.current,
        admitted_by_membership: @membership, admitted_generation: visit.access_generation)
      create_join_grant!(visit: visit, participant: participant, room: room,
        token: "revocation-token-#{participant.id}")
    end
    visit.update!(scribe_capture_owner_participant: host,
      scribe_capture_owner_token_digest: Digest::SHA256.hexdigest("capture-owner-token"),
      scribe_capture_lease_expires_at: 1.minute.from_now, scribe_capture_epoch: 3)

    permission_grant!(@membership, "telehealth.participate").update!(revoked_at: Time.current, revision: 2)
    assert_predicate host.reload, :removed?
    assert_equal "membership_access_revoked", host.revocation_reason
    assert_nil visit.reload.scribe_capture_owner_participant_id
    assert_equal 4, visit.scribe_capture_epoch
    assert visit.commands.exists?(kind: "eject_participant", participant_id: host.id, status: "pending")
    assert host.join_grants.all? { |grant| grant.revoked_at.present? }

    @patient_user.update!(active: false)
    assert_predicate patient.reload, :removed?
    assert_equal "account_access_revoked", patient.revocation_reason
    assert visit.commands.exists?(kind: "eject_participant", participant_id: patient.id, status: "pending")
    assert patient.join_grants.all? { |grant| grant.revoked_at.present? }
  end

  test "expired command leases become unknown and one-use join requests cannot replay a raw token" do
    visit = book_video!(starts_at: 20.minutes.from_now).telehealth_visit
    room = ready_room!(visit)
    participant = visit.participants.clinician.sole
    participant.update!(status: "admitted", admitted_at: Time.current,
      admitted_by_membership: @membership, admitted_generation: visit.access_generation)
    stale = visit.commands.create!(practice: @practice, room_attempt: room, kind: "reconcile_room",
      dedupe_key: "telehealth-stale-command", access_generation: visit.access_generation,
      status: "leased", attempt_count: 1, available_at: 1.minute.ago,
      lease_token: SecureRandom.uuid, leased_until: 1.second.ago, last_attempt_at: 1.minute.ago)
    assert_nil Clinic::Telehealth::DispatchCommand.claim(stale)
    assert_predicate stale.reload, :unknown?
    assert_equal "lease_expired", stale.last_error_code

    calls = 0
    issuer = lambda do |**_arguments|
      calls += 1
      "one-use-provider-token"
    end
    first = with_stubbed_singleton_method(Clinic::Telehealth::Providers::Daily, :issue_join_token, issuer) do
      Clinic::Telehealth::IssueJoinGrant.call(visit: visit, participant: participant,
        actor: @staff, request_key: "telehealth-one-use-grant", expected_version: visit.reload.lock_version)
    end
    assert_equal Digest::SHA256.hexdigest(first.token), first.grant.token_digest
    assert_not first.grant.attributes.key?("token")

    error = with_stubbed_singleton_method(Clinic::Telehealth::Providers::Daily, :issue_join_token, issuer) do
      assert_raises(Clinic::Telehealth::Error) do
        Clinic::Telehealth::IssueJoinGrant.call(visit: visit, participant: participant,
          actor: @staff, request_key: "telehealth-one-use-grant", expected_version: visit.reload.lock_version)
      end
    end
    assert_equal "join_grant_not_replayable", error.code
    assert_equal 1, calls
  end

  test "late events from an old room and stale participant sessions cannot corrupt the current generation" do
    appointment = book_video!(starts_at: 3.hours.from_now)
    visit = appointment.telehealth_visit
    old_room = ready_room!(visit)
    old_generation = visit.access_generation
    expected_updated_at = appointment.reload.updated_at
    Clinic::Scheduling::RescheduleAppointment.call(appointment: appointment, actor: @staff,
      starts_at: appointment.starts_at + 1.day, ends_at: appointment.ends_at + 1.day,
      expected_updated_at: expected_updated_at, request_key: "telehealth-event-fence-reschedule")
    participant = visit.participants.clinician.sole.reload

    Clinic::Telehealth::IngestProviderEvent.apply!(visit: visit.reload, room: old_room.reload,
      participant: participant, type: "meeting.started", provider_session_ref: nil,
      occurred_at: Time.current)
    assert_predicate visit.reload, :scheduled?
    assert_equal old_generation + 1, visit.access_generation
    assert_predicate old_room.reload, :ending?

    Clinic::Telehealth::IngestProviderEvent.apply!(visit: visit.reload, room: old_room.reload,
      participant: participant, type: "meeting.ended", provider_session_ref: nil,
      occurred_at: Time.current)
    assert_predicate old_room.reload, :ended?
    assert_predicate visit.reload, :scheduled?
    assert_predicate participant.reload, :eligible?
    assert_nil participant.revoked_at

    current_room = ready_room!(visit)
    participant.update!(status: "admitted", admitted_at: Time.current,
      admitted_by_membership: @membership, admitted_generation: visit.access_generation)
    current_room.provider_events.create!(practice: @practice, participant: participant,
      provider_code: "daily", provider_account_ref: TEST_ACCOUNT_REF,
      provider_event_id: "new-session-joined", event_type: "participant.joined",
      provider_session_ref: "session-new", occurred_at: 1.minute.ago, received_at: Time.current,
      payload_digest: Digest::SHA256.hexdigest("new-session-joined"), normalized_metadata: {})
    Clinic::Telehealth::IngestProviderEvent.apply!(visit: visit.reload, room: current_room.reload,
      participant: participant, type: "participant.left", provider_session_ref: "session-old",
      occurred_at: 2.minutes.ago)
    assert_predicate participant.reload, :admitted?
  end

  test "historical reconciliation and delayed create results cannot mutate the replacement visit" do
    appointment = book_video!(starts_at: 3.hours.from_now)
    visit = appointment.telehealth_visit
    old_room = visit.room_attempts.create!(practice: @practice, attempt_no: 1, provider_code: "daily",
      provider_account_ref: TEST_ACCOUNT_REF, provider_room_name: "apply_#{SecureRandom.hex(16)}",
      status: "pending", access_generation: visit.access_generation, expires_at: 2.hours.from_now)
    visit.update!(current_room_attempt: old_room)
    create_command = visit.commands.create!(practice: @practice, room_attempt: old_room, kind: "create_room",
      dedupe_key: "create:#{visit.access_generation}:#{old_room.id}", access_generation: visit.access_generation,
      status: "pending", available_at: Time.current)
    lease = Clinic::Telehealth::DispatchCommand.claim(create_command)
    old_generation = visit.access_generation
    Clinic::Scheduling::RescheduleAppointment.call(appointment: appointment, actor: @staff,
      starts_at: appointment.starts_at + 1.day, ends_at: appointment.ends_at + 1.day,
      expected_updated_at: appointment.reload.updated_at, request_key: "telehealth-delayed-create-reschedule")

    Clinic::Telehealth::DispatchCommand.finalize(create_command, lease,
      status: "succeeded", room_url: "https://example.invalid/delayed-room")
    assert_predicate create_command.reload, :succeeded?
    assert_predicate old_room.reload, :ending?
    assert_equal "https://example.invalid/delayed-room", old_room.provider_room_url
    assert_equal old_generation + 1, visit.reload.access_generation
    assert_predicate visit, :scheduled?
    assert_nil visit.current_room_attempt_id
    cleanup = visit.commands.where(room_attempt: old_room, kind: "end_room").where.not(status: "suppressed").sole
    assert_equal old_generation, cleanup.access_generation

    old_room.update!(status: "ended", ended_at: Time.current)
    current_room = ready_room!(visit)
    visit.update!(status: "ending")
    current_room.update!(status: "ending")
    Clinic::Telehealth::ReconcileRoom.apply_snapshot!(visit: visit.reload, room_attempt: old_room.reload,
      snapshot: { status: "succeeded", exists: true, presence_confirmed: true, presence_count: 0,
        provider_subject_ids: [], presence_identifiers_complete: true })
    assert_predicate visit.reload, :ending?
    assert_predicate current_room.reload, :ending?
    assert_predicate old_room.reload, :ended?
  end

  test "stale create preflight suppresses provider IO and historical cleanup uses the room generation" do
    visit = book_video!(starts_at: 3.hours.from_now).telehealth_visit
    room = visit.room_attempts.create!(practice: @practice, attempt_no: 1, provider_code: "daily",
      provider_account_ref: TEST_ACCOUNT_REF, provider_room_name: "apply_#{SecureRandom.hex(16)}",
      status: "pending", access_generation: visit.access_generation, expires_at: 2.hours.from_now)
    visit.update!(current_room_attempt: room)
    command = visit.commands.create!(practice: @practice, room_attempt: room, kind: "create_room",
      dedupe_key: "create:#{visit.access_generation}:#{room.id}", access_generation: visit.access_generation,
      status: "pending", available_at: Time.current)
    lease = Clinic::Telehealth::DispatchCommand.claim(command)
    old_generation = visit.access_generation
    visit.update!(access_generation: old_generation + 1, current_room_attempt: nil)
    room.update!(status: "ending")
    provider_calls = 0
    creator = lambda do |**_arguments|
      provider_calls += 1
      { "url" => "https://example.invalid/should-not-exist" }
    end
    with_stubbed_singleton_method(Clinic::Telehealth::Providers::Daily, :create_room, creator) do
      Clinic::Telehealth::DispatchCommand.call(command: command, lease_token: lease)
    end
    assert_equal 0, provider_calls
    assert_predicate command.reload, :suppressed?
    assert_predicate room.reload, :failed?

    historical = visit.room_attempts.create!(practice: @practice, attempt_no: 2, provider_code: "daily",
      provider_account_ref: TEST_ACCOUNT_REF, provider_room_name: "apply_#{SecureRandom.hex(16)}",
      status: "unknown", access_generation: old_generation, expires_at: 2.hours.from_now)
    Clinic::Telehealth::ReconcileRoom.apply_snapshot!(visit: visit.reload, room_attempt: historical,
      snapshot: { status: "succeeded", exists: true, presence_confirmed: true, presence_count: 1,
        provider_subject_ids: [ "unknown-person" ], presence_identifiers_complete: true })
    cleanup = visit.commands.find_by!(dedupe_key: "cleanup-stale-room:#{old_generation}:#{historical.id}")
    assert_equal old_generation, cleanup.access_generation
    assert_predicate historical.reload, :ending?
  end

  test "Twilio tokens are room bound and create requests disable recording with an approved maximum duration" do
    configure_twilio_environment!
    participant = direct_video_visit!.participants.create!(practice: @practice, role: "clinician",
      membership: @membership, status: "admitted", admitted_at: Time.current, admitted_generation: 1)
    captured = nil
    response = { "account_sid" => twilio_account_sid, "sid" => twilio_room_sid,
      "unique_name" => "apply_room", "status" => "in-progress" }
    request = lambda do |method, path, form: nil|
      captured = [ method, path, form ]
      response
    end
    with_stubbed_singleton_method(Clinic::Telehealth::Providers::Twilio, :request, request) do
      room = Clinic::Telehealth::Providers::Twilio.create_room(name: "apply_room", expires_at: 2.hours.from_now,
        max_duration_seconds: 7_200)
      assert_nil room.fetch("url")
      assert_equal twilio_room_sid, room.fetch("sid")
    end
    assert_equal [ :post, "Rooms" ], captured.first(2)
    assert_equal false, captured.last.fetch("RecordParticipantsOnConnect")
    assert_equal 7_200, captured.last.fetch("MaxParticipantDuration")
    assert_equal twilio_callback_url, captured.last.fetch("StatusCallback")

    token = Clinic::Telehealth::Providers::Twilio.issue_join_token(room_name: "apply_room",
      participant: participant, expires_at: 2.minutes.from_now, owner: true, allow_screen_share: true)
    claims = JWT.decode(token, nil, false).first
    assert_equal participant.provider_subject_id, claims.dig("grants", "identity")
    assert_equal "apply_room", claims.dig("grants", "video", "room")
    assert_equal twilio_account_sid, claims.fetch("sub")
    assert_not_includes token, ENV.fetch("APP_TELEHEALTH_TWILIO_API_KEY_SECRET")
  end

  test "signed Twilio form callbacks bind account and room SID and replay idempotently" do
    configure_twilio_environment!
    @setting.update!(provider_code: "twilio", provider_account_ref: twilio_account_sid)
    visit = direct_video_visit!
    room = visit.room_attempts.create!(practice: @practice, attempt_no: 1, provider_code: "twilio",
      provider_account_ref: twilio_account_sid, provider_room_name: "apply_twilio_callback", status: "pending",
      access_generation: visit.access_generation, expires_at: 2.hours.from_now)
    visit.update!(current_room_attempt: room)
    payload = twilio_callback_payload
    signature = Twilio::Security::RequestValidator.new(ENV.fetch("APP_TELEHEALTH_TWILIO_AUTH_TOKEN"))
      .build_signature_for(twilio_callback_url, payload)
    2.times do
      post "/api/integrations/telehealth/twilio/events", params: payload,
        headers: { "X-Twilio-Signature" => signature,
          "Content-Type" => "application/x-www-form-urlencoded" }
      assert_response :no_content
    end
    assert_equal twilio_room_sid, room.reload.provider_room_ref
    assert_equal 1, room.provider_events.where(provider_code: "twilio").count

    foreign = payload.merge("AccountSid" => "AC#{'f' * 32}", "SequenceNumber" => "2")
    foreign_signature = Twilio::Security::RequestValidator.new(ENV.fetch("APP_TELEHEALTH_TWILIO_AUTH_TOKEN"))
      .build_signature_for(twilio_callback_url, foreign)
    post "/api/integrations/telehealth/twilio/events", params: foreign,
      headers: { "X-Twilio-Signature" => foreign_signature,
        "Content-Type" => "application/x-www-form-urlencoded" }
    assert_response :unauthorized
    assert_equal 1, room.provider_events.count
  end

  test "disabled settings can switch to Twilio but active rooms and enabled requests are fenced" do
    configure_twilio_environment!
    @setting.update!(enabled: false)
    Clinic::Telehealth::SaveSettingsDraft.call(practice: @practice, actor: @staff,
      request_key: "switch-settings-to-twilio", expected_version: @setting.lock_version,
      settings: { provider_account_ref: twilio_account_sid, enabled: false }, policy: policy_payload,
      visit_type_rules: [])
    assert_equal "twilio", @setting.reload.provider_code
    assert_equal "not_checked", @setting.health_status
    assert_nil @setting.health_checked_at

    @setting.update!(provider_code: "daily", provider_account_ref: TEST_ACCOUNT_REF, enabled: false)
    visit = direct_video_visit!
    ready_room!(visit)
    error = assert_raises(Clinic::Telehealth::Error) do
      Clinic::Telehealth::SaveSettingsDraft.call(practice: @practice, actor: @staff,
        request_key: "blocked-settings-to-twilio", expected_version: @setting.reload.lock_version,
        settings: { provider_account_ref: twilio_account_sid, enabled: false }, policy: policy_payload,
        visit_type_rules: [])
    end
    assert_equal "provider_change_blocked", error.code
    assert_equal "daily", @setting.reload.provider_code
  end

  private

  def configure_twilio_environment!
    ENV.update("APP_TELEHEALTH_PROVIDER" => "twilio", "APP_TELEHEALTH_TWILIO_ACCOUNT_SID" => twilio_account_sid,
      "APP_TELEHEALTH_TWILIO_API_KEY_SID" => "SK#{'b' * 32}",
      "APP_TELEHEALTH_TWILIO_API_KEY_SECRET" => "twilio-video-secret-for-tests-with-at-least-thirty-two-bytes",
      "APP_TELEHEALTH_TWILIO_AUTH_TOKEN" => "twilio-callback-secret-for-tests",
      "APP_TELEHEALTH_TWILIO_STATUS_CALLBACK_URL" => twilio_callback_url)
  end

  def twilio_account_sid
    "AC#{'a' * 32}"
  end

  def twilio_room_sid
    "RM#{'c' * 32}"
  end

  def twilio_callback_url
    "https://telehealth.example.invalid/api/integrations/telehealth/twilio/events"
  end

  def twilio_callback_payload
    { "AccountSid" => twilio_account_sid, "RoomName" => "apply_twilio_callback",
      "RoomSid" => twilio_room_sid, "RoomStatus" => "in-progress", "RoomType" => "group",
      "StatusCallbackEvent" => "room-created", "Timestamp" => Time.current.utc.iso8601,
      "SequenceNumber" => "1" }
  end

  def with_stubbed_singleton_method(target, method_name, implementation)
    singleton = target.singleton_class
    original = target.method(method_name)
    singleton.define_method(method_name, &implementation)
    yield
  ensure
    singleton.define_method(method_name, original)
  end

  def create_ready_configuration!
    @setting = Clinic::Telehealth::Setting.create!(practice: @practice, updated_by_membership: @membership,
      provider_code: "daily", provider_account_ref: TEST_ACCOUNT_REF, enabled: true, health_status: "ready",
      health_checked_at: Time.current)
    @policy = @setting.policy_versions.create!(practice: @practice, version: 1, status: "published",
      **policy_payload, created_by_membership: @membership, published_by_membership: @membership,
      published_at: Time.current)
    @setting.update!(active_policy_version: @policy)
    Clinic::Telehealth::VisitTypeRule.create!(practice: @practice, visit_type: @visit_type, site: @site,
      enabled: true, allowed_region_codes: [ "TX" ], updated_by_membership: @membership)
  end

  def policy_payload(consent_title: "Video visit consent")
    {
      consent_title: consent_title,
      consent_body: "I consent to care by live video.",
      content_digest: Digest::SHA256.hexdigest("#{consent_title}\0video-consent-v1"),
      locale: "en-US",
      patient_instructions: "Join from a private location with a stable connection.",
      support_label: "Call the clinic",
      support_phone: "+15555550100",
      support_url: "https://example.invalid/telehealth-support",
      join_early_minutes: 15,
      join_late_minutes: 30,
      max_room_minutes: 120,
      grant_ttl_seconds: 120,
      checkin_max_age_minutes: 240,
      allow_audio_only: false,
      allow_staff_screen_share: true,
      scribe_enabled: true,
      require_location: true,
      require_callback: true,
      scribe_consent_title: "Recording consent",
      scribe_consent_body: "I consent to recording for clinical documentation.",
      scribe_consent_digest: Digest::SHA256.hexdigest("scribe-recording-consent-v1")
    }
  end

  def book_video!(starts_at:)
    Clinic::Scheduling::BookAppointment.call(practice: @practice, actor: @staff, patient: @patient,
      site: @site, booked_clinician: @clinician, visit_type: @visit_type, starts_at: starts_at,
      ends_at: starts_at + 30.minutes, request_key: "telehealth-book-#{SecureRandom.uuid}",
      visit_modality: "video")
  end

  def direct_video_visit!(site: @site)
    appointment = @practice.appointments.create!(patient: @patient, site: site,
      booked_clinician: @clinician, visit_type: @visit_type, starts_at: 1.day.from_now,
      ends_at: 1.day.from_now + 30.minutes, status: "scheduled", visit_modality: "video")
    Clinic::Telehealth::Visit.create!(practice: @practice, patient: @patient, appointment: appointment,
      policy_version: @setting.active_policy_version, created_by_membership: @membership, status: "scheduled")
  end

  def ready_room!(visit)
    room = visit.room_attempts.create!(practice: visit.practice,
      attempt_no: visit.room_attempts.maximum(:attempt_no).to_i + 1, provider_code: "daily",
      provider_account_ref: TEST_ACCOUNT_REF, provider_room_name: "apply_#{SecureRandom.hex(16)}",
      provider_room_url: "https://example.invalid/#{visit.public_id}", status: "ready",
      access_generation: visit.access_generation, provisioned_at: Time.current, expires_at: 2.hours.from_now)
    visit.update!(current_room_attempt: room)
    room
  end

  def complete_checkin
    {
      location: { address_line1: "100 Clinic Way", city: "Austin", region_code: "TX",
        postal_code: "78701", country_code: "US" },
      location_attested: true,
      callback_phone: "+15555550101",
      device_results: { camera: "passed", microphone: "passed", speaker: "passed",
        browser: "supported", audio_only_requested: false, checked_at: Time.current.iso8601(6) }
    }
  end

  def create_join_grant!(visit:, participant:, room:, token:)
    visit.join_grants.create!(practice: visit.practice, participant: participant, room_attempt: room,
      access_generation: visit.access_generation, token_digest: Digest::SHA256.hexdigest(token),
      request_digest: Digest::SHA256.hexdigest("request-#{token}"), issued_at: Time.current,
      expires_at: 2.minutes.from_now)
  end

  def build_foreign_visit!
    organization = Organization.create!(name: "Foreign Telehealth Organization")
    practice = Clinic::Practice.create!(name: "Foreign Telehealth Practice", organization: organization)
    staff = User.create!(email_address: "foreign-telehealth@example.invalid", password: PASSWORD)
    membership = practice.memberships.create!(user: staff)
    site = create_site!(practice, "FOREIGN-VIDEO")
    visit_type = practice.visit_types.create!(code: "FOREIGN-FOLLOW-UP")
    patient = practice.patients.create!(display_name: "Foreign Telehealth Patient", reference: "TH-FOREIGN")
    patient_user = User.create!(email_address: "foreign-patient@example.invalid", password: PASSWORD)
    identity = Clinic::PatientPortal::Identity.create!(practice: practice, patient: patient, user: patient_user,
      status: :active, invited_at: 1.day.ago, activated_at: 1.day.ago)
    clinician = practice.clinician_profiles.create!(membership: membership, display_name: "Foreign Clinician")
    setting = Clinic::Telehealth::Setting.create!(practice: practice, updated_by_membership: membership,
      provider_code: "daily", provider_account_ref: TEST_ACCOUNT_REF, enabled: true, health_status: "ready")
    policy = setting.policy_versions.create!(practice: practice, version: 1, status: "published",
      **policy_payload, created_by_membership: membership, published_by_membership: membership,
      published_at: Time.current)
    setting.update!(active_policy_version: policy)
    appointment = practice.appointments.create!(patient: patient, site: site, booked_clinician: clinician,
      visit_type: visit_type, starts_at: 1.day.from_now, ends_at: 1.day.from_now + 30.minutes,
      status: "scheduled", visit_modality: "video")
    visit = Clinic::Telehealth::Visit.create!(practice: practice, patient: patient, appointment: appointment,
      policy_version: policy, created_by_membership: membership, status: "scheduled")
    visit.participants.create!(practice: practice, role: "patient", portal_identity: identity, status: "eligible")
    [ practice, staff, membership, patient, identity, visit ]
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def create_site!(practice, code)
    practice.sites.create!(code: code, name: code.titleize, status: "active",
      address_line1: "100 Clinic Way", city: "Austin", state: "TX", postal_code: "78701", country: "US")
  end

  def login(user)
    post "/api/session", params: { email_address: user.email_address, password: PASSWORD },
      headers: csrf_headers, as: :json
    assert_response :success
  end

  def login_patient
    Rails.env = "development"
    post "/api/development_session", params: { profile: "patient" }, headers: csrf_headers, as: :json
    assert_response :created
  end
end
