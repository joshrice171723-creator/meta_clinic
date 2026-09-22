require "test_helper"

class ClinicServiceOfferingsTest < ActionDispatch::IntegrationTest
  setup do
    organization = Organization.create!(name: "Service offering test organization")
    @practice = Clinic::Practice.create!(name: "Service offering practice", organization: organization, timezone: "UTC")
    @other_practice = Clinic::Practice.create!(name: "Other service offering practice", organization: organization, timezone: "UTC")
    @password = SecureRandom.hex(18)
    @actor = User.create!(email_address: "service-offerings@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "facilities.read", "facilities.write")
    @site = @practice.sites.create!(code: "MAIN", name: "Main site", status: "draft")
    @room = @site.rooms.create!(practice: @practice, code: "ROOM-1")
    @visit_type = @practice.visit_types.create!(code: "Weight management follow-up")
    @billing_service = @practice.billing_services.create!(name: "Follow-up price", unit_amount: "85.00", currency: "USD")
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    post "/api/session", params: { email_address: @actor.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  test "authorized setup publishes a site-scoped offering idempotently and retains it after retirement" do
    payload = {
      service_offering: {
        request_key: "service-offering-create-follow-up", name: "Weight management follow-up", code: "WM-FU",
        visit_type_id: @visit_type.id, billing_service_id: @billing_service.id, duration_minutes: 30,
        modality: "either", booking_required: true, requires_room: true, site_ids: [ @site.id ]
      }
    }
    post "/api/clinic/service_offerings", params: payload, headers: csrf_headers, as: :json
    assert_response :created
    created = response.parsed_body.fetch("service_offering")
    assert_equal "draft", created.fetch("status")
    assert_equal [ @site.id ], created.fetch("eligible_site_ids")

    post "/api/clinic/service_offerings", params: payload, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal created.fetch("id"), response.parsed_body.dig("service_offering", "id")
    assert_equal 1, @practice.service_offerings.count

    post "/api/clinic/service_offerings/#{created.fetch('id')}/publish",
      params: { service_offering: { request_key: "service-offering-publish-follow-up", lock_version: created.fetch("lock_version") } },
      headers: csrf_headers, as: :json
    assert_response :success
    published = response.parsed_body.fetch("service_offering")
    assert_equal "published", published.fetch("status")
    assert_not_nil published.fetch("published_at")

    post "/api/clinic/service_offerings/#{created.fetch('id')}/retire",
      params: { service_offering: { request_key: "service-offering-retire-follow-up", lock_version: published.fetch("lock_version") } },
      headers: csrf_headers, as: :json
    assert_response :success
    retired = response.parsed_body.fetch("service_offering")
    assert_equal "retired", retired.fetch("status")
    assert_not_nil retired.fetch("retired_at")
    assert_equal published.fetch("published_at"), retired.fetch("published_at")
    assert_equal created.fetch("id"), retired.fetch("id")
    assert_equal [ @site.id ], retired.fetch("eligible_site_ids")

    post "/api/clinic/service_offerings/#{created.fetch('id')}/retire",
      params: { service_offering: { request_key: "service-offering-retire-follow-up", lock_version: published.fetch("lock_version") } },
      headers: csrf_headers, as: :json
    assert_response :success
    assert_equal true, response.parsed_body.fetch("replayed")
    assert_equal retired.fetch("retired_at"), response.parsed_body.dig("service_offering", "retired_at")

    get "/api/clinic/service_offerings?status=retired", headers: @headers
    assert_response :success
    assert_equal [ created.fetch("id") ], response.parsed_body.fetch("service_offerings").map { |item| item.fetch("id") }
  end

  test "retired offerings cannot be edited or republished and status cannot bypass retirement" do
    post "/api/clinic/service_offerings", params: {
      service_offering: { request_key: "retirement-guard-create", name: "Guarded offering",
        visit_type_id: @visit_type.id, duration_minutes: 30, site_ids: [ @site.id ] }
    }, headers: csrf_headers, as: :json
    assert_response :created
    draft = response.parsed_body.fetch("service_offering")

    patch "/api/clinic/service_offerings/#{draft.fetch('id')}", params: {
      service_offering: { request_key: "retirement-guard-bypass", lock_version: draft.fetch("lock_version"), status: "retired" }
    }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal "draft", @practice.service_offerings.find(draft.fetch("id")).status

    post "/api/clinic/service_offerings/#{draft.fetch('id')}/publish", params: {
      service_offering: { request_key: "retirement-guard-publish", lock_version: draft.fetch("lock_version") }
    }, headers: csrf_headers, as: :json
    assert_response :success
    published = response.parsed_body.fetch("service_offering")

    post "/api/clinic/service_offerings/#{draft.fetch('id')}/retire", params: {
      service_offering: { request_key: "retirement-guard-retire", lock_version: published.fetch("lock_version") }
    }, headers: csrf_headers, as: :json
    assert_response :success
    retired = response.parsed_body.fetch("service_offering")

    patch "/api/clinic/service_offerings/#{draft.fetch('id')}", params: {
      service_offering: { request_key: "retirement-guard-edit", lock_version: retired.fetch("lock_version"), name: "Reopened" }
    }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    post "/api/clinic/service_offerings/#{draft.fetch('id')}/publish", params: {
      service_offering: { request_key: "retirement-guard-republish", lock_version: retired.fetch("lock_version") }
    }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal "retired", @practice.service_offerings.find(draft.fetch("id")).status
  end

  test "publication refuses a missing eligible site or an unavailable required room" do
    post "/api/clinic/service_offerings", params: {
      service_offering: {
        request_key: "service-offering-create-incomplete", name: "Incomplete offering", duration_minutes: 30,
        requires_room: true, site_ids: []
      }
    }, headers: csrf_headers, as: :json
    assert_response :created
    incomplete = response.parsed_body.fetch("service_offering")

    post "/api/clinic/service_offerings/#{incomplete.fetch('id')}/publish",
      params: { service_offering: { request_key: "service-offering-publish-incomplete", lock_version: incomplete.fetch("lock_version") } },
      headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_includes response.body, "eligible site"

    roomless = @practice.sites.create!(code: "REMOTE", name: "Remote site", status: "draft")
    patch "/api/clinic/service_offerings/#{incomplete.fetch('id')}",
      params: {
        service_offering: {
          request_key: "service-offering-complete-fields", lock_version: incomplete.fetch("lock_version"),
          visit_type_id: @visit_type.id, site_ids: [ roomless.id ]
        }
      }, headers: csrf_headers, as: :json
    assert_response :success
    completed = response.parsed_body.fetch("service_offering")

    post "/api/clinic/service_offerings/#{completed.fetch('id')}/publish",
      params: { service_offering: { request_key: "service-offering-publish-roomless", lock_version: completed.fetch("lock_version") } },
      headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_includes response.body, "room"
  end

  test "published offering keeps its eligible site when an edit removes required coverage" do
    post "/api/clinic/service_offerings", params: {
      service_offering: { request_key: "coverage-create", name: "Covered offering",
        visit_type_id: @visit_type.id, duration_minutes: 30, requires_room: true, site_ids: [ @site.id ] }
    }, headers: csrf_headers, as: :json
    assert_response :created
    draft = response.parsed_body.fetch("service_offering")
    post "/api/clinic/service_offerings/#{draft.fetch('id')}/publish", params: {
      service_offering: { request_key: "coverage-publish", lock_version: draft.fetch("lock_version") }
    }, headers: csrf_headers, as: :json
    assert_response :success
    published = response.parsed_body.fetch("service_offering")

    patch "/api/clinic/service_offerings/#{draft.fetch('id')}", params: {
      service_offering: { request_key: "coverage-remove-site", lock_version: published.fetch("lock_version"), site_ids: [] }
    }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_includes response.body, "eligible site"
    assert_equal [ @site.id ], @practice.service_offerings.find(draft.fetch("id")).sites.pluck(:id)

    roomless = @practice.sites.create!(code: "ROOMLESS", name: "Roomless site", status: "draft")
    patch "/api/clinic/service_offerings/#{draft.fetch('id')}", params: {
      service_offering: { request_key: "coverage-roomless-site", lock_version: published.fetch("lock_version"), site_ids: [ roomless.id ] }
    }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_includes response.body, "room"
    assert_equal [ @site.id ], @practice.service_offerings.find(draft.fetch("id")).sites.pluck(:id)
  end

  test "foreign offering is not addressable through this practice" do
    foreign = @other_practice.service_offerings.create!(name: "Foreign offering")
    patch "/api/clinic/service_offerings/#{foreign.id}",
      params: { service_offering: { request_key: "foreign-offering", lock_version: foreign.lock_version, name: "Nope" } },
      headers: csrf_headers, as: :json
    assert_response :not_found
    post "/api/clinic/service_offerings/#{foreign.id}/retire",
      params: { service_offering: { request_key: "foreign-retire", lock_version: foreign.lock_version } },
      headers: csrf_headers, as: :json
    assert_response :not_found
  end

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
