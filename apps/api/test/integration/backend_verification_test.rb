require "test_helper"

class BackendVerificationTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @tenants = %w[A B].map do |label|
      organization = Organization.create!(name: "Synthetic Organization #{label}")
      user = User.create!(email_address: "verification-#{label}@example.invalid", password: @password)
      practice = Clinic::Practice.create!(name: "Synthetic Practice #{label}", organization: organization)
      membership = Clinic::Membership.create!(practice: practice, user: user)
      grant_permissions!(membership, *Development::TestClinic::DEFAULT_PERMISSIONS)
      patient = practice.patients.create!(display_name: "Synthetic Patient #{label}", reference: "VERIFY-#{label}")
      site = practice.sites.create!(code: "MAIN")
      encounter = practice.encounters.create!(patient: patient, site: site, started_at: 1.hour.ago, status: "open")
      note = Clinic::Care::CreateEncounterNote.call(practice: practice, actor: user, encounter: encounter,
        encrypted_body: "synthetic-secret-body", request_key: "verification-#{label.downcase}-legacy-note")
      category = Clinic::DocumentCategory.create!(practice: practice, code: "SYN", name: "Synthetic")
      document = practice.documents.create!(patient: patient, category: category, object_key: "private/synthetic-#{label}", object_version: "1", checksum: "synthetic", byte_size: 1, media_type: "text/plain", scan_state: "pending")
      invoice = Clinic::Billing::DraftInvoice.call(practice: practice, actor: user, patient: patient, currency: "USD", lines: [ { quantity: "1", unit_amount: "10", description_snapshot: "Synthetic service" } ])
      message = Clinic::Messaging::CreateIntent.call(practice: practice, actor: user, patient: patient, request_key: "verify", purpose_code: "synthetic", encrypted_recipient_snapshot: "synthetic-recipient", encrypted_content: "synthetic-content")
      { user: user, practice: practice, membership: membership, patient: patient, site: site, encounter: encounter, note: note, document: document, invoice: invoice, message: message }
    end
    login(@tenants.first[:user])
  end

  test "each tenant can read its own resources and forged IDs fail in both directions" do
    @tenants.each do |own|
      foreign = (@tenants - [ own ]).first
      login(own[:user])
      { patient: "patients", encounter: "encounters", note: "notes", document: "documents", invoice: "invoices", message: "message_intents" }.each do |key, path|
        own_params = key == :encounter ? { patient_id: own[:patient].id } : {}
        foreign_params = key == :encounter ? { patient_id: foreign[:patient].id } : {}
        get "/api/clinic/#{path}/#{own[key].id}", params: own_params, headers: @headers
        assert_response :success
        assert_equal "no-store", response.headers["Cache-Control"]
        get "/api/clinic/#{path}/#{foreign[key].id}", params: foreign_params, headers: @headers
        assert_response :not_found
        assert_equal({ "error" => "Not found." }, response.parsed_body)
      end
      %w[encounters observations address_versions documents message_intents invoices].each do |path|
        get "/api/clinic/patients/#{foreign[:patient].id}/#{path}", headers: @headers
        assert_includes [ 200, 404 ], response.status
        if response.status == 200
          assert_equal 0, response.parsed_body.fetch("pagination").fetch("total")
        end
      end
      get "/api/clinic/patients", params: { q: foreign[:patient].reference }, headers: @headers
      assert_response :success
      assert_empty response.parsed_body.fetch("patients")
      get "/api/clinic/patients", params: { per_page: 1 }, headers: @headers
      assert_equal 1, response.parsed_body.dig("pagination", "total")
    end
  end

  test "all clinic route actions require authentication" do
    submit "/api/session", {}, method: :delete
    Rails.application.routes.routes.select { |r| r.path.spec.to_s.start_with?("/api/clinic") }.each do |route|
      path = route.path.spec.to_s.sub("(.:format)", "").gsub(/:[a-z_]+/, "1")
      public_send(route.verb.downcase, path, params: {}, headers: csrf_headers, as: :json)
      assert_response :unauthorized, "#{route.verb} #{path}"
    end
  end

  test "all clinic routes reject revoked membership and disabled identity" do
    @tenants.first[:membership].update!(active: false)
    get "/api/clinic/context", headers: @headers
    assert_response :forbidden
    @tenants.first[:membership].update!(active: true)
    @tenants.first[:user].update!(active: false)
    get "/api/clinic/context", headers: @headers
    assert_response :unauthorized
  end

  test "collection APIs enforce bounds and tenant-filtered counts" do
    %w[patients appointments encounters facilities clinicians document_categories role_versions role_grants inventory staff].each do |path|
      get "/api/clinic/#{path}", params: { per_page: 1 }, headers: @headers
      assert_response :success
      assert_equal 1, response.parsed_body.dig("pagination", "per_page")
      get "/api/clinic/#{path}", params: { per_page: 101 }, headers: @headers
      assert_response :bad_request
    end
  end

  test "patient protected attributes are rejected and versions derive actor from the session" do
    own = @tenants.first
    assert_no_difference "Clinic::Care::Patient.count" do
      submit "/api/clinic/patients", { clinic_patient: { display_name: "Synthetic", reference: "NEW", practice_id: @tenants.last[:practice].id } }
      assert_response :bad_request
    end
    submit "/api/clinic/patients", { clinic_patient: { display_name: "Synthetic unique marker", reference: "NEW" }, actor_reference: "forged" }
    assert_response :created
    patient = own[:practice].patients.find(response.parsed_body.fetch("id"))
    version = patient.versions.last
    assert_equal own[:user].id.to_s, version.whodunnit
    assert_equal own[:user].id.to_s, version.actor_reference
    assert version.request_id.present?
    assert_not_includes version.attributes.to_json, "Synthetic unique marker"
    assert_nil PaperTrail.request.whodunnit
  end

  test "site scoped writers can create at their site but cannot use another site" do
    own = @tenants.first
    revoke_all_permissions!(own[:membership])
    grant_permissions!(own[:membership], "appointments.write", scope_kind: "site", site: own[:site])
    payload = { appointment: { patient_id: own[:patient].id, site_id: own[:site].id, starts_at: "2026-09-01T09:00:00Z", ends_at: "2026-09-01T09:30:00Z" } }
    submit "/api/clinic/appointments", payload
    assert_response :created
    other_site = own[:practice].sites.create!(code: "OTHER")
    payload[:appointment][:site_id] = other_site.id
    submit "/api/clinic/appointments", payload
    assert_response :forbidden
  end

  test "workflow errors return safe statuses and roll back multi-record writes" do
    own = @tenants.first
    foreign = @tenants.last
    assert_no_difference [ "Clinic::MessageIntent.count", "Clinic::MessageOutbox.count", "Clinic::ModelVersion.count" ] do
      submit "/api/clinic/patients/#{own[:patient].id}/message_intents", { message_intent: { request_key: "bad-link", purpose_code: "synthetic", encrypted_recipient_snapshot: "synthetic", encrypted_content: "synthetic", document_ids: [ foreign[:document].id ] } }
      assert_response :not_found
    end
    submit "/api/clinic/role_grants", { grant: { membership_id: own[:membership].id, role_version_id: own[:membership].role_grants.first.role_version_id, scope_kind: "practice" } }
    assert_response :forbidden
    submit "/api/clinic/patients/#{own[:patient].id}/observations", { observation: { request_key: "verification-wrong-encounter", encounter_id: foreign[:encounter].id, code: "SYN", code_system: "synthetic", code_version: "1", value_kind: "numeric", numeric_value: "10", unit_code: "cm", observed_at: "2026-09-01T09:00:00Z" } }
    assert_includes [ 404, 422 ], response.status
  end

  test "invoice post returns a serialized invoice and safe retry conflict" do
    invoice = @tenants.first[:invoice]
    submit "/api/clinic/invoices/#{invoice.id}/post"
    assert_response :success
    assert_equal "posted", response.parsed_body.dig("invoice", "status")
    submit "/api/clinic/invoices/#{invoice.id}/post"
    assert_response :unprocessable_entity
  end

  test "sensitive payloads and raw storage references stay out of metadata serializers" do
    own = @tenants.first
    %w[notes documents message_intents].zip(%i[note document message]).each do |path, key|
      get "/api/clinic/#{path}/#{own[key].id}", headers: @headers
      assert_response :success
      %w[synthetic-secret-body synthetic-recipient synthetic-content private/synthetic object_changes password_digest].each { |value| assert_not_includes response.body, value }
    end
  end

  test "note templates and note bodies require explicit note-read authority" do
    own = @tenants.first
    get "/api/clinic/note_templates", headers: @headers
    assert_response :success
    assert_equal [ "scribe-reviewed-soap", "adult-physical-exam-detailed" ],
      response.parsed_body.fetch("templates").pluck("id")

    soap_body = Clinic::Care::SoapNotePayload.dump(
      template_id: "adult-physical-exam-detailed", template_version: 1,
      sections: { subjective: "Synthetic protected history", objective: "Synthetic finding", assessment: "", plan: "" }
    )
    soap = Clinic::Care::CreateEncounterNote.call(practice: own[:practice], actor: own[:user],
      encounter: own[:encounter], note_kind: "soap", encrypted_body: soap_body,
      request_key: "verification-#{own[:patient].reference.downcase}-soap-note")
    reader = User.create!(email_address: "note-reader@example.invalid", password: @password)
    reader_membership = own[:practice].memberships.create!(user: reader)
    grant_permissions!(reader_membership, "patients.read")
    grant_permissions!(reader_membership, "notes.read")
    login(reader)
    get "/api/clinic/notes/#{soap.id}", headers: @headers
    assert_response :success
    assert_equal "Synthetic protected history",
      response.parsed_body.dig("note", "current_revision", "body", "sections", "subjective")

    set_permission!(reader_membership, "notes.read", false)
    get "/api/clinic/notes/#{soap.id}", headers: @headers
    assert_response :forbidden
    get "/api/clinic/note_templates", headers: @headers
    assert_response :forbidden
    get "/api/clinic/patients/#{own[:patient].id}", headers: @headers
    assert_response :success
  end

  test "timestamps without an explicit offset are rejected" do
    own = @tenants.first
    submit "/api/clinic/appointments", { appointment: { patient_id: own[:patient].id, starts_at: "2026-11-01T01:00:00", ends_at: "2026-11-01T01:30:00" } }
    assert_response :bad_request
  end

  test "synthetic care API lifecycle validates forms and preserves revision history" do
    own = @tenants.first
    submit "/api/clinic/patients/#{own[:patient].id}/encounters", { encounter: { started_at: "2026-09-01T09:00:00Z" } }
    assert_response :created
    encounter_id = response.parsed_body.dig("encounter", "id")
    first_note = {
      note_kind: "soap", template_id: "adult-physical-exam-detailed", template_version: 1,
      subjective: "Synthetic API first draft", objective: "Synthetic objective", assessment: "", plan: "",
      request_key: "backend-verification-api-create"
    }
    submit "/api/clinic/encounters/#{encounter_id}/notes", { encounter_note: first_note }
    assert_response :created
    note_id = response.parsed_body.dig("note", "id")
    second_note = first_note.except(:note_kind).merge(subjective: "Synthetic API second draft", expected_revision: 1,
      request_key: "backend-verification-api-revise")
    submit "/api/clinic/notes/#{note_id}/revisions", { revision: second_note }
    assert_response :created
    assert_equal "Synthetic API second draft", response.parsed_body.dig("note", "current_revision", "body", "sections", "subjective")
    submit "/api/clinic/notes/#{note_id}/revisions", { revision: second_note.merge(subjective: "Synthetic stale") }
    assert_response :conflict
    saved_payload = Clinic::Care::SoapNotePayload.dump(
      template_id: second_note[:template_id], template_version: second_note[:template_version],
      sections: second_note.slice(:subjective, :objective, :assessment, :plan)
    )
    signature = { revision_no: 2, content_digest: Digest::SHA256.hexdigest(saved_payload), attestation_version: "synthetic-only" }
    submit "/api/clinic/notes/#{note_id}/signatures", { signature: signature.merge(signed_at: "1999-01-01T00:00:00Z") }
    assert_response :bad_request
    submit "/api/clinic/notes/#{note_id}/signatures", { signature: signature }
    assert_response :created
    submit "/api/clinic/notes/#{note_id}/revisions", { revision: second_note.merge(
      subjective: "Synthetic overwrite", expected_revision: 2, request_key: "backend-verification-api-signed-revise") }
    assert_response :unprocessable_entity
    submit "/api/clinic/encounters/#{encounter_id}/close",
      { close: { patient_id: own[:patient].id, ended_at: "2026-09-01T09:30:00Z", request_key: "backend-close-#{encounter_id}" } }
    assert_response :success
    assert_equal "completed", response.parsed_body.dig("encounter", "status")
    submit "/api/clinic/patients/#{own[:patient].id}/observations", { observation: { encounter_id: encounter_id,
      code: "SYNTHETIC-MISSING-KEY", code_system: "synthetic", code_version: "1", value_kind: "text", text_value: "Synthetic value", observed_at: "2026-09-01T09:10:00Z" } }
    assert_response :bad_request
    submit "/api/clinic/patients/#{own[:patient].id}/observations", { observation: { request_key: "backend-verification-observation", encounter_id: encounter_id,
      code: "SYNTHETIC", code_system: "synthetic", code_version: "1", value_kind: "text", text_value: "Synthetic value", observed_at: "2026-09-01T09:10:00Z" } }
    assert_response :created
    get "/api/clinic/patients/#{own[:patient].id}/observations", params: { code: "SYNTHETIC", value_kind: "text" }, headers: @headers
    assert_response :success
    assert_equal 1, response.parsed_body.dig("pagination", "total")
    submit "/api/clinic/patients/#{own[:patient].id}/address_versions", { address_version: { encrypted_address: "Synthetic address", make_primary: true } }
    assert_response :created
    assert_equal true, response.parsed_body.dig("address_version", "primary")
  end

  test "message and invoice APIs handle exact retries and reject mismatched relationships" do
    own = @tenants.first
    message = { request_key: "api-retry", purpose_code: "synthetic", encrypted_recipient_snapshot: "nobody@example.invalid", encrypted_content: "Synthetic only" }
    submit "/api/clinic/patients/#{own[:patient].id}/message_intents", { message_intent: message }
    assert_response :created
    message_id = response.parsed_body.dig("message", "id")
    assert_no_difference "Clinic::MessageIntent.count" do
      submit "/api/clinic/patients/#{own[:patient].id}/message_intents", { message_intent: message }
      assert_response :created
      assert_equal message_id, response.parsed_body.dig("message", "id")
    end
    submit "/api/clinic/patients/#{own[:patient].id}/message_intents", { message_intent: message.merge(encrypted_content: "Changed synthetic payload") }
    assert_response :unprocessable_entity
    submit "/api/clinic/message_intents/#{message_id}/delivery_events", { delivery: { provider_event_reference: "synthetic-event", outcome: "delivered" } }
    assert_response :success
    second_patient = own[:practice].patients.create!(display_name: "Synthetic second", reference: "SECOND")
    assert_no_difference [ "Clinic::MessageIntent.count", "Clinic::MessageAttachment.count" ] do
      submit "/api/clinic/patients/#{second_patient.id}/message_intents", { message_intent: message.merge(request_key: "bad-patient", document_ids: [ own[:document].id ]) }
      assert_response :unprocessable_entity
    end
    submit "/api/clinic/patients/#{own[:patient].id}/invoices", { invoice: { currency: "USD", lines: [ { quantity: "2", unit_amount: "1.25", description_snapshot: "Synthetic arithmetic" } ] } }
    assert_response :created
    invoice_id = response.parsed_body.dig("invoice", "id")
    submit "/api/clinic/invoices/#{invoice_id}/post"
    assert_response :success
    payment = { external_event_reference: "synthetic-payment", currency: "USD", amount: "2.50" }
    submit "/api/clinic/invoices/#{invoice_id}/payment_allocations", { payment: payment }
    assert_response :created
    assert_no_difference "Clinic::PaymentAllocation.count" do
      submit "/api/clinic/invoices/#{invoice_id}/payment_allocations", { payment: payment }
      assert_response :created
    end
    submit "/api/clinic/invoices/#{invoice_id}/payment_allocations", { payment: payment.merge(currency: "EUR") }
    assert_response :unprocessable_entity
  end

  test "role administration grants only delegated authority and revokes it immediately" do
    own = @tenants.first
    target = User.create!(email_address: "api-grantee@example.invalid", password: SecureRandom.hex(20))
    member = own[:practice].memberships.create!(user: target)
    role = RoleVersion.create!(role_code: "synthetic-api-reader", version: 1)
    RoleVersionPermission.create!(role_version: role, permission: Permission.find_by!(action_code: "patients.read"))
    submit "/api/clinic/role_grants", { grant: { membership_id: member.id, role_version_id: role.id, scope_kind: "practice" } }
    assert_response :created
    grant_id = response.parsed_body.dig("grant", "id")
    assert Clinic::Authorization.allowed?(actor: target, practice: own[:practice], action: "patients.read")
    submit "/api/clinic/role_grants/#{grant_id}/revoke"
    assert_response :success
    assert_not Clinic::Authorization.allowed?(actor: target, practice: own[:practice], action: "patients.read")
    assert_equal %w[granted revoked], Clinic::RoleGrant.find(grant_id).events.order(:grant_revision).pluck(:event_kind)
  end

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def submit(path, params = {}, method: :post)
    public_send(method, path, params: params, headers: csrf_headers, as: :json)
  end

  def login(user)
    submit "/api/session", { email_address: user.email_address, password: @password }
    assert_response :success
  end
end
