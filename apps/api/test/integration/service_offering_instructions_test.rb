require "test_helper"

class ServiceOfferingInstructionsTest < ActionDispatch::IntegrationTest
  setup do
    organization = Organization.create!(name: "Synthetic instruction organization")
    @practice = Clinic::Practice.create!(name: "Synthetic instruction clinic", organization: organization,
      timezone: "UTC", public_membership_slug: "synthetic-service-instructions")
    @other_practice = Clinic::Practice.create!(name: "Foreign instruction clinic", organization: organization, timezone: "UTC")
    @password = SecureRandom.hex(18)
    @actor = User.create!(email_address: "service-instructions@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "facilities.read", "facilities.write")
    @site = @practice.sites.create!(code: "MAIN", name: "Synthetic site", status: "active")
    configure_site!(@site, membership: @membership)
    @visit_type = @practice.visit_types.create!(code: "Synthetic service visit")
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    post "/api/session", params: { email_address: @actor.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  test "instructions persist, replay, publish, clear independently, and disappear on retirement" do
    payload = { service_offering: {
      request_key: "instructions-create", name: "Synthetic inquiry service", visit_type_id: @visit_type.id,
      duration_minutes: 30, site_ids: [ @site.id ], public_visible: true,
      contact_instructions: "  Ask the synthetic front desk about availability.\nUse the inquiry form.  ",
      referral_instructions: "  Ask the clinic how to provide a referral reference.  "
    } }
    post "/api/clinic/service_offerings", params: payload, headers: csrf_headers, as: :json
    assert_response :created
    offering = response.parsed_body.fetch("service_offering")
    assert_equal "Ask the synthetic front desk about availability.\nUse the inquiry form.", offering.fetch("contact_instructions")
    assert_equal "Ask the clinic how to provide a referral reference.", offering.fetch("referral_instructions")
    record = @practice.service_offerings.find(offering.fetch("id"))
    assert_equal offering.fetch("contact_instructions"), record.reload.contact_instructions
    post "/api/clinic/service_offerings", params: payload, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal true, response.parsed_body.fetch("replayed")
    assert_equal 1, @practice.service_offerings.count
    changed_payload = payload.deep_dup
    changed_payload[:service_offering][:referral_instructions] = "Changed same-key guidance"
    post "/api/clinic/service_offerings", params: changed_payload, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "idempotency_conflict", response.parsed_body.fetch("code")
    assert_equal offering.fetch("referral_instructions"), record.reload.referral_instructions
    get "/api/clinic/service_offerings", headers: @headers
    assert_response :success
    assert_equal offering, response.parsed_body.fetch("service_offerings").first
    get public_path
    assert_response :not_found

    post "/api/clinic/service_offerings/#{record.id}/publish", params: { service_offering: {
      request_key: "instructions-publish", lock_version: record.lock_version
    } }, headers: csrf_headers, as: :json
    assert_response :success
    get public_path
    assert_response :success
    visible = response.parsed_body.fetch("services").sole
    assert_equal record.contact_instructions, visible.fetch("contact_instructions")
    assert_equal record.referral_instructions, visible.fetch("referral_instructions")
    assert_equal %w[contact_instructions description duration_minutes id modality name referral_instructions], visible.keys.sort

    record.reload
    patch "/api/clinic/service_offerings/#{record.id}", params: { service_offering: {
      request_key: "instructions-clear-contact", lock_version: record.lock_version, contact_instructions: "   "
    } }, headers: csrf_headers, as: :json
    assert_response :success
    assert_nil record.reload.contact_instructions
    assert_equal offering.fetch("referral_instructions"), record.referral_instructions
    get public_path
    assert_response :success
    assert_nil response.parsed_body.fetch("services").sole.fetch("contact_instructions")
    post "/api/clinic/service_offerings/#{record.id}/retire", params: { service_offering: {
      request_key: "instructions-retire", lock_version: record.lock_version
    } }, headers: csrf_headers, as: :json
    assert_response :success
    get public_path
    assert_response :not_found
    assert_equal offering.fetch("referral_instructions"), record.reload.referral_instructions
  end

  test "overlong instructions and stale writes preserve saved values while unrelated drafts still save" do
    record = @practice.service_offerings.create!(name: "Saved instructions", contact_instructions: "Saved contact", referral_instructions: "Saved referral")
    %w[contact_instructions referral_instructions].each do |field|
      patch "/api/clinic/service_offerings/#{record.id}", params: { service_offering: {
        request_key: "instructions-long-#{field}", lock_version: record.lock_version, field => "x" * 501
      } }, headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
      assert_includes response.parsed_body.fetch("error"), "#{field} must be at most 500 characters."
      assert_equal "Saved contact", record.reload.contact_instructions
      assert_equal "Saved referral", record.referral_instructions
    end
    record.update!(contact_instructions: "Newer contact")
    patch "/api/clinic/service_offerings/#{record.id}", params: { service_offering: {
      request_key: "instructions-stale", lock_version: record.lock_version - 1, referral_instructions: "Stale referral"
    } }, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "stale_record", response.parsed_body.fetch("code")
    assert_equal "Newer contact", record.reload.contact_instructions
    assert_equal "Saved referral", record.referral_instructions
    post "/api/clinic/service_offerings", params: { service_offering: {
      request_key: "instructions-independent", name: "Independent draft"
    } }, headers: csrf_headers, as: :json
    assert_response :created
    assert_nil response.parsed_body.dig("service_offering", "contact_instructions")
    assert_nil response.parsed_body.dig("service_offering", "referral_instructions")
  end

  test "foreign and denied writes cannot change instructions" do
    foreign = @other_practice.service_offerings.create!(name: "Foreign offering", contact_instructions: "Foreign contact")
    patch "/api/clinic/service_offerings/#{foreign.id}", params: { service_offering: {
      request_key: "instructions-foreign", lock_version: foreign.lock_version, contact_instructions: "Changed"
    } }, headers: csrf_headers, as: :json
    assert_response :not_found
    assert_equal "Foreign contact", foreign.reload.contact_instructions
    local = @practice.service_offerings.create!(name: "Local offering", referral_instructions: "Local referral")
    reader = User.create!(email_address: "instructions-reader@example.invalid", password: @password)
    grant_permissions!(@practice.memberships.create!(user: reader), "facilities.read")
    post "/api/session", params: { email_address: reader.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
    get "/api/clinic/service_offerings", headers: @headers
    assert_response :success
    assert_equal false, response.parsed_body.fetch("can_write")
    patch "/api/clinic/service_offerings/#{local.id}", params: { service_offering: {
      request_key: "instructions-denied", lock_version: local.lock_version, referral_instructions: "Changed"
    } }, headers: csrf_headers, as: :json
    assert_response :forbidden
    assert_equal "Local referral", local.reload.referral_instructions
  end

  test "public service page excludes private, draft and foreign instructions" do
    visible = @practice.service_offerings.create!(name: "Visible offering", visit_type: @visit_type,
      duration_minutes: 30, public_visible: true, contact_instructions: "Visible contact")
    visible.offering_sites.create!(practice: @practice, site: @site)
    visible.update!(status: "published", published_at: Time.current)
    private_record = @practice.service_offerings.create!(name: "Private offering", visit_type: @visit_type,
      duration_minutes: 30, public_visible: false, referral_instructions: "Private referral")
    private_record.offering_sites.create!(practice: @practice, site: @site)
    private_record.update!(status: "published", published_at: Time.current)
    @practice.service_offerings.create!(name: "Draft offering", contact_instructions: "Draft contact", public_visible: true)
    foreign_site = @other_practice.sites.create!(code: "FOREIGN", name: "Foreign site", status: "draft")
    foreign_visit_type = @other_practice.visit_types.create!(code: "Foreign service visit")
    foreign = @other_practice.service_offerings.create!(name: "Foreign offering", visit_type: foreign_visit_type,
      duration_minutes: 30, contact_instructions: "Foreign contact", public_visible: true)
    foreign.offering_sites.create!(practice: @other_practice, site: foreign_site)
    foreign.update!(status: "published", published_at: Time.current)
    get public_path
    assert_response :success
    assert_equal [ visible.id ], response.parsed_body.fetch("services").map { |item| item.fetch("id") }
    assert_equal "Visible contact", response.parsed_body.fetch("services").sole.fetch("contact_instructions")
    %w[Private Draft Foreign].each { |text| refute_includes response.body, text }
  end

  private

  def public_path
    "/api/public/clinic_services/#{@practice.public_membership_slug}"
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
