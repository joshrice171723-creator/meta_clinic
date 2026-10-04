require "test_helper"

class PatientActivityHistoryTest < ActiveSupport::TestCase
  setup do
    @practice = Clinic::Practice.create!(name: "Activity history test clinic")
    @user = User.create!(email_address: "activity-history@example.invalid", password: SecureRandom.hex(18))
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "patients.read")
    @patient = @practice.patients.create!(display_name: "Activity history patient", reference: "ACTIVITY-001")
  end

  test "registration metadata never exposes protected values or unauthorized domain history" do
    @patient.contacts.create!(practice: @practice, contact_type: "email", contact_value: "hidden@example.invalid",
      preferred: true, effective_from: Time.current)
    @patient.invoices.create!(practice: @practice, currency: "USD", status: "draft", rounding_policy_version: "v1")
    result = history
    assert_equal "included", result[:coverage].find { |source| source[:source] == "registration" }[:status]
    %w[appointments notes invoices reminders].each do |source|
      assert_equal "not_authorized", result[:coverage].find { |item| item[:source] == source }[:status]
    end
    assert result[:entries].all? { |entry| entry[:source] == "registration" }
    assert result[:entries].any? { |entry| entry[:section] == "Contact details" }
    refute_includes result.to_json, "hidden@example.invalid"
    refute_includes result.to_json, @patient.display_name
    assert result[:entries].all? { |entry| (entry.keys & %i[object object_changes request_id causal_id]).empty? }
  end

  test "site scoped history includes only authorized appointment and note records" do
    sites = %w[ALLOWED OTHER].map { |code| @practice.sites.create!(code: code) }
    appointments = sites.map do |site|
      @patient.appointments.create!(practice: @practice, site: site, starts_at: 1.day.from_now,
        ends_at: 1.day.from_now + 30.minutes, status: "scheduled", visit_modality: "in_person")
    end
    notes = sites.map do |site|
      encounter = @patient.encounters.create!(practice: @practice, site: site, started_at: Time.current, status: "open")
      encounter.notes.create!(practice: @practice, patient: @patient, note_kind: "soap")
    end
    grant_permissions!(@membership, "appointments.read", "notes.read", scope_kind: "site", site: sites.first)
    entries = history[:entries]
    assert_equal [ appointments.first.id ], entries.select { |entry| entry[:source] == "appointments" }.map { |entry| entry[:record_id] }.uniq
    assert_equal [ notes.first.id ], entries.select { |entry| entry[:source] == "notes" }.map { |entry| entry[:record_id] }.uniq
  end

  test "practice permission does not expose another patient or tenant versions" do
    own_invoice = @patient.invoices.create!(practice: @practice, currency: "USD", status: "draft", rounding_policy_version: "v1")
    other_patient = @practice.patients.create!(display_name: "Other activity patient", reference: "ACTIVITY-OTHER")
    other_patient.invoices.create!(practice: @practice, currency: "USD", status: "draft", rounding_policy_version: "v1")
    other_practice = Clinic::Practice.create!(name: "Other activity clinic")
    other_practice.patients.create!(display_name: "Other clinic patient", reference: "ACTIVITY-OTHER")
    grant_permissions!(@membership, "billing.read")
    result = history
    assert_equal [ own_invoice.id ], result[:entries].select { |entry| entry[:source] == "invoices" }.map { |entry| entry[:record_id] }.uniq
    assert result[:entries].select { |entry| entry[:record_type] == @patient.class.name }.all? { |entry| entry[:record_id] == @patient.id }
  end

  test "QA149 credit activity requires billing access and preserves only issued metadata" do
    invoice = @patient.invoices.create!(practice: @practice, currency: "USD", status: "posted", rounding_policy_version: "v1")
    issued_at = Time.current.change(usec: 0)
    credit = invoice.credit_notes.create!(practice: @practice, patient: @patient, currency: "USD", amount: "5.00",
      adjustment_type: "credit", reason: "Hidden synthetic credit reason", issued_by_membership: @membership, issued_at: issued_at)
    assert_empty history[:entries].select { |entry| entry[:source] == "credits" }
    assert_equal "not_authorized", history[:coverage].find { |source| source[:source] == "credits" }[:status]
    other_patient = @practice.patients.create!(display_name: "Other credit patient", reference: "CREDIT-OTHER")
    other_invoice = other_patient.invoices.create!(practice: @practice, currency: "USD", status: "posted", rounding_policy_version: "v1")
    other_invoice.credit_notes.create!(practice: @practice, patient: other_patient, currency: "USD", amount: "5.00")
    grant_permissions!(@membership, "billing.read")
    result = history
    rows = result[:entries].select { |entry| entry[:source] == "credits" }
    assert_equal [credit.id], rows.map { |entry| entry[:record_id] }
    assert_equal "Credits", rows.sole[:section]
    assert_equal "Clinic::CreditNote", rows.sole[:record_type]
    assert_equal "recorded", rows.sole[:event]
    assert_equal "membership:#{@membership.id}", rows.sole[:actor_reference]
    assert_equal issued_at.iso8601(6), rows.sole[:occurred_at]
    assert_empty rows.sole[:changed_fields]
    refute_includes result.to_json, credit.reason
    refute_includes result.to_json, '"5.00"'
    refute result.fetch(:entries).any? { |entry| entry.key?(:amount) }
  end

  test "QA149 bounds credit activity by issued time rather than insertion time" do
    grant_permissions!(@membership, "billing.read")
    invoice = @patient.invoices.create!(practice: @practice, currency: "USD", status: "posted", rounding_policy_version: "v1")
    newest = invoice.credit_notes.create!(practice: @practice, patient: @patient, currency: "USD", amount: "1.00",
      reason: "Synthetic latest issuance", issued_by_membership: @membership, issued_at: 2.days.from_now,
      created_at: 2.days.ago)
    26.times do |index|
      invoice.credit_notes.create!(practice: @practice, patient: @patient, currency: "USD", amount: "1.00",
        reason: "Synthetic earlier issuance", issued_by_membership: @membership, issued_at: 1.day.from_now + index.seconds)
    end
    result = history
    assert_equal newest.id, result[:entries].first[:record_id]
    assert_equal "credits", result[:entries].first[:source]
    assert_equal 25, result[:entries].length
    assert result[:has_more]
  end

  test "authorized lineage includes encounter membership and payment versions" do
    site = @practice.sites.create!(code: "LINEAGE")
    appointment = @patient.appointments.create!(practice: @practice, site: site,
      starts_at: 1.day.from_now, ends_at: 1.day.from_now + 30.minutes,
      status: "scheduled", visit_modality: "in_person")
    encounter = @patient.encounters.create!(practice: @practice, appointment:, site:,
      started_at: Time.current, status: "open")
    invoice = @patient.invoices.create!(practice: @practice, currency: "USD",
      status: "posted", rounding_policy_version: "v1")
    @patient.payment_events.create!(practice: @practice, amount: 99, currency: "USD",
      external_event_reference: "evt_lineage_001")
    family = Clinic::Care::SubscriptionFamily.create!(practice: @practice, name: "Lineage memberships")
    package = Clinic::Care::SubscriptionPackage.create!(practice: @practice, family: family, name: "Lineage plan")
    version = Clinic::Care::SubscriptionVersion.create!(practice: @practice, package: package, number: 1,
      snapshot: {}, request_key: "lineage-version", request_digest: "lineage-digest")
    Clinic::Care::SubscriptionAgreement.create!(practice: @practice, patient: @patient, package_version: version,
      invoice: invoice, snapshot: {}, amount: "99.00", currency: "USD",
      request_key: "lineage-agreement", request_digest: "lineage-agreement-digest")
    grant_permissions!(@membership, "encounters.read", "billing.read", "subscriptions.review")

    result = history
    assert_equal "included", result[:coverage].find { |source| source[:source] == "encounters" }[:status]
    assert_equal "included", result[:coverage].find { |source| source[:source] == "payments" }[:status]
    assert_equal "included", result[:coverage].find { |source| source[:source] == "subscriptions" }[:status]
    assert_includes result[:entries].map { |entry| entry[:source] }, "encounters"
    assert_includes result[:entries].map { |entry| entry[:source] }, "payments"
    assert_includes result[:entries].map { |entry| entry[:source] }, "subscriptions"
  end

  test "history is bounded and explicitly reports older events" do
    26.times { |index| @patient.update!(display_name: "Activity revision #{index}") }
    result = history
    assert_equal 25, result[:entries].length
    assert_equal true, result[:has_more]
    assert_equal @patient.versions.reorder(occurred_at: :desc, id: :desc).limit(25).pluck(:id), result[:entries].map { |entry| entry[:id] }
  end

  test "QA243 preserves action metadata including destroy and touch across authorized sources" do
    grant_permissions!(@membership, "appointments.read", "notes.read", "encounters.read", "billing.read",
      "subscriptions.review", "reminders.read", "reminders.write")
    records = activity_source_records
    events = %w[create update destroy touch]
    records.each_with_index do |(source, label, record), source_index|
      versions = events.each_with_index.map do |event, event_index|
        Clinic::ModelVersion.create!(practice: @practice, item_type: record.class.base_class.name,
          item_id: record.id, event: event, actor_reference: "user:#{@user.id}",
          occurred_at: 1.day.from_now + (source_index * 10 + event_index).seconds, changed_fields: ["status"])
      end
      rows = history[:entries].select { |entry| versions.map(&:id).include?(entry[:id]) && entry[:source] == source }
      assert_equal events.sort, rows.map { |entry| entry[:event] }.sort, source
      assert rows.all? { |entry| entry[:section] == label && entry[:record_type] == record.class.base_class.name &&
        entry[:record_id] == record.id && entry[:actor_reference] == "user:#{@user.id}" && entry[:changed_fields] == ["status"] }, source
    end
  end

  test "QA243 rejects missing or unknown action metadata without retaining an unlabeled event" do
    [nil, "", "   ", "unexpected_action"].each do |event|
      assert_no_difference "Clinic::ModelVersion.count" do
        assert_raises(ActiveRecord::StatementInvalid) do
          Clinic::ModelVersion.transaction(requires_new: true) do
            Clinic::ModelVersion.insert_all!([{ practice_id: @practice.id, item_type: @patient.class.base_class.name,
              item_id: @patient.id, event: event, occurred_at: Time.current, changed_fields: [] }])
          end
        end
      end
    end
    assert history[:entries].all? { |entry| %w[create update destroy touch recorded].include?(entry[:event]) }
  end

  test "QA244 projects persisted coordination metadata without values and isolates patient and practice" do
    other = @practice.patients.create!(display_name: "Other synthetic", reference: "COORD-OTHER")
    other_practice = Clinic::Practice.create!(name: "Other coordination clinic")
    other_member = other_practice.memberships.create!(user: @user)
    other_patient = other_practice.patients.create!(display_name: "Other tenant", reference: "COORD-TENANT")
    saved = coordination_revision(@patient, @membership, 1)
    coordination_revision(other, @membership, 1)
    coordination_revision(other_patient, other_member, 1)
    versions = Clinic::ModelVersion.where(item_type: saved.class.name, item_id: saved.id)
    assert_equal 1, versions.count
    result = history
    entries = result[:entries].select { |entry| entry[:source] == "care_coordination" }
    assert_equal [ saved.id ], entries.map { |entry| entry[:record_id] }
    assert_equal "recorded", entries.first[:event]
    assert_equal "Care coordination revision 1", entries.first[:section]
    assert_equal "membership:#{@membership.id}", entries.first[:actor_reference]
    assert_equal saved.recorded_at.iso8601(6), entries.first[:occurred_at]
    assert_empty entries.first[:changed_fields]
    refute_includes result.to_json, "hidden coordination pharmacy"
    refute_includes result.to_json, "request_key"
    refute_includes result.to_json, "content"
    assert_equal 1, versions.count
  end

  test "QA244 bounded merged history preserves newest revision ordering and read authorization" do
    27.times { |index| coordination_revision(@patient, @membership, index + 1) }
    result = history
    assert_equal 25, result[:entries].length
    assert result[:has_more]
    assert_equal (3..27).to_a.reverse.map { |n| "Care coordination revision #{n}" }, result[:entries].map { |entry| entry[:section] }
    denied = Object.new
    def denied.allowed_permission?(*, **) = false
    def denied.can?(*, **) = false
    restricted = Clinic::Care::PatientActivityHistory.call(patient: @patient, ability: denied)
    assert_equal "not_authorized", restricted[:coverage].find { |source| source[:source] == "care_coordination" }[:status]
    refute restricted[:entries].any? { |entry| entry[:source] == "care_coordination" }
  end

  private

  def activity_source_records
    site = @practice.sites.create!(code: "ACTION-METADATA")
    appointment = @patient.appointments.create!(practice: @practice, site: site,
      starts_at: 1.day.from_now, ends_at: 1.day.from_now + 30.minutes, status: "scheduled", visit_modality: "in_person")
    encounter = @patient.encounters.create!(practice: @practice, appointment: appointment, site: site,
      started_at: Time.current, status: "open")
    note = encounter.notes.create!(practice: @practice, patient: @patient, note_kind: "soap")
    invoice = @patient.invoices.create!(practice: @practice, currency: "USD", status: "posted", rounding_policy_version: "v1")
    payment = @patient.payment_events.create!(practice: @practice, amount: 99, currency: "USD",
      external_event_reference: "evt_action_metadata")
    family = Clinic::Care::SubscriptionFamily.create!(practice: @practice, name: "Action metadata memberships")
    package = Clinic::Care::SubscriptionPackage.create!(practice: @practice, family: family, name: "Action metadata plan")
    version = Clinic::Care::SubscriptionVersion.create!(practice: @practice, package: package, number: 1,
      snapshot: {}, request_key: "action-metadata-version", request_digest: "action-metadata-digest")
    subscription = Clinic::Care::SubscriptionAgreement.create!(practice: @practice, patient: @patient,
      package_version: version, invoice: invoice, snapshot: {}, amount: "99.00", currency: "USD",
      request_key: "action-metadata-agreement", request_digest: "action-metadata-agreement-digest")
    endpoint = @practice.communication_endpoints.create!(patient: @patient, endpoint_type: "email",
      value: "action-metadata@example.invalid", value_digest: Digest::SHA256.hexdigest("action-metadata@example.invalid"),
      verified_at: Time.current)
    reminder = Clinic::Reminders::Create.call(practice: @practice, actor: @user, patient: @patient,
      request_key: "action-metadata-reminder", category: "appointment", channel: "email",
      scheduled_at: 1.day.from_now, endpoint_id: endpoint.id)
    [["registration", "Patient identity", @patient], ["appointments", "Appointments", appointment],
      ["notes", "Encounter notes", note], ["encounters", "Encounters", encounter], ["invoices", "Invoices", invoice],
      ["payments", "Payments", payment], ["subscriptions", "Memberships", subscription], ["reminders", "Reminders", reminder]]
  end

  def coordination_revision(patient, membership, number)
    payload = Clinic::Care::PatientCareCoordinationRevision.empty_payload
    payload["pharmacy"] = { "state" => "known", "entries" => [
      { "name" => "hidden coordination pharmacy", "source" => "patient", "address_confirmed" => false }
    ] }
    Clinic::Care::PatientCareCoordinationRevision.create!(
      practice: patient.practice, patient: patient, recorded_by_membership: membership,
      revision: number, content: JSON.generate(payload), recorded_at: 1.day.from_now + number.seconds,
      request_key: "qa244-#{SecureRandom.uuid}"
    )
  end

  def history
    Clinic::Care::PatientActivityHistory.call(patient: @patient, ability: Ability.new(@user, practice: @practice))
  end
end
