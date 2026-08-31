require "test_helper"

class BackendIntegrityTest < ActiveSupport::TestCase
  setup do
    @practice = Clinic::Practice.create!(name: "Synthetic Integrity")
    @other = Clinic::Practice.create!(name: "Synthetic Other")
    @user = User.create!(email_address: "integrity@example.invalid", password: SecureRandom.hex(20))
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, *Development::TestClinic::DEFAULT_PERMISSIONS)
    @patient = @practice.patients.create!(display_name: "Synthetic", reference: "SYN")
    @second = @practice.patients.create!(display_name: "Synthetic Other", reference: "OTHER")
  end

  test "patient references are unique within custody, not globally" do
    assert_not @practice.patients.new(display_name: "Synthetic", reference: "SYN").valid?
    assert @other.patients.create!(display_name: "Synthetic", reference: "SYN")
  end

  test "nullable encounter cannot bypass the independent patient tenant foreign key" do
    category = Clinic::DocumentCategory.create!(practice: @practice, code: "SYN", name: "Synthetic")
    foreign = @other.patients.create!(display_name: "Synthetic", reference: "FOREIGN")
    assert_database_rejects do
      Clinic::Document.insert_all!([ { practice_id: @practice.id, patient_id: foreign.id, category_id: category.id, encounter_id: nil,
        object_key: "synthetic", object_version: "1", checksum: "synthetic", media_type: "text/plain", byte_size: 1, scan_state: "clean" } ])
    end
  end

  test "encounter cannot be reparented even before it has children" do
    encounter = @practice.encounters.create!(patient: @patient, started_at: Time.current, status: "open")
    assert_database_rejects { encounter.update_columns(patient_id: @second.id) }
    assert_equal @patient.id, encounter.reload.patient_id
  end

  test "cancellation frees a reservation but active overlap remains forbidden" do
    site = @practice.sites.create!(code: "SYN")
    room = site.rooms.create!(practice: @practice, code: "ONE")
    args = { practice: @practice, actor: @user, patient: @patient, site: site, room: room, starts_at: 1.day.from_now, ends_at: 1.day.from_now + 30.minutes }
    booking = Clinic::Scheduling::BookAppointment.call(**args)
    assert_raises(ArgumentError) { ApplicationRecord.transaction(requires_new: true) { Clinic::Scheduling::BookAppointment.call(**args) } }
    Clinic::Scheduling::TransitionAppointment.call(appointment: booking, actor: @user, to: "cancelled")
    assert Clinic::Scheduling::BookAppointment.call(**args)
  end

  test "published role permission sets cannot expand behind existing grants" do
    role = @membership.role_grants.first.role_version
    permission = Permission.create!(action_code: "synthetic.unassigned")
    assert_database_rejects { RoleVersionPermission.create!(role_version: role, permission: permission) }
  end

  test "address version columns are usable for patient staff and supplier" do
    staff = @practice.staff_members.create!(display_name: "Synthetic", job_title: "Synthetic")
    supplier = @practice.inventory_suppliers.create!(name: "Synthetic")
    [ @patient, staff, supplier ].each do |owner|
      address = owner.address_versions.create!(practice: @practice, version: 1, encrypted_address: "Synthetic address")
      assert_equal 1, address.version
      owner.update!(primary_address_version: address)
      assert_equal address.id, owner.reload.primary_address_version_id
    end
  end

  test "PaperTrail captures sensitive-only changes without values and rolls back on failure" do
    PaperTrail.request(whodunnit: @user.id.to_s) do
      @patient.update!(display_name: "Synthetic secret marker")
    end
    version = @patient.versions.last
    assert_equal "update", version.event
    assert_includes version.changed_fields, "display_name"
    assert_equal @user.id.to_s, version.whodunnit
    assert_not_includes version.attributes.to_json, "Synthetic secret marker"
    before = @patient.versions.count
    assert_raises(RuntimeError) do
      ApplicationRecord.transaction do
        @patient.update!(display_name: "Synthetic rolled back")
        raise "synthetic rollback"
      end
    end
    assert_equal before, @patient.versions.count
    assert_equal "Synthetic secret marker", @patient.reload.display_name
    failure = -> { raise "synthetic audit unavailable" }
    Clinic::ModelVersion.set_callback(:create, :before, failure)
    begin
      assert_raises(RuntimeError) { @patient.update!(display_name: "Synthetic must not commit") }
    ensure
      Clinic::ModelVersion.skip_callback(:create, :before, failure)
    end
    assert_equal "Synthetic secret marker", @patient.reload.display_name
  end

  test "versions and access evidence reject ordinary direct edits and deletion" do
    event = @practice.audit_events.create!(actor_session_reference: "synthetic", action_code: "VIEW", outcome: "released", policy_version: "synthetic", occurred_at: Time.current)
    [ event, @patient.versions.last ].each do |record|
      assert_database_rejects { record.update_columns(practice_id: @other.id) }
      assert_database_rejects { record.delete }
    end
  end

  test "current note revision must be signed and note body is immutable" do
    encounter = @practice.encounters.create!(patient: @patient, started_at: Time.current, status: "open")
    note = Clinic::Care::CreateEncounterNote.call(practice: @practice, actor: @user, encounter: encounter, encrypted_body: "synthetic-one")
    Clinic::Care::ReviseEncounterNote.call(note: note, actor: @user, encrypted_body: "synthetic-two", expected_revision: 1)
    assert_raises(ArgumentError) do
      Clinic::Care::SignEncounterNote.call(note: note, actor: @user, revision_no: 1, content_digest: Digest::SHA256.hexdigest("synthetic-one"), attestation_version: "synthetic")
    end
    assert_database_rejects { note.revisions.first.update_columns(encrypted_body: "overwrite") }
  end

  test "invalid invoice line rolls back invoice lines and versions" do
    assert_no_difference [ "Clinic::Invoice.count", "Clinic::InvoiceLine.count", "Clinic::ModelVersion.count" ] do
      assert_raises(ArgumentError) do
        Clinic::Billing::DraftInvoice.call(practice: @practice, actor: @user, patient: @patient, currency: "USD", lines: [
          { quantity: "1", unit_amount: "1", description_snapshot: "Synthetic" },
          { quantity: "0", unit_amount: "1", description_snapshot: "Invalid synthetic" }
        ])
      end
    end
  end

  test "sensitive schema fields are filtered without removing useful status diagnostics" do
    filter = ActiveSupport::ParameterFilter.new(Rails.application.config.filter_parameters)
    values = %w[password authorization encrypted_body encrypted_address encrypted_content encrypted_recipient_snapshot encrypted_coverage_evidence text_value coded_value numeric_value description_snapshot].to_h { |field| [ field, "synthetic-private" ] }
    assert filter.filter(values).values.all? { |value| value == "[FILTERED]" }
    assert_equal "open", filter.filter({ "status" => "open" })["status"]
  end

  test "monetary inputs retain supported decimal precision and reject silent rounding" do
    assert_equal BigDecimal("1.123456"), Clinic::Billing::Money.decimal("1.123456")
    %w[1.1234567 NaN Infinity -1 1000000000000].each do |value|
      assert_raises(ArgumentError) { Clinic::Billing::Money.decimal(value) }
    end
  end

  test "delivery recording requires an authorized actor before any event or state change" do
    intent = Clinic::Messaging::CreateIntent.call(practice: @practice, actor: @user, patient: @patient,
      request_key: "synthetic-denied-delivery", purpose_code: "synthetic", encrypted_recipient_snapshot: "nobody@example.invalid",
      encrypted_content: "Synthetic only")
    stranger = User.create!(email_address: "synthetic-stranger@example.invalid", password: SecureRandom.hex(20))
    assert_no_difference "Clinic::MessageDeliveryEvent.count" do
      assert_raises(Clinic::Authorization::Denied) do
        Clinic::Messaging::RecordDelivery.call(intent: intent, actor: stranger, provider_event_reference: "synthetic-event", outcome: "delivered")
      end
    end
    assert_equal "pending", intent.outbox.reload.dispatch_state
  end

  private

  def assert_database_rejects(&block)
    assert_raises(ActiveRecord::StatementInvalid) { ApplicationRecord.transaction(requires_new: true, &block) }
  end
end
