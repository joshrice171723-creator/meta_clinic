require "test_helper"

class BehavioralHealthEntryBoundariesTest < ActionDispatch::IntegrationTest
  setup do
    travel_to Time.utc(2026, 10, 3, 8)
    Rails.cache.clear
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(20)
    @user = User.create!(email_address: "bh-entry-staff@example.invalid", password: @password)
    organization = Organization.create!(name: "Entry boundary organization")
    @practice = Clinic::Practice.create!(name: "Entry boundary clinic", organization: organization, timezone: "UTC",
      public_membership_slug: "bh-entry-boundaries")
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "patients.read", "appointments.read", "appointments.book",
      "appointments.status_transition", "appointments.capacity_override", "encounters.write", "encounters.read",
      "facilities.read", "facilities.write")
    @clinician = @practice.clinician_profiles.create!(membership: @membership, display_name: "Entry clinician")
    @patient = @practice.patients.create!(display_name: "Shared entry patient", reference: "BH-ENTRY")
    @patient.patient_memberships.create!(practice: @practice, recorded_by_membership: @membership,
      status: "member", version: 1, effective_from: 1.day.ago)
    @weight = location("W")
    @behavioral = location("B")
    @base = location("B-BASE")
    @unconfigured = location("U")
    @draft = location("D")
    @inactive = location("I")
    @services = %w[psychiatric_evaluation adhd_evaluation medication_management
      therapy_referral_coordination individual_therapy urgent_clinical_follow_up]
    configure(@weight, "weight_loss")
    configure(@behavioral, "behavioral_health", services: @services)
    configure(@base, "behavioral_health")
    configure(@draft, "behavioral_health", finalize: false)
    configure(@inactive, "behavioral_health")
    @inactive.update!(status: "temporarily_closed")
    configure(nil, "behavioral_health", services: @services)
    @weight_visit = preset_visit(@weight, "initial")
    @base_visit = preset_visit(@behavioral, "initial")
    @therapy_visit = preset_visit(@behavioral, "individual_therapy")
    @shared_visit = @practice.visit_types.create!(code: "Shared office follow-up")
    @start = 2.days.from_now.change(hour: 9, min: 0, sec: 0, usec: 0)
    @staff, @staff_headers = authenticated_session(@user, @password)
    patient_password = SecureRandom.hex(20)
    patient_user = User.create!(email_address: "bh-entry-patient@example.invalid", password: patient_password)
    @identity = Clinic::PatientPortal::Identity.create!(practice: @practice, patient: @patient, user: patient_user,
      status: :active, invited_at: 1.day.ago, activated_at: 1.day.ago)
    @portal, @portal_headers = authenticated_session(patient_user, patient_password)
  end

  teardown { travel_back }

  test "one patient books both specialties with origin forms and shared history" do
    weight = staff_book(@weight, @weight_visit, "weight-book")
    behavioral = staff_book(@behavioral, @base_visit, "behavioral-book", starts_at: @start + 1.hour)
    assert_equal @patient.id, weight.patient_id
    assert_equal @patient.id, behavioral.patient_id
    assert_equal "weight-management-initial-v1", Clinic::Configuration::StarterProfile.form_id(practice: @practice, appointment: weight)
    assert_equal "behavioral-health-initial-v1", Clinic::Configuration::StarterProfile.form_id(practice: @practice, appointment: behavioral)
    @staff.get "/api/clinic/appointments", params: { patient_id: @patient.id }, headers: @staff_headers
    assert_equal 200, @staff.response.status
    assert_equal [weight.id, behavioral.id].sort, @staff.response.parsed_body.fetch("appointments").pluck("id").sort

    @shared_visit.update!(code: "Individual therapy custom label")
    shared = staff_book(@weight, @shared_visit, "shared-custom-label", starts_at: @start + 2.hours)
    assert_equal Clinic::Care::PrevisitIntake::FORM_ID,
      Clinic::Configuration::StarterProfile.form_id(practice: @practice, appointment: shared)
  end

  test "staff and deep booking deny unconfigured draft inactive wrong specialty and disabled services" do
    cases = [[nil, @base_visit], [@unconfigured, @base_visit], [@draft, @base_visit], [@inactive, @base_visit],
      [@weight, @base_visit], [@weight, @therapy_visit], [@behavioral, @weight_visit]]
    @services.each do |service|
      key = service == "medication_management" ? "medication_follow_up" : service
      cases << [@base, preset_visit(@behavioral, key)]
    end
    cases << [@base, preset_visit(@behavioral, "refill_review")]
    retired = @practice.visit_types.create!(code: "Retired shared visit", retired_at: Time.current)
    cases << [@behavioral, retired]
    assert_no_difference -> { @practice.appointments.count } do
      cases.each_with_index do |(site, visit), index|
        @staff.post "/api/clinic/appointments", params: booking_body(site, visit, "denied-#{index}"),
          headers: @staff_headers, as: :json
        assert_equal 422, @staff.response.status, "site=#{site&.code} visit=#{visit.code}: #{@staff.response.body}"
        assert_raises(ArgumentError) { direct_book(site, visit, "deep-denied-#{index}") }
      end
    end
    staff_book(@base, @base_visit, "base-care")
    staff_book(@weight, @shared_visit, "weight-shared", starts_at: @start + 1.hour)
    staff_book(@behavioral, @shared_visit, "behavioral-shared", starts_at: @start + 2.hours)
  end

  test "walk-ins and direct encounters require finalized active locations" do
    assert_no_difference -> { @practice.encounters.count } do
      [nil, @unconfigured, @draft, @inactive].each do |site|
        assert_raises(ArgumentError) do
          Clinic::Scheduling::CreateEncounter.call(practice: @practice, actor: @user, patient: @patient, site: site)
        end
      end
    end
    encounter = Clinic::Scheduling::CreateEncounter.call(practice: @practice, actor: @user, patient: @patient, site: @base)
    assert_equal @base.id, encounter.site_id
    assert_no_difference -> { @practice.appointments.count } do
      [[@unconfigured, @base_visit], [@draft, @base_visit], [@inactive, @base_visit], [@weight, @therapy_visit], [@base, @therapy_visit]].each_with_index do |(site, visit), index|
        assert_raises(ArgumentError) do
          direct_book(site, visit, "walk-in-denied-#{index}", walk_in: true, capacity_override_reason: "Same-day request")
        end
      end
    end
    walk_in = direct_book(@behavioral, @therapy_visit, "walk-in-valid", walk_in: true, capacity_override_reason: "Same-day request")
    assert_equal @behavioral.id, walk_in.site_id
    assert walk_in.walk_in_exception
  end

  test "each behavioral service enables only its related visits and shared base care" do
    @services.each_with_index do |service, index|
      site = location("ONLY-#{index}")
      configure(site, "behavioral_health", services: [service])
      ids = Clinic::Configuration::StarterProfile.available_visit_type_ids(practice: @practice, site: site)
      assert_includes ids, @base_visit.id
      assert_includes ids, @shared_visit.id
      @services.each do |candidate|
        key = candidate == "medication_management" ? "medication_follow_up" : candidate
        visit = preset_visit(@behavioral, key)
        candidate == service ? assert_includes(ids, visit.id) : refute_includes(ids, visit.id)
      end
      key = service == "medication_management" ? "medication_follow_up" : service
      selected = direct_book(site, preset_visit(@behavioral, key), "independent-#{index}", starts_at: @start + index.hours)
      assert_equal site.id, selected.site_id
    end
  end

  test "video selection is independent of behavioral services and site-specific rules override practice rules" do
    video_site = location("VIDEO")
    configure(video_site, "behavioral_health", services: ["telehealth"])
    Clinic::Telehealth::VisitTypeRule.create!(practice: @practice, visit_type: @base_visit,
      updated_by_membership: @membership, enabled: true)
    assert_raises(ArgumentError) { direct_book(@behavioral, @base_visit, "video-service-off", visit_modality: "video") }
    assert_raises(ArgumentError) { direct_book(video_site, @therapy_visit, "video-therapy-off", visit_modality: "video") }
    saved = direct_book(video_site, @base_visit, "video-base-care", visit_modality: "video")
    assert_equal "video", saved.visit_modality
    assert_nil saved.room_id
    body = portal_body(video_site, @base_visit, "portal-video-base")
    body[:appointment_request].merge!(requested_modality: "video", starts_at: (@start + 1.hour).iso8601,
      ends_at: (@start + 90.minutes).iso8601)
    @portal.post portal_requests_path, params: body, headers: @portal_headers, as: :json
    assert_equal 201, @portal.response.status, @portal.response.body
    Clinic::Telehealth::VisitTypeRule.create!(practice: @practice, visit_type: @base_visit, site: video_site,
      updated_by_membership: @membership, enabled: false)
    body[:appointment_request][:request_key] = "portal-video-site-denied"
    assert_no_difference -> { @practice.patient_portal_appointment_requests.count } do
      @portal.post portal_requests_path, params: body, headers: @portal_headers, as: :json
      assert_equal 422, @portal.response.status, @portal.response.body
    end
    disable_services(video_site, "telehealth")
    assert_equal saved.id, reschedule(saved, "saved-video-continuation", starts_at: @start + 2.hours).id
    assert_raises(ArgumentError) do
      reschedule(saved, "new-video-location", starts_at: @start + 3.hours, site: @base)
    end
  end

  test "booking retries and cross-location reschedule retain actor site authorization" do
    scoped_user = User.create!(email_address: "bh-entry-weight-only@example.invalid", password: SecureRandom.hex(20))
    scoped_membership = @practice.memberships.create!(user: scoped_user)
    grant_permissions!(scoped_membership, "appointments.book", scope_kind: "site", site: @weight)
    arguments = { practice: @practice, actor: scoped_user, patient: @patient, site: @weight,
      booked_clinician: @clinician, visit_type: @weight_visit, starts_at: @start, ends_at: @start + 30.minutes,
      request_key: "scoped-weight-book" }
    appointment = Clinic::Scheduling::BookAppointment.call(**arguments)
    assert_no_difference -> { @practice.appointments.count } do
      assert_raises(Clinic::Authorization::Denied) do
        Clinic::Scheduling::BookAppointment.call(**arguments.merge(site: @behavioral, visit_type: @base_visit,
          request_key: "scoped-bh-denied", starts_at: @start + 1.hour, ends_at: @start + 90.minutes))
      end
      assert_raises(Clinic::Authorization::Denied) do
        Clinic::Scheduling::RescheduleAppointment.call(appointment: appointment, actor: scoped_user, site: @behavioral,
          visit_type: @base_visit, starts_at: @start + 1.hour, ends_at: @start + 90.minutes,
          expected_updated_at: appointment.updated_at, request_key: "scoped-move-denied")
      end
      revoke_all_permissions!(scoped_membership)
      assert_raises(Clinic::Authorization::Denied) { Clinic::Scheduling::BookAppointment.call(**arguments) }
    end
    assert_equal @weight.id, appointment.reload.site_id
  end

  test "hold creation and conversion recheck actual location and service while exact booking retry survives disable" do
    [@unconfigured, @draft, @inactive].each do |site|
      assert_raises(ArgumentError) { hold_slot(site, "hold-denied-#{site.code}") }
    end
    hold = hold_slot(@behavioral, "therapy-hold")
    assert_equal hold.id, hold_slot(@behavioral, "therapy-hold").id
    disable_services(@behavioral, "individual_therapy")
    assert_no_difference -> { @practice.appointments.count } do
      assert_raises(ArgumentError) { direct_book(@behavioral, @therapy_visit, "disabled-conversion", schedule_hold: hold) }
    end
    assert_equal "active", hold.reload.state
    booking = direct_book(@behavioral, @base_visit, "base-conversion", schedule_hold: hold)
    assert_equal "converted", hold.reload.state
    @behavioral.update!(status: "temporarily_closed")
    assert_no_difference -> { @practice.appointments.count } do
      assert_equal booking.id, direct_book(@behavioral, @base_visit, "base-conversion", schedule_hold: hold).id
    end
  end

  test "series preview and create deny new incompatible work and preserve saved series after service disable" do
    [@weight, @behavioral, @base, @unconfigured, @draft, @inactive].each { |site| enable_recurrence(site) }
    [[@weight, @therapy_visit], [@base, @therapy_visit], [@unconfigured, @base_visit], [@draft, @base_visit], [@inactive, @base_visit]].each_with_index do |(site, visit), index|
      body = series_body(site, visit, "series-denied-#{index}")
      assert_no_difference -> { @practice.appointments.count } do
        %w[/api/clinic/appointment_series/preview /api/clinic/appointment_series].each do |path|
          @staff.post path, params: body, headers: @staff_headers, as: :json
          assert_equal 422, @staff.response.status, @staff.response.body
        end
      end
    end
    body = series_body(@behavioral, @therapy_visit, "therapy-series")
    @staff.post "/api/clinic/appointment_series/preview", params: body, headers: @staff_headers, as: :json
    assert_equal 200, @staff.response.status
    assert @staff.response.parsed_body.fetch("occurrences").all? { |row| row["conflict"].nil? }
    @staff.post "/api/clinic/appointment_series", params: body, headers: @staff_headers, as: :json
    assert_equal 201, @staff.response.status
    saved = @staff.response.parsed_body.fetch("series")
    disable_services(@behavioral, "individual_therapy")
    assert_no_difference -> { @practice.appointments.count } do
      @staff.post "/api/clinic/appointment_series", params: body, headers: @staff_headers, as: :json
      assert_equal 201, @staff.response.status
      assert_equal saved.fetch("id"), @staff.response.parsed_body.dig("series", "id")
      fresh = body.deep_dup
      fresh[:series][:request_key] = "new-disabled-series"
      @staff.post "/api/clinic/appointment_series", params: fresh, headers: @staff_headers, as: :json
      assert_equal 422, @staff.response.status
    end
    versions = saved.fetch("occurrences").map { |row| { appointment_id: row.fetch("appointment_id"), updated_at: row.fetch("updated_at") } }
    change = { change: { from_sequence: 1, local_time: "10:00", reason: "Patient requested another time",
      expected_versions: versions, request_key: "existing-series-change" } }
    2.times do
      @staff.post "/api/clinic/appointment_series/#{saved.fetch('id')}/change_future", params: change, headers: @staff_headers, as: :json
      assert_equal 200, @staff.response.status, @staff.response.body
    end
    assert_equal [10, 10], @practice.appointments.order(:starts_at).map { |record| record.starts_at.hour }
  end

  test "portal options and requests use chosen location and approval rechecks after disable" do
    @portal.get portal_requests_path, headers: @portal_headers
    assert_equal 200, @portal.response.status
    options = @portal.response.parsed_body.fetch("options").fetch("sites").index_by { |row| row.fetch("id") }
    assert_equal [@weight.id, @behavioral.id, @base.id].sort, options.keys.sort
    assert_includes options.fetch(@weight.id).fetch("available_visit_type_ids"), @shared_visit.id
    refute_includes options.fetch(@weight.id).fetch("available_visit_type_ids"), @therapy_visit.id
    assert_includes options.fetch(@behavioral.id).fetch("available_visit_type_ids"), @therapy_visit.id
    refute_includes options.fetch(@base.id).fetch("available_visit_type_ids"), @therapy_visit.id
    [[nil, @base_visit], [@unconfigured, @base_visit], [@draft, @base_visit], [@weight, @therapy_visit], [@base, @therapy_visit]].each_with_index do |(site, visit), index|
      assert_no_difference -> { @practice.patient_portal_appointment_requests.count } do
        @portal.post portal_requests_path, params: portal_body(site, visit, "portal-denied-#{index}"), headers: @portal_headers, as: :json
        assert_equal 422, @portal.response.status, @portal.response.body
      end
    end
    @portal.post portal_requests_path, params: portal_body(@inactive, @base_visit, "portal-inactive"), headers: @portal_headers, as: :json
    assert_equal 404, @portal.response.status
    body = portal_body(@behavioral, @therapy_visit, "therapy-request")
    @portal.post portal_requests_path, params: body, headers: @portal_headers, as: :json
    assert_equal 201, @portal.response.status
    request = @practice.patient_portal_appointment_requests.find(@portal.response.parsed_body.dig("appointment_request", "id"))
    disable_services(@behavioral, "individual_therapy")
    assert_no_difference -> { @practice.patient_portal_appointment_requests.count } do
      @portal.post portal_requests_path, params: body, headers: @portal_headers, as: :json
      assert_equal 200, @portal.response.status
      fresh = body.deep_dup
      fresh[:appointment_request][:request_key] = "disabled-fresh-request"
      @portal.post portal_requests_path, params: fresh, headers: @portal_headers, as: :json
      assert_equal 422, @portal.response.status
    end
    assert_no_difference -> { @practice.appointments.count } do
      assert_raises(ArgumentError) { approve_request(request, @behavioral, @therapy_visit, "disabled-approval") }
      assert_raises(ArgumentError) { approve_request(request, @weight, @therapy_visit, "wrong-specialty-approval") }
    end
    assert_equal "pending", request.reload.status
    approved = approve_request(request, @behavioral, @base_visit, "base-care-approval")
    assert_equal @behavioral.id, approved.appointment.site_id
    assert_no_difference -> { @practice.appointments.count } do
      assert approve_request(request, @behavioral, @base_visit, "base-care-approval").replayed
    end
  end

  test "saved booking reschedule and deep encounter continuation survive service disable but moving specialty rechecks" do
    appointment = staff_book(@behavioral, @therapy_visit, "existing-therapy")
    disable_services(@behavioral, "individual_therapy")
    assert_no_difference -> { @practice.appointments.count } do
      assert_equal appointment.id, staff_book(@behavioral, @therapy_visit, "existing-therapy").id
      changed = booking_body(@weight, @therapy_visit, "existing-therapy")
      @staff.post "/api/clinic/appointments", params: changed, headers: @staff_headers, as: :json
      assert_equal 409, @staff.response.status
    end
    version = appointment.updated_at
    moved = reschedule(appointment, "existing-time-change", version: version, starts_at: @start + 1.hour)
    assert_equal @therapy_visit.id, moved.visit_type_id
    assert_equal moved.id, reschedule(appointment, "existing-time-change", version: version, starts_at: @start + 1.hour).id
    assert_raises(ArgumentError) { reschedule(moved, "wrong-specialty-move", site: @weight, starts_at: @start + 2.hours) }
    assert_equal @behavioral.id, appointment.reload.site_id
    @staff.patch "/api/clinic/context", params: { site_id: @unconfigured.id }, headers: @staff_headers, as: :json
    assert_equal 200, @staff.response.status
    assert_no_difference -> { @practice.encounters.count } do
      @staff.post "/api/clinic/patients/#{@patient.id}/encounters", params: { encounter: { site_id: @unconfigured.id } },
        headers: @staff_headers, as: :json
      assert_equal 409, @staff.response.status
    end
    @staff.post "/api/clinic/patients/#{@patient.id}/encounters", params: { encounter: { appointment_id: appointment.id } },
      headers: @staff_headers, as: :json
    assert_equal 201, @staff.response.status, @staff.response.body
    encounter_id = @staff.response.parsed_body.dig("encounter", "id")
    assert_equal @behavioral.id, @practice.encounters.find(encounter_id).site_id
    assert_no_difference -> { @practice.encounters.count } do
      @staff.post "/api/clinic/patients/#{@patient.id}/encounters", params: { encounter: { appointment_id: appointment.id } },
        headers: @staff_headers, as: :json
      assert_equal 201, @staff.response.status
      assert_equal encounter_id, @staff.response.parsed_body.dig("encounter", "id")
    end
    another = direct_book(@weight, @weight_visit, "movable-weight", starts_at: @start + 3.hours)
    corrected = reschedule(another, "valid-specialty-move", site: @base, visit_type: @base_visit, starts_at: @start + 4.hours)
    assert_equal @base.id, corrected.site_id
    assert_equal @base_visit.id, corrected.visit_type_id
  end

  test "portal change request continues saved service and staff approval is replayable" do
    appointment = direct_book(@behavioral, @therapy_visit, "portal-existing-therapy")
    disable_services(@behavioral, "individual_therapy")
    body = { appointment_request: { request_key: "portal-reschedule", request_kind: "reschedule",
      source_appointment_id: appointment.id, source_appointment_updated_at: appointment.updated_at.iso8601(6),
      starts_at: (@start + 1.hour).iso8601, ends_at: (@start + 90.minutes).iso8601 } }
    @portal.post portal_requests_path, params: body, headers: @portal_headers, as: :json
    assert_equal 201, @portal.response.status, @portal.response.body
    request_id = @portal.response.parsed_body.dig("appointment_request", "id")
    approval = { review: { request_key: "portal-reschedule-approve", starts_at: (@start + 1.hour).iso8601,
      ends_at: (@start + 90.minutes).iso8601 } }
    2.times do
      @staff.post "/api/clinic/appointment_requests/#{request_id}/approve", params: approval, headers: @staff_headers, as: :json
      assert_equal 200, @staff.response.status, @staff.response.body
      assert_equal appointment.id, @staff.response.parsed_body.dig("appointment", "id")
    end
    assert_equal @start + 1.hour, appointment.reload.starts_at
    assert_equal @therapy_visit.id, appointment.visit_type_id
  end

  test "waitlist creation offer and staff or portal acceptance all enforce service at actual write" do
    [[@weight, @therapy_visit], [@base, @therapy_visit], [@unconfigured, @base_visit], [@draft, @base_visit], [@inactive, @base_visit]].each_with_index do |(site, visit), index|
      assert_no_difference -> { Clinic::Scheduling::WaitlistEntry.where(practice: @practice).count } do
        @staff.post "/api/clinic/waitlist", params: waitlist_body(site, visit, "waitlist-denied-#{index}"), headers: @staff_headers, as: :json
        assert_equal 422, @staff.response.status, @staff.response.body
      end
    end
    body = waitlist_body(@behavioral, @therapy_visit, "therapy-waitlist")
    2.times do
      @staff.post "/api/clinic/waitlist", params: body, headers: @staff_headers, as: :json
      assert_equal 201, @staff.response.status
    end
    entry = Clinic::Scheduling::WaitlistEntry.where(practice: @practice).sole
    Clinic::Scheduling::Waitlist.transition(entry: entry, actor: @user, action: "offer", expected_version: entry.lock_version,
      request_key: "therapy-offer", attributes: { starts_at: @start, expires_at: 1.hour.from_now })
    disable_services(@behavioral, "individual_therapy")
    assert_no_difference -> { @practice.appointments.count } do
      assert_raises(ArgumentError) do
        Clinic::Scheduling::Waitlist.transition(entry: entry, actor: @user, action: "accept", expected_version: entry.lock_version,
          request_key: "disabled-staff-accept", attributes: { patient_accepted: true })
      end
      assert_raises(ArgumentError) do
        Clinic::Scheduling::Waitlist.portal_reply(entry: entry, identity: @identity, actor: @identity.user, action: "accept",
          expected_version: entry.reload.lock_version, request_key: "disabled-portal-accept")
      end
    end
    assert_equal "offered", entry.reload.state
    waiting = Clinic::Scheduling::WaitlistEntry.create!(practice: @practice, patient: @patient, site: @behavioral,
      clinician: @clinician, visit_type: @therapy_visit, earliest_at: @start + 2.hours, latest_at: @start + 4.hours, duration_minutes: 30)
    assert_raises(ArgumentError) do
      Clinic::Scheduling::Waitlist.transition(entry: waiting, actor: @user, action: "offer", expected_version: waiting.lock_version,
        request_key: "disabled-new-offer", attributes: { starts_at: @start + 2.hours, expires_at: 1.hour.from_now })
    end
    shared = Clinic::Scheduling::WaitlistEntry.create!(practice: @practice, patient: @patient, site: @base,
      clinician: @clinician, visit_type: @shared_visit, earliest_at: @start + 5.hours, latest_at: @start + 7.hours, duration_minutes: 30)
    Clinic::Scheduling::Waitlist.transition(entry: shared, actor: @user, action: "offer", expected_version: shared.lock_version,
      request_key: "shared-offer", attributes: { starts_at: @start + 5.hours, expires_at: 1.hour.from_now })
    version = shared.lock_version
    accepted = Clinic::Scheduling::Waitlist.portal_reply(entry: shared, identity: @identity, actor: @identity.user, action: "accept",
      expected_version: version, request_key: "shared-portal-accept")
    assert_equal "booked", accepted.state
    assert_equal @base.id, accepted.appointment.site_id
    @base.update!(status: "temporarily_closed")
    assert_no_difference -> { @practice.appointments.count } do
      assert_equal accepted.appointment_id, Clinic::Scheduling::Waitlist.portal_reply(entry: shared, identity: @identity,
        actor: @identity.user, action: "accept", expected_version: version, request_key: "shared-portal-accept").appointment_id
    end
  end

  test "public service inquiry hides unavailable new work but preserves exact prior inquiry" do
    offering = published_offering(@behavioral, @therapy_visit, "therapy-public")
    @public, public_headers = anonymous_session
    path = "/api/public/clinic_services/#{@practice.public_membership_slug}"
    @public.get path, headers: public_headers
    assert_equal 200, @public.response.status
    assert_equal [offering.id], @public.response.parsed_body.fetch("services").pluck("id")
    body = { inquiry: { service_offering_id: offering.id, display_name: "Service requester", email_address: "inquiry@example.invalid",
      outreach_consent: true, request_key: "public-therapy-inquiry" } }
    @public.post "#{path}/inquiries", params: body, headers: public_headers, as: :json
    assert_equal 201, @public.response.status
    disable_services(@behavioral, "individual_therapy")
    @public.get path, headers: public_headers
    assert_equal 404, @public.response.status
    assert_no_difference -> { @practice.service_inquiries.count } do
      @public.post "#{path}/inquiries", params: body, headers: public_headers, as: :json
      assert_equal 200, @public.response.status
      assert_equal true, @public.response.parsed_body.dig("inquiry", "replayed")
      fresh = body.deep_dup
      fresh[:inquiry][:request_key] = "new-disabled-public-inquiry"
      @public.post "#{path}/inquiries", params: fresh, headers: public_headers, as: :json
      assert_equal 404, @public.response.status
      changed = body.deep_dup
      changed[:inquiry][:display_name] = "Different requester"
      @public.post "#{path}/inquiries", params: changed, headers: public_headers, as: :json
      assert_equal 409, @public.response.status
    end
  end

  private

  def location(code)
    site = @practice.sites.create!(code: code, name: "Location #{code}", status: "active")
    7.times do |weekday|
      Clinic::Scheduling::CapacityRule.create!(practice: @practice, site: site, clinician: @clinician,
        kind: "weekly", weekday: weekday, start_minute: 0, end_minute: 1440, active: true)
    end
    site
  end

  def configure(site, specialty, services: [], finalize: true)
    Clinic::Configuration::PracticeFeatures.revise(practice: @practice, actor: @membership, site: site,
      request_key: "profile-#{site&.code || 'default'}", expected_revision: 0, insurance_workflows_enabled: false,
      clinic_type: specialty, service_scope: services, assessment_scope: [], finalize: finalize)
  end

  def preset_visit(site, key)
    id = Clinic::Configuration::PracticeFeatures.snapshot(practice: @practice, site: site)
      .dig(:starter_profile, "visits", key, "visit_type_id")
    @practice.visit_types.find(id)
  end

  # Append the reviewed resulting state as a local fixture; configuration review is tested by its owner.
  def disable_services(site, *services)
    previous = Clinic::PracticeFeatureVersion.where(practice: @practice, site: site).order(revision: :desc).first
    optional = previous.optional_features.deep_dup
    optional["service_scope"] -= services
    Clinic::PracticeFeatureVersion.create!(practice: @practice, site: site, created_by_membership: @membership,
      revision: previous.revision + 1, optional_features: optional, effective_from: Current.business_time,
      request_key: "disable-#{site.code}-#{previous.revision}", content_digest: Digest::SHA256.hexdigest(optional.to_json))
  end

  def anonymous_session
    session = open_session
    session.host! "localhost:3000"
    session.get "/api/csrf", headers: @headers
    [session, @headers.merge("X-CSRF-Token" => session.response.parsed_body.fetch("csrf_token"))]
  end

  def authenticated_session(user, password)
    session, headers = anonymous_session
    session.post "/api/session", params: { email_address: user.email_address, password: password }, headers: headers, as: :json
    assert_equal 200, session.response.status
    session.get "/api/csrf", headers: @headers
    [session, @headers.merge("X-CSRF-Token" => session.response.parsed_body.fetch("csrf_token"))]
  end

  def booking_body(site, visit, key, starts_at: @start)
    { appointment: { patient_id: @patient.id, site_id: site&.id, booked_clinician_id: @clinician.id,
      visit_type_id: visit.id, starts_at: starts_at.iso8601, ends_at: (starts_at + 30.minutes).iso8601, request_key: key } }
  end

  def staff_book(site, visit, key, starts_at: @start)
    @staff.post "/api/clinic/appointments", params: booking_body(site, visit, key, starts_at: starts_at), headers: @staff_headers, as: :json
    assert_equal 201, @staff.response.status, @staff.response.body
    @practice.appointments.find(@staff.response.parsed_body.dig("appointment", "id"))
  end

  def direct_book(site, visit, key, starts_at: @start, **extra)
    Clinic::Scheduling::BookAppointment.call(practice: @practice, actor: @user, patient: @patient, site: site,
      booked_clinician: @clinician, visit_type: visit, starts_at: starts_at, ends_at: starts_at + 30.minutes, request_key: key, **extra)
  end

  def hold_slot(site, key)
    Clinic::Scheduling::HoldSlot.call(practice: @practice, actor: @user, patient: @patient, site: site, clinician: @clinician,
      room: nil, starts_at: @start, ends_at: @start + 30.minutes, expires_at: 1.hour.from_now, request_key: key)
  end

  def enable_recurrence(site)
    Clinic::Scheduling::SitePolicy.save_revision!(practice: @practice, site: site, actor: @user, expected_revision: 0,
      recurrence_enabled: true, overbook_enabled: false, eligible_visit_type_ids: [])
  end

  def series_body(site, visit, key)
    { series: booking_body(site, visit, key).fetch(:appointment).merge(visit_modality: "in_person",
      interval_weeks: 1, occurrence_count: 2, expected_policy_revision: 1, resolutions: []) }
  end

  def portal_requests_path = "/api/patient_portal/appointment_requests"

  def portal_body(site, visit, key)
    { appointment_request: { request_key: key, site_id: site&.id, visit_type_id: visit.id,
      starts_at: @start.iso8601, ends_at: (@start + 30.minutes).iso8601 } }
  end

  def approve_request(request, site, visit, key)
    Clinic::PatientPortal::ReviewAppointmentRequest.approve(practice: @practice, actor: @user, request: request,
      request_key: key, site: site, visit_type: visit, booked_clinician: @clinician, starts_at: @start, ends_at: @start + 30.minutes)
  end

  def reschedule(appointment, key, version: appointment.updated_at, starts_at:, **extra)
    Clinic::Scheduling::RescheduleAppointment.call(appointment: appointment, actor: @user, starts_at: starts_at,
      ends_at: starts_at + 30.minutes, expected_updated_at: version, request_key: key, **extra)
  end

  def waitlist_body(site, visit, key)
    { waitlist: { request_key: key, patient_id: @patient.id, site_id: site.id, clinician_id: @clinician.id,
      visit_type_id: visit.id, earliest_at: @start.iso8601, latest_at: (@start + 2.hours).iso8601, duration_minutes: 30 } }
  end

  def published_offering(site, visit, key)
    manager = Clinic::Configuration::ManageServiceOffering
    offering = manager.create(practice: @practice, actor: @user, request_key: "#{key}-create",
      attributes: { name: "Therapy service", code: key, visit_type_id: visit.id, duration_minutes: 30,
        public_visible: true, site_ids: [site.id] }).offering
    manager.publish(practice: @practice, actor: @user, offering: offering, request_key: "#{key}-publish", lock_version: offering.lock_version).offering
  end
end
