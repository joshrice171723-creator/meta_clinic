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
    assert_equal "75090", site.fetch("postal_code")
    monday = site.fetch("operating_hours").find { |row| row.fetch("day_of_week") == 1 }
    assert_equal "08:00", monday.fetch("open_time")
    assert_equal "Synthetic holiday closure", site.fetch("hour_exceptions").sole.fetch("reason")

    patch "/api/clinic/facilities/#{site.fetch("id")}", params: {
      site: { name: "North clinic updated", status: "temporarily_closed" }
    }, headers: csrf_headers, as: :json

    assert_response :success
    assert_equal "North clinic updated", response.parsed_body.fetch("site").fetch("name")
    assert_equal "temporarily_closed", response.parsed_body.fetch("site").fetch("status")
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

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
