require "test_helper"

class PracticeFeaturesTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @user = User.create!(email_address: "practice-features@example.invalid", password: @password)
    @membership = Development::TestClinic.create!(@user)
    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  test "recommended ambulatory profile is explicit and a full clinic setup is versioned" do
    get "/api/clinic/practice_features", headers: @headers
    assert_response :success
    initial = response.parsed_body.fetch("features")
    assert_equal false, initial.fetch("insurance_workflows_enabled")
    assert_equal false, initial.fetch("configured")
    assert_equal "primary_care", initial.fetch("recommended_clinic_type")
    assert_equal %w[telehealth external_lab_coordination minor_office_procedures in_office_medications],
      initial.fetch("recommended_service_scope")
    assert_equal [], initial.fetch("recommended_assessment_scope")
    assert_equal false, initial.fetch("assessment_configured")
    assert_equal false, initial.fetch("immunization_administration_enabled")
    %w[cash_pricing estimates invoices receipts card_payments refunds credits packages memberships].each do |feature|
      assert_equal true, initial.fetch("core").fetch(feature)
    end

    payload = { features: {
      clinic_type: "membership_primary_care",
      service_scope: %w[telehealth in_office_medications],
      assessment_scope: %w[depression fall_risk],
      insurance_workflows_enabled: true,
      expected_revision: 0,
      request_key: "configure-clinic"
    } }
    put "/api/clinic/practice_features", params: payload, headers: csrf_headers, as: :json
    assert_response :success
    saved = response.parsed_body.fetch("features")
    assert_equal true, saved.fetch("insurance_workflows_enabled")
    assert_equal true, saved.fetch("configured")
    assert_equal "membership_primary_care", saved.fetch("clinic_type")
    assert_equal %w[telehealth in_office_medications], saved.fetch("service_scope")
    assert_equal %w[depression fall_risk], saved.fetch("assessment_scope")
    assert_equal true, saved.fetch("assessment_configured")
    assert_equal 1, saved.fetch("revision")

    put "/api/clinic/practice_features", params: payload, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal 1, Clinic::PracticeFeatureVersion.where(practice: @membership.practice).count
  end

  test "selecting vaccination scope does not by itself enable administration" do
    put "/api/clinic/practice_features", params: {
      features: profile_payload(service_scope: %w[vaccinations], request_key: "vaccination-scope")
    }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal false, response.parsed_body.dig("features", "immunization_administration_enabled")
  end

  test "stale clinic setup edits do not overwrite a newer selection" do
    put "/api/clinic/practice_features", params: {
      features: profile_payload(insurance_workflows_enabled: true, expected_revision: 0,
        request_key: "first-selection")
    }, headers: csrf_headers, as: :json
    assert_response :success

    put "/api/clinic/practice_features", params: {
      features: profile_payload(insurance_workflows_enabled: false, expected_revision: 0,
        request_key: "stale-selection")
    }, headers: csrf_headers, as: :json
    assert_response :conflict
  end

  test "saved site profile history can be restored before normal setup finalization" do
    site = @membership.practice.sites.create!(code: "SETUP", status: "active")
    @membership.practice.visit_types.create!(code: "Synthetic setup visit")
    patch "/api/clinic/context", params: { site_id: site.id }, headers: csrf_headers, as: :json
    assert_response :success

    put "/api/clinic/practice_features", params: {
      features: profile_payload(site_id: site.id, service_scope: %w[telehealth])
    }, headers: csrf_headers, as: :json
    assert_response :success
    put "/api/clinic/practice_features", params: {
      features: profile_payload(site_id: site.id, expected_revision: 1)
    }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal 2, response.parsed_body.dig("features", "revision")
    assert_equal false, response.parsed_body.dig("features", "finalized")

    assert_no_difference -> { Clinic::PracticeFeatureVersion.where(practice: @membership.practice, site: site).count } do
      get "/api/clinic/practice_features/history", params: { site_id: site.id }, headers: @headers
      assert_response :success
    end
    versions = response.parsed_body.fetch("versions")
    assert_equal [ 2, 1 ], versions.map { |version| version.fetch("revision") }
    assert_equal %w[telehealth external_lab_coordination], versions.first.fetch("service_scope")
    saved = versions.last
    assert_equal %w[telehealth], saved.fetch("service_scope")

    restored = profile_payload(site_id: site.id, expected_revision: 2,
      clinic_type: saved.fetch("clinic_type"), service_scope: saved.fetch("service_scope"),
      assessment_scope: saved.fetch("assessment_scope"),
      insurance_workflows_enabled: saved.fetch("insurance_workflows"))
    put "/api/clinic/practice_features", params: { features: restored }, headers: csrf_headers, as: :json
    assert_response :success
    get "/api/clinic/practice_features", params: { site_id: site.id }, headers: @headers
    assert_response :success
    assert_equal 3, response.parsed_body.dig("features", "revision")
    assert_equal %w[telehealth], response.parsed_body.dig("features", "service_scope")
    assert_equal false, response.parsed_body.dig("features", "finalized")

    get "/api/clinic/patients", headers: @headers
    assert_response :conflict
    assert_equal "clinic_setup_required", response.parsed_body.fetch("code")

    put "/api/clinic/practice_features", params: {
      features: restored.merge(expected_revision: 3, request_key: SecureRandom.uuid, finalize: true)
    }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal true, response.parsed_body.dig("features", "finalized")
    assert_equal 4, response.parsed_body.dig("features", "revision")
    get "/api/clinic/practice_features/history", params: { site_id: site.id }, headers: @headers
    assert_response :success
    assert_equal [ 4, 3, 2, 1 ], response.parsed_body.fetch("versions").map { |version| version.fetch("revision") }
    get "/api/clinic/patients", headers: @headers
    assert_response :success
  end

  test "unfinalized profile history still requires facilities write rather than legacy setup access" do
    site = @membership.practice.sites.create!(code: "HISTORY", status: "active")
    patch "/api/clinic/context", params: { site_id: site.id }, headers: csrf_headers, as: :json
    assert_response :success
    put "/api/clinic/practice_features", params: {
      features: profile_payload(site_id: site.id)
    }, headers: csrf_headers, as: :json
    assert_response :success
    set_permission!(@membership, "facilities.write", false)

    get "/api/clinic/practice_features", params: { site_id: site.id }, headers: @headers
    assert_response :success
    get "/api/clinic/practice_features/history", params: { site_id: site.id }, headers: @headers
    assert_response :forbidden
    assert_not response.parsed_body.key?("versions")
  end

  test "unfinalized profile history requires practice write and isolates each site and practice" do
    practice = @membership.practice
    site = practice.sites.create!(code: "ALLOWED", status: "active")
    other_site = practice.sites.create!(code: "OTHER", status: "active")
    foreign_site = Clinic::Practice.create!(name: "Synthetic foreign history clinic").sites.create!(code: "FOREIGN")
    patch "/api/clinic/context", params: { site_id: site.id }, headers: csrf_headers, as: :json
    assert_response :success
    [ site, other_site ].each do |target|
      put "/api/clinic/practice_features", params: {
        features: profile_payload(site_id: target.id, service_scope: target == site ? %w[telehealth] : [])
      }, headers: csrf_headers, as: :json
      assert_response :success
    end
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "facilities.read")
    grant_permissions!(@membership, "facilities.write", scope_kind: "site", site: site)

    [ site, other_site ].each do |target|
      get "/api/clinic/practice_features/history", params: { site_id: target.id }, headers: @headers
      assert_response :forbidden
      assert_not response.parsed_body.key?("versions")
    end
    grant_permissions!(@membership, "facilities.write")

    get "/api/clinic/practice_features/history", params: { site_id: site.id }, headers: @headers
    assert_response :success
    assert_equal [ %w[telehealth] ], response.parsed_body.fetch("versions").map { |version| version.fetch("service_scope") }
    get "/api/clinic/practice_features/history", params: { site_id: other_site.id }, headers: @headers
    assert_response :success
    assert_equal [ [] ], response.parsed_body.fetch("versions").map { |version| version.fetch("service_scope") }
    get "/api/clinic/practice_features/history", params: { site_id: foreign_site.id }, headers: @headers
    assert_response :not_found
    assert_not response.parsed_body.key?("versions")
  end

  test "unknown clinic types and services are rejected without creating a version" do
    put "/api/clinic/practice_features", params: {
      features: profile_payload(clinic_type: "hospital", request_key: "unsupported-type")
    }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity

    put "/api/clinic/practice_features", params: {
      features: profile_payload(service_scope: %w[telehealth surgery], request_key: "unsupported-service")
    }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    put "/api/clinic/practice_features", params: {
      features: profile_payload(assessment_scope: %w[depression universal_triage], request_key: "unsupported-assessment")
    }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal 0, Clinic::PracticeFeatureVersion.where(practice: @membership.practice).count
  end

  test "a request key cannot be reused for a different clinic profile" do
    put "/api/clinic/practice_features", params: {
      features: profile_payload(request_key: "same-key")
    }, headers: csrf_headers, as: :json
    assert_response :success

    put "/api/clinic/practice_features", params: {
      features: profile_payload(clinic_type: "urgent_care", expected_revision: 1, request_key: "same-key")
    }, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal 1, Clinic::PracticeFeatureVersion.where(practice: @membership.practice).count
  end

  test "finalized starter preserves exact forms and independent clinic operations" do
    practice = @membership.practice
    practice.sites.create!(code: "WL#{SecureRandom.hex(2).upcase}", name: "Synthetic weight clinic", status: "active")
    payload = profile_payload(clinic_type: "weight_loss", service_scope: %w[telehealth prescription_preparation])
    put "/api/clinic/practice_features", params: { features: payload }, headers: csrf_headers, as: :json
    assert_response :success
    starter = response.parsed_body.dig("features", "starter_profile")
    assert_equal 2, starter.fetch("visits").size
    put "/api/clinic/practice_features", params: { features: payload }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal 2, practice.visit_types.count
    original = Clinic::Care::PrevisitIntake.encode(text: "", answers: { "goals" => "Synthetic goal" },
      attested: true, form_id: starter.dig("visits", "initial", "form_id"))
    payload.merge!(expected_revision: 1, request_key: SecureRandom.uuid, finalize: true)
    put "/api/clinic/practice_features", params: { features: payload }, headers: csrf_headers, as: :json
    assert_response :success
    assert response.parsed_body.dig("features", "finalized")
    payload.merge!(expected_revision: 2, request_key: SecureRandom.uuid, clinic_type: "primary_care")
    put "/api/clinic/practice_features", params: { features: payload }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "Protected profile change"
    login_service_impact_reader!("clinical_records.read", "encounters.write")
    payload.merge!(clinic_type: "weight_loss", service_scope: %w[telehealth], request_key: SecureRandom.uuid)
    get "/api/clinic/practice_features", params: { preview_service_change: "1", expected_revision: 2, service_scope: %w[telehealth] }, headers: @headers
    assert_response :success
    payload[:expected_impact_digest] = response.parsed_body.dig("preview", "impact_digest")
    put "/api/clinic/practice_features", params: { features: payload }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal starter, response.parsed_body.dig("features", "starter_profile")
    assert_not Clinic::Care::ClinicalPlanWorkflow.new_work_available?(practice, :medication_requests)
    assert Clinic::Care::ClinicalPlanWorkflow.new_work_available?(practice, :care_plans)
    assert_equal "Synthetic goal", Clinic::Care::PrevisitIntake.decode(original).dig("answers", "goals", "value")
    assert_equal "weight-management-initial-v1", Clinic::Care::PrevisitIntake.decode(original).fetch("form_id")
  end

  test "behavioral health starter reuses explicit visits and retries without duplication" do
    practice = @membership.practice
    initial = practice.visit_types.create!(code: "Behavioral health initial visit")
    payload = profile_payload(clinic_type: "behavioral_health", service_scope: %w[psychiatric_evaluation adhd_evaluation medication_management individual_therapy urgent_clinical_follow_up])
    starter = nil
    2.times do
      put "/api/clinic/practice_features", params: { features: payload }, headers: csrf_headers, as: :json
      assert_response :success
      starter = response.parsed_body.dig("features", "starter_profile")
      assert_equal initial.id, starter.dig("visits", "initial", "visit_type_id")
      assert_equal "behavioral-health-initial-v1", starter.dig("visits", "initial", "form_id")
      assert_equal "behavioral-health-follow-up-v1", starter.dig("visits", "follow_up", "form_id")
    end
    assert_equal 8, practice.visit_types.count
    assert_equal "behavioral-health-follow-up-v1", starter.dig("visits", "medication_follow_up", "form_id")
    assert_equal "behavioral-health-initial-v1", starter.dig("visits", "psychiatric_evaluation", "form_id")
  end

  test "Muse 73 previsit forms follow the appointment site and visit type without a booking chooser" do
    practice = @membership.practice
    sites = %w[MAP-WEIGHT MAP-BEHAVIOR].map { |code| practice.sites.create!(code: code, status: "active") }
    starters = sites.zip(%w[weight_loss behavioral_health]).map do |site, clinic_type|
      put "/api/clinic/practice_features", params: {
        features: profile_payload(site_id: site.id, clinic_type: clinic_type, service_scope: [], finalize: true)
      }, headers: csrf_headers, as: :json
      assert_response :success
      response.parsed_body.dig("features", "starter_profile")
    end
    patient = practice.patients.first!
    clinician = practice.clinician_profiles.create!(membership: @membership, display_name: "Synthetic Form Mapping Clinician")
    starts_at = (Current.business_time + 7.days).change(hour: 9, min: 0, sec: 0, usec: 0)
    booked_forms = []
    sites.zip(starters).each do |site, starter|
      Clinic::Scheduling::CapacityRule.create!(practice:, site:, clinician:, kind: "weekly",
        weekday: starts_at.in_time_zone(practice.timezone).wday, start_minute: 0, end_minute: 1440, active: true)
      %w[initial follow_up].each do |kind|
        definition = starter.fetch("visits").fetch(kind)
        appointment = practice.appointments.new(site: site, visit_type_id: definition.fetch("visit_type_id"))
        form = Clinic::Care::PrevisitIntake.form_for(practice: practice, appointment: appointment)
        assert_equal definition.fetch("form_id"), form.fetch(:id)
        booking_start = starts_at + booked_forms.length.hours
        post "/api/clinic/appointments", params: { appointment: {
          patient_id: patient.id, site_id: site.id, booked_clinician_id: clinician.id,
          visit_type_id: definition.fetch("visit_type_id"), starts_at: booking_start.iso8601,
          ends_at: (booking_start + 30.minutes).iso8601, request_key: SecureRandom.uuid
        } }, headers: csrf_headers, as: :json
        assert_response :created
        booked = response.parsed_body.fetch("appointment")
        booked_forms << [ booked.fetch("id"), definition.fetch("form_id") ]
      end
    end
    wrong_site = practice.appointments.new(site: sites.last,
      visit_type_id: starters.first.dig("visits", "initial", "visit_type_id"))
    assert_equal Clinic::Care::PrevisitIntake::FORM_ID,
      Clinic::Care::PrevisitIntake.form_for(practice: practice, appointment: wrong_site).fetch(:id)
    assert_equal "weight-management-initial-v1", Clinic::Care::PrevisitIntake.form_for(
      practice: practice, appointment: wrong_site, payload: { "form_id" => "weight-management-initial-v1" }).fetch(:id)

    portal_password = "Synthetic-form-mapping-2026!"
    portal_user = User.create!(email_address: "form-mapping-patient@example.invalid", password: portal_password)
    Clinic::PatientPortal::Identity.create!(practice:, patient:, user: portal_user,
      status: "active", invited_at: 1.minute.ago, activated_at: 1.minute.ago)
    post "/api/session", params: { email_address: portal_user.email_address, password: portal_password },
      headers: csrf_headers, as: :json
    assert_response :success
    booked_forms.each do |appointment_id, form_id|
      2.times do
        get "/api/patient_portal/appointments/#{appointment_id}/previsit_note", headers: @headers
        assert_response :success
        assert_equal appointment_id, response.parsed_body.fetch("appointment_id")
        assert_equal form_id, response.parsed_body.dig("intake_form", "id")
        assert_nil response.parsed_body.fetch("note")
      end
    end
  end

  test "renaming and retiring starter visits preserve IDs forms and customization on reapply" do
    practice = @membership.practice
    payload = profile_payload(clinic_type: "weight_loss")
    put "/api/clinic/practice_features", params: { features: payload }, headers: csrf_headers, as: :json
    assert_response :success
    original = response.parsed_body.dig("features", "starter_profile", "visits")
    initial = practice.visit_types.find(original.dig("initial", "visit_type_id"))
    follow_up = practice.visit_types.find(original.dig("follow_up", "visit_type_id"))
    initial.update!(code: "SYN_Customized initial visit")
    follow_up.update!(code: "SYN_Retired follow-up", retired_at: Time.current)
    payload.merge!(expected_revision: 1, request_key: "renamed-starter-reapply", assessment_scope: %w[depression])
    assert_no_difference -> { practice.visit_types.count } do
      2.times do
        put "/api/clinic/practice_features", params: { features: payload }, headers: csrf_headers, as: :json
        assert_response :success
        visits = response.parsed_body.dig("features", "starter_profile", "visits")
        assert_equal initial.id, visits.dig("initial", "visit_type_id")
        assert_equal "SYN_Customized initial visit", visits.dig("initial", "name")
        assert_equal follow_up.id, visits.dig("follow_up", "visit_type_id")
        assert_equal original.dig("follow_up", "form_id"), visits.dig("follow_up", "form_id")
        assert_predicate follow_up.reload.retired_at, :present?
      end
    end
    assert_equal 2, Clinic::PracticeFeatureVersion.where(practice:).count
  end

  test "starter replay rejects unavailable or foreign linked IDs without replacing them" do
    practice = @membership.practice
    foreign = Clinic::Practice.create!(name: "SYN_Foreign starter clinic").visit_types.create!(code: "SYN_Foreign visit")
    [ foreign.id, -1 ].each do |id|
      previous = { "id" => "weight-management", "visits" => { "initial" => { "visit_type_id" => id } } }
      assert_no_difference -> { practice.visit_types.count } do
        assert_raises ArgumentError do
          Clinic::Configuration::StarterProfile.apply(practice:, clinic_type: "weight_loss", previous:)
        end
      end
    end
  end

  test "disable preview is read only scoped and revalidated while exact committed replay survives later work" do
    practice = @membership.practice
    site = practice.sites.create!(code: "IMPACT", status: "active")
    practice.visit_types.create!(code: "SYN_Impact visit")
    payload = profile_payload(site_id: site.id, finalize: true)
    put "/api/clinic/practice_features", params: { features: payload }, headers: csrf_headers, as: :json
    assert_response :success
    patient = practice.patients.first
    visit = practice.appointments.create!(patient:, site:, status: "scheduled", visit_modality: "video",
      starts_at: 1.day.from_now, ends_at: 1.day.from_now + 30.minutes)
    other_site = practice.sites.create!(code: "OTHERIMPACT", status: "active")
    practice.appointments.create!(patient:, site: other_site, status: "scheduled", visit_modality: "video",
      starts_at: 2.days.from_now, ends_at: 2.days.from_now + 30.minutes)
    login_service_impact_reader!("appointments.read", "encounters.read", "encounters.write",
      "telehealth.read", "scribe.read", "notes.read")
    preview = disable_preview(site:)
    assert_equal site.id, preview.fetch("site_id")
    assert_equal 1, preview.fetch("revision")
    assert_equal 1, preview.fetch("services").first.fetch("open_records")
    assert_not preview.to_json.include?(patient.display_name)
    assert_not preview.to_json.include?("patient_id")
    disable = payload.merge(service_scope: %w[external_lab_coordination], finalize: false,
      expected_revision: 1, request_key: "disable-preview", expected_impact_digest: preview.fetch("impact_digest"))
    visit.update!(reason: "SYN_Changed after preview")
    put "/api/clinic/practice_features", params: { features: disable }, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "service_impact_changed", response.parsed_body.fetch("code")
    assert_equal 1, Clinic::PracticeFeatureVersion.where(practice:, site:).count
    disable[:expected_impact_digest] = disable_preview(site:).fetch("impact_digest")
    put "/api/clinic/practice_features", params: { features: disable }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "scheduled", visit.reload.status
    assert_equal %w[external_lab_coordination], response.parsed_body.dig("features", "service_scope")
    visit.update!(reason: "SYN_Changed after commit")
    put "/api/clinic/practice_features", params: { features: disable }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal 2, Clinic::PracticeFeatureVersion.where(practice:, site:).count
    assert_not Clinic::Configuration::StarterProfile.service_available?(practice:, site:, service: "telehealth")
    assert Clinic::Configuration::StarterProfile.service_available?(practice:, site:, service: "external_lab_coordination")
  end

  test "configuration-only preview reports unknown work and cannot grant chart or foreign scope access" do
    practice = @membership.practice
    practice.sites.create!(code: "RESTRICTED", status: "active")
    practice.visit_types.create!(code: "SYN_Restricted visit")
    payload = profile_payload(finalize: true)
    put "/api/clinic/practice_features", params: { features: payload }, headers: csrf_headers, as: :json
    assert_response :success
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "facilities.read", "facilities.write")
    preview = disable_preview
    assert_equal "restricted", preview.fetch("services").first.fetch("status")
    assert_nil preview.fetch("services").first.fetch("open_records")
    assert_equal false, preview.fetch("review_complete")
    assert_no_difference -> { Clinic::PracticeFeatureVersion.where(practice:).count } do
      put "/api/clinic/practice_features", params: { features: payload.merge(finalize: false,
        service_scope: %w[external_lab_coordination], expected_revision: 1,
        request_key: "restricted-service-impact-save", expected_impact_digest: preview.fetch("impact_digest")) },
        headers: csrf_headers, as: :json
      assert_response :conflict
      assert_equal "service_impact_changed", response.parsed_body.fetch("code")
    end
    get "/api/clinic/patients", headers: @headers
    assert_response :forbidden
    foreign_site = Clinic::Practice.create!(name: "SYN_Foreign preview").sites.create!(code: "FOREIGN")
    get "/api/clinic/practice_features", params: { preview_service_change: "1", expected_revision: 1,
      site_id: foreign_site.id, service_scope: [] }, headers: @headers
    assert_response :not_found
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "facilities.read")
    get "/api/clinic/practice_features", params: { preview_service_change: "1", expected_revision: 1,
      service_scope: [] }, headers: @headers
    assert_response :forbidden
    assert_not response.parsed_body.key?("preview")
  end

  test "current order revisions and unfinished source tasks stay independent in disable preview" do
    practice = @membership.practice
    site = practice.sites.create!(code: "LABIMPACT", status: "active")
    practice.visit_types.create!(code: "SYN_Lab impact visit")
    payload = profile_payload(site_id: site.id, finalize: true)
    put "/api/clinic/practice_features", params: { features: payload }, headers: csrf_headers, as: :json
    assert_response :success
    patient = practice.patients.first
    encounter = practice.encounters.create!(patient:, site:, started_at: 1.hour.ago, status: "open")
    attributes = { practice:, patient:, encounter:, site:, recorded_by_membership: @membership,
      recorded_at: Current.business_time, series_id: SecureRandom.uuid, version_number: 1,
      request_key: "lab-impact-draft", content_digest: "a" * 64, status: "draft",
      request_kind: "lab", intent: "order", priority: "routine", requested_display: "SYN_Lab order" }
    draft = Clinic::Care::ServiceRequestRevision.create!(attributes)
    Clinic::Care::ServiceRequestRevision.create!(attributes.merge(prior_revision: draft,
      version_number: 2, status: "completed", request_key: "lab-impact-completed",
      content_digest: "b" * 64, completion_exception: "SYN_Recorded completion"))
    task = Clinic::ClinicalTask.create!(practice:, patient:, encounter:, site:,
      recorded_by_membership: @membership, task_kind: "order_execution", state: "open",
      pool_code: "clinical", source_type: "order", source_kind: "service_request", source_id: draft.id)
    login_service_impact_reader!("clinical_records.read", "encounters.write", "notes.read")
    get "/api/clinic/practice_features", params: { preview_service_change: "1", site_id: site.id,
      expected_revision: 1, service_scope: %w[telehealth] }, headers: @headers
    assert_response :success
    preview = response.parsed_body.fetch("preview")
    lab = preview.fetch("services").first
    assert_equal "external_lab_coordination", lab.fetch("service")
    assert_equal 0, lab.fetch("open_records")
    assert_equal 1, lab.fetch("open_tasks")
    assert_equal 1, lab.fetch("unassigned_tasks")
    put "/api/clinic/practice_features", params: { features: payload.merge(finalize: false,
      service_scope: %w[telehealth], expected_revision: 1, request_key: "disable-lab-with-owned-work",
      expected_impact_digest: preview.fetch("impact_digest")) }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "open", task.reload.state
    assert_equal "clinical", task.pool_code
    assert_equal draft.id, task.source_id
    assert_equal 2, Clinic::Care::ServiceRequestRevision.where(practice:, series_id: draft.series_id).count
  end

  test "disable cannot bypass preview while permitted independent assessment edits and protected denial remain" do
    practice = @membership.practice
    practice.sites.create!(code: "KEEP", status: "active")
    practice.visit_types.create!(code: "SYN_Keep visit")
    payload = profile_payload(finalize: true)
    put "/api/clinic/practice_features", params: { features: payload }, headers: csrf_headers, as: :json
    assert_response :success
    disable = payload.merge(service_scope: [], finalize: false, expected_revision: 1, request_key: "without-review")
    put "/api/clinic/practice_features", params: { features: disable }, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "service_impact_changed", response.parsed_body.fetch("code")
    put "/api/clinic/practice_features", params: { features: payload.merge(finalize: false,
      expected_revision: 1, request_key: "independent-assessment", assessment_scope: %w[depression]) }, headers: csrf_headers, as: :json
    assert_response :success
    put "/api/clinic/practice_features", params: { features: payload.merge(finalize: false,
      expected_revision: 2, request_key: "protected-change", clinic_type: "weight_loss") }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "Protected profile change"
  end

  test "inherited clinic default saves an independent location revision and exact replay" do
    practice = @membership.practice
    defaults = profile_payload(service_scope: %w[telehealth], request_key: "inherited-default")
    put "/api/clinic/practice_features", params: { features: defaults }, headers: csrf_headers, as: :json
    assert_response :success
    site = practice.sites.create!(code: "INHERITED-QA", status: "active")
    get "/api/clinic/practice_features", params: { site_id: site.id }, headers: @headers
    assert_response :success
    inherited = response.parsed_body.fetch("features")
    assert_equal "unconfigured", inherited.fetch("profile_scope")
    assert_equal 0, inherited.fetch("revision")
    assert_equal false, inherited.fetch("configured")
    assert_equal [], inherited.fetch("service_scope")
    payload = profile_payload(site_id: site.id, service_scope: inherited.fetch("recommended_service_scope"),
      expected_revision: 0, request_key: "inherited-location-save")
    2.times do
      put "/api/clinic/practice_features", params: { features: payload }, headers: csrf_headers, as: :json
      assert_response :success
      assert_equal 1, response.parsed_body.dig("features", "revision")
      assert_equal true, response.parsed_body.dig("features", "configured")
    end
    assert_equal 1, Clinic::PracticeFeatureVersion.where(practice:, site:).count
    assert_equal 1, Clinic::PracticeFeatureVersion.where(practice:, site: nil).count
    assert_equal %w[telehealth], Clinic::PracticeFeatureVersion.where(practice:, site: nil).first.optional_features.fetch("service_scope")
    put "/api/clinic/practice_features", params: { features: payload.merge(service_scope: []) }, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal 1, Clinic::PracticeFeatureVersion.where(practice:, site:).count
  end

  private

  def login_service_impact_reader!(*domain_permissions)
    ordinary_grant_ids = @membership.role_grants.order(:id).pluck(:id)
    reader = User.create!(email_address: "impact-reader-#{SecureRandom.hex(6)}@example.invalid", password: @password)
    reader_membership = @membership.practice.memberships.create!(user: reader)
    grant_permissions!(reader_membership, "patients.read", "facilities.read", "facilities.write", *domain_permissions)
    assert_equal ordinary_grant_ids, @membership.role_grants.order(:id).pluck(:id)
    post "/api/session", params: { email_address: reader.email_address, password: @password },
      headers: csrf_headers, as: :json
    assert_response :success
  end

  def disable_preview(site: nil)
    assert_no_difference -> { Clinic::PracticeFeatureVersion.where(practice: @membership.practice).count } do
      get "/api/clinic/practice_features", params: { preview_service_change: "1", site_id: site&.id,
        expected_revision: 1, service_scope: %w[external_lab_coordination] }, headers: @headers
      assert_response :success
    end
    response.parsed_body.fetch("preview")
  end

  def profile_payload(overrides = {})
    {
      clinic_type: "primary_care",
      service_scope: %w[telehealth external_lab_coordination],
      assessment_scope: [],
      insurance_workflows_enabled: false,
      expected_revision: 0,
      request_key: "profile-#{SecureRandom.uuid}"
    }.merge(overrides)
  end
end
