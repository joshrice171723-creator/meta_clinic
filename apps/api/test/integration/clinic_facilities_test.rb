require "test_helper"

class ClinicFacilitiesTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @user = User.create!(email_address: "facility-test@example.invalid", password: @password)
    @membership = Development::TestClinic.create!(@user)
    @practice = @membership.practice
    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  test "facility creation requires a complete shipping address" do
    post "/api/clinic/facilities", params: {
      site: { code: "NO-ADDRESS", name: "Missing address", status: "active" }
    }, headers: csrf_headers, as: :json

    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "requires an address"
  end

  test "facility profiles include address, contact, hours, and exceptions" do
    post "/api/clinic/facilities", params: {
      site: {
        code: "NORTH",
        name: "North clinic",
        status: "active",
        timezone_override: "America/Chicago",
        address_line1: "100 Synthetic Main Street",
        city: "Sherman",
        state: "TX",
        postal_code: "75090",
        country: "US",
        phone: "555-0100",
        contact_name: "Alex Example",
        contact_email: "alex@example.invalid",
        operating_hours: [
          { day_of_week: 1, closed: false, open_time: "08:00", close_time: "17:00" },
          { day_of_week: 6, closed: true }
        ],
        hour_exceptions: [
          { date: "2026-12-25", closed: true, reason: "Synthetic holiday closure" }
        ]
      }
    }, headers: csrf_headers, as: :json

    assert_response :created
    site = response.parsed_body.fetch("site")
    assert_equal "North clinic", site.fetch("name")
    assert_equal false, site.fetch("finalized")
    assert_equal ["Room 1", "Room 2"], site.fetch("rooms").map { |room| room.fetch("code") }
    assert_equal "75090", site.fetch("postal_code")
    monday = site.fetch("operating_hours").find { |row| row.fetch("day_of_week") == 1 }
    assert_equal "08:00", monday.fetch("open_time")
    assert_equal "Synthetic holiday closure", site.fetch("hour_exceptions").sole.fetch("reason")

    get "/api/clinic/context", headers: @headers
    assert_response :success
    assert_equal site.fetch("id"), response.parsed_body.dig("current_site", "id")
    assert_includes response.parsed_body.fetch("setup_incomplete_sites").map { |row| row.fetch("id") }, site.fetch("id")

    patch "/api/clinic/facilities/#{site.fetch("id")}", params: {
      site: { name: "North clinic updated", status: "temporarily_closed" }
    }, headers: csrf_headers, as: :json

    assert_response :success
    assert_equal "North clinic updated", response.parsed_body.fetch("site").fetch("name")
    assert_equal "temporarily_closed", response.parsed_body.fetch("site").fetch("status")
  end

  test "rooms can be added to a site and cannot be added to another practice" do
    site = @practice.sites.create!(code: "ROOM-SITE", name: "Room site")
    post "/api/clinic/facilities/#{site.id}/rooms", params: {
      room: { code: "Telehealth room 1", kind: "telehealth" }
    }, headers: csrf_headers, as: :json

    assert_response :created
    assert_equal "Telehealth room 1", response.parsed_body.fetch("room").fetch("code")
    assert_equal "telehealth", response.parsed_body.fetch("room").fetch("kind")
    assert_equal site.id, response.parsed_body.fetch("room").fetch("site_id")
    assert_equal 1, site.rooms.count
    room_id = response.parsed_body.fetch("room").fetch("id")
    patch "/api/clinic/facilities/#{site.id}/rooms/#{room_id}", params: {
      room: { code: "Telehealth suite", kind: "telehealth" }
    }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "Telehealth suite", site.rooms.find(room_id).code

    other_user = User.create!(email_address: "facility-room-other@example.invalid", password: @password)
    other_practice = Development::TestClinic.create!(other_user).practice
    other_site = other_practice.sites.create!(code: "OTHER-ROOM-SITE", name: "Other room site")
    post "/api/clinic/facilities/#{other_site.id}/rooms", params: {
      room: { code: "Forbidden room" }
    }, headers: csrf_headers, as: :json

    assert_response :not_found
    assert_empty other_site.rooms
  end

  test "departments can be added safely and stay scoped to the practice" do
    post "/api/clinic/facilities/departments", params: {
      department: { code: "Weight Management" }
    }, headers: csrf_headers, as: :json

    assert_response :created
    assert_equal "Weight Management", response.parsed_body.dig("department", "code")
    assert_equal 1, @practice.departments.where(code: "Weight Management").count
    assert @practice.audit_events.exists?(action_code: "facilities.department.configure")

    post "/api/clinic/facilities/departments", params: {
      department: { code: "Weight Management" }
    }, headers: csrf_headers, as: :json

    assert_response :created
    assert_equal 1, @practice.departments.where(code: "Weight Management").count

    other_user = User.create!(email_address: "facility-department-other@example.invalid", password: @password)
    other_practice = Development::TestClinic.create!(other_user).practice
    other_department = other_practice.departments.create!(code: "Other department")
    get "/api/clinic/facilities", params: { type: "departments" }, headers: @headers

    assert_response :success
    ids = response.parsed_body.fetch("departments").map { |row| row.fetch("id") }
    assert_includes ids, @practice.departments.find_by!(code: "Weight Management").id
    assert_not_includes ids, other_department.id
  end

  test "department creation requires a name and clinic write permission" do
    post "/api/clinic/facilities/departments", params: {
      department: { code: " " }
    }, headers: csrf_headers, as: :json

    assert_response :bad_request
    assert_not @practice.departments.exists?(code: " ")

    limited = User.create!(email_address: "facility-department-limited@example.invalid", password: @password)
    @practice.memberships.create!(user: limited)
    post "/api/session", params: { email_address: limited.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success

    post "/api/clinic/facilities/departments", params: {
      department: { code: "Unauthorized department" }
    }, headers: csrf_headers, as: :json

    assert_response :forbidden
    assert_not @practice.departments.exists?(code: "Unauthorized department")
  end

  test "detailed facility list batches profile associations" do
    2.times do |index|
      site = @practice.sites.create!(code: "BATCH-#{index}", name: "Batch facility #{index}", status: "draft")
      site.operating_hours.create!(practice: @practice, day_of_week: index, closed: true)
      site.hour_exceptions.create!(practice: @practice, date: Date.new(2026, 12, index + 1), closed: true)
      site.rooms.create!(practice: @practice, code: "ROOM-#{index}")
    end
    queries = []
    subscriber = ->(_name, _started, _finished, _unique_id, payload) { queries << payload[:sql].to_s }

    ActiveRecord::Base.uncached do
      ActiveSupport::Notifications.subscribed(subscriber, "sql.active_record") do
        get "/api/clinic/facilities", params: { type: "sites", detail: "true" }, headers: @headers
      end
    end

    assert_response :success
    %w[clinic_site_operating_hours clinic_site_hour_exceptions clinic_rooms].each do |table|
      assert_equal 1, queries.count { |sql| sql.match?(/FROM "#{table}"/i) }, queries.join("\n")
    end
  end

  test "a rejected hours update leaves the facility identity unchanged" do
    site = @practice.sites.create!(code: "ATOMIC", name: "Atomic facility", status: "draft")

    patch "/api/clinic/facilities/#{site.id}", params: {
      site: {
        name: "Partially saved name",
        operating_hours: [ { day_of_week: 9, closed: true } ]
      }
    }, headers: csrf_headers, as: :json

    assert_response :unprocessable_entity
    assert_equal "Atomic facility", site.reload.name
    assert_empty site.operating_hours
  end

  test "facility reads and writes stay scoped to the signed-in practice" do
    other_user = User.create!(email_address: "facility-other@example.invalid", password: @password)
    other_membership = Development::TestClinic.create!(other_user)
    other_site = other_membership.practice.sites.create!(code: "OTHER", name: "Other clinic")

    get "/api/clinic/facilities", params: { type: "sites" }, headers: @headers
    assert_response :success
    ids = response.parsed_body.fetch("sites").map { |row| row.fetch("id") }
    assert_not_includes ids, other_site.id

    patch "/api/clinic/facilities/#{other_site.id}", params: { site: { name: "Leaked update" } }, headers: csrf_headers, as: :json
    assert_response :not_found
    assert_equal "Other clinic", other_site.reload.name
  end

  test "visit types validate names, replay creates safely, and retire without deletion" do
    post "/api/clinic/visit_types", params: {
      visit_type: { request_key: "visit-type-invalid", code: "  " }
    }, headers: csrf_headers, as: :json

    assert_response :bad_request
    assert_equal 0, @practice.visit_types.count

    payload = { visit_type: { request_key: "visit-type-create", code: "Annual wellness" } }
    post "/api/clinic/visit_types", params: payload, headers: csrf_headers, as: :json

    assert_response :created
    visit_type = response.parsed_body.fetch("visit_type")
    assert_equal "Annual wellness", visit_type.fetch("code")

    post "/api/clinic/visit_types", params: payload, headers: csrf_headers, as: :json

    assert_response :success
    assert_equal 1, @practice.visit_types.where(code: "Annual wellness").count

    patch "/api/clinic/visit_types/#{visit_type.fetch("id")}", params: {
      visit_type: { request_key: "visit-type-retire", active: false }
    }, headers: csrf_headers, as: :json

    assert_response :success
    assert response.parsed_body.dig("visit_type", "retired_at").present?
    assert_equal 1, @practice.visit_types.where(id: visit_type.fetch("id")).count
  end

  test "visit type writes require practice authority and stay tenant scoped" do
    limited = User.create!(email_address: "facility-site-writer@example.invalid", password: @password)
    limited_membership = @practice.memberships.create!(user: limited)
    site = @practice.sites.create!(code: "GRANT-SITE", name: "Grant test site")
    grant_permissions!(limited_membership, "appointments.write", scope_kind: "site", site: site)
    grant_permissions!(limited_membership, "facilities.read")
    post "/api/session", params: { email_address: limited.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success

    get "/api/clinic/facilities", params: { type: "visit_types" }, headers: @headers
    assert_response :success
    assert_equal false, response.parsed_body.fetch("can_write")

    post "/api/clinic/visit_types", params: {
      visit_type: { request_key: "visit-type-site-denied", code: "Site-only type" }
    }, headers: csrf_headers, as: :json

    assert_response :forbidden
    assert_not @practice.visit_types.exists?(code: "Site-only type")

    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
    get "/api/clinic/facilities", params: { type: "visit_types" }, headers: @headers
    assert_response :success
    assert_equal true, response.parsed_body.fetch("can_write")
    other_user = User.create!(email_address: "visit-type-other@example.invalid", password: @password)
    other_membership = Development::TestClinic.create!(other_user)
    other_visit_type = other_membership.practice.visit_types.create!(code: "Other practice type")

    patch "/api/clinic/visit_types/#{other_visit_type.id}", params: {
      visit_type: { request_key: "visit-type-foreign", active: false }
    }, headers: csrf_headers, as: :json

    assert_response :not_found
    assert_nil other_visit_type.reload.retired_at
  end

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
