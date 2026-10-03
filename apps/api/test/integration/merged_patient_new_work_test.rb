require "test_helper"

class MergedPatientNewWorkTest < ActionDispatch::IntegrationTest
  setup do
    travel_to Time.utc(2026, 10, 1, 8)
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    password = SecureRandom.hex(18)
    @practice = Clinic::Practice.create!(name: "Synthetic merged patient work", timezone: "UTC")
    @actor = User.create!(email_address: "merged-work-actor@example.invalid", password:)
    membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(membership, "patients.read", "patients.write", "appointments.book", "patient_portal.identity.invite", "facilities.write")
    @source = @practice.patients.create!(display_name: "Synthetic duplicate", reference: "MERGE-SOURCE")
    @target = @practice.patients.create!(display_name: "Synthetic canonical", reference: "MERGE-TARGET")
    [ @source, @target ].each do |patient|
      patient.contacts.create!(practice: @practice, contact_type: "email", contact_value: "merged-work-#{patient.reference.downcase}@example.invalid",
        preferred: true, effective_from: 1.day.ago)
    end
    @site = @practice.sites.create!(code: "MERGE", status: "active")
    @clinician = @practice.clinician_profiles.create!(membership:, display_name: "Synthetic merge clinician")
    @visit_type = @practice.visit_types.create!(code: "MERGE-VISIT")
    Clinic::Configuration::PracticeFeatures.revise(practice: @practice, site: @site, actor: membership,
      request_key: "merged-patient-site-profile", expected_revision: 0, insurance_workflows_enabled: false,
      clinic_type: "primary_care", service_scope: [], assessment_scope: [], finalize: true)
    Clinic::Scheduling::CapacityRule.create!(practice: @practice, site: @site, clinician: @clinician,
      kind: "weekly", weekday: 4, start_minute: 0, end_minute: 1440, active: true)
    submit "/api/session", email_address: @actor.email_address, password: password
    assert_response :success
    submit "/api/clinic/patients/#{@source.id}/merge", merge: { target_patient_id: @target.id, reason: "Synthetic duplicate reconciliation" }
    assert_response :success
    assert_equal @target.id, response.parsed_body.fetch("canonical_patient_id")
    @merge_evidence = @source.reload.attributes
    @contacts = @source.contacts.order(:id).map(&:attributes)
  end

  test "merged source booking is rejected without new work and canonical booking succeeds" do
    assert_no_difference [ -> { Clinic::Appointment.count }, -> { Clinic::OperationReceipt.count } ] do
      submit "/api/clinic/appointments", appointment_payload(@source)
      assert_equal 422, response.status
      assert_match(/merged.*canonical patient/i, response.parsed_body.fetch("error"))
    end
    assert_difference -> { Clinic::Appointment.count }, 1 do
      submit "/api/clinic/appointments", appointment_payload(@target)
      assert_response :created
      assert_equal @target.id, response.parsed_body.dig("appointment", "patient_id")
    end
    assert_merge_preserved
  end

  test "merged source invitation is rejected before account creation and canonical invitation succeeds" do
    assert_no_difference [ -> { User.count }, -> { Clinic::PatientPortal::Identity.count } ] do
      submit "/api/clinic/patient_portal/invitations", patient_portal_invitation: { patient_id: @source.id }
      assert_equal 422, response.status
      assert_match(/merged.*canonical patient/i, response.parsed_body.fetch("error"))
    end
    assert_difference [ -> { User.count }, -> { Clinic::PatientPortal::Identity.count } ], 1 do
      submit "/api/clinic/patient_portal/invitations", patient_portal_invitation: { patient_id: @target.id }
      assert_response :created
      identity = Clinic::PatientPortal::Identity.find(response.parsed_body.dig("invitation", "identity_id"))
      assert_equal @target.id, identity.patient_id
      assert_equal @practice.id, identity.practice_id
    end
    assert_merge_preserved
  end

  private

  def appointment_payload(patient)
    { appointment: { patient_id: patient.id, site_id: @site.id, booked_clinician_id: @clinician.id,
      visit_type_id: @visit_type.id, starts_at: "2026-10-01T09:00:00Z", ends_at: "2026-10-01T09:30:00Z",
      request_key: "merged-patient-book-#{patient.id}" } }
  end

  def assert_merge_preserved
    assert_equal @merge_evidence, @source.reload.attributes
    assert_equal @contacts, @source.contacts.order(:id).map(&:attributes)
  end

  def submit(path, params)
    get "/api/csrf", headers: @headers
    assert_response :success
    post path, params:, headers: @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token")), as: :json
  end
end
