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

  private

  def history
    Clinic::Care::PatientActivityHistory.call(patient: @patient, ability: Ability.new(@user, practice: @practice))
  end
end
