require "test_helper"

class ClinicalAdministrationWorkflowsTest < ActiveSupport::TestCase
  Clinical = Clinic::Assistant::Workflows::Clinical
  Administration = Clinic::Assistant::Workflows::Administration

  setup do
    organization = Organization.create!(name: "Synthetic Assistant Workflow Organization")
    @practice = Clinic::Practice.create!(organization:, name: "Synthetic Assistant Workflow Clinic", timezone: "UTC")
    @user = User.create!(email_address: "synthetic-assistant-domains@example.invalid", password: SecureRandom.hex(18))
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "patients.read", "patients.write", "notes.read", "notes.write",
      "intake.write", "encounters.read", "encounters.write", "clinical_records.read",
      "medication_requests.write", "facilities.read", "facilities.write")
    @site = @practice.sites.create!(code: "SYNTHETIC-ASSISTANT", name: "Synthetic assistant location", status: "active")
    configure_site!(@site, membership: @membership, services: ["prescription_preparation"])
    @practice.visit_types.create!(code: "Synthetic default assistant visit")
    @patient = @practice.patients.create!(display_name: "Synthetic selected patient", reference: "SYN-ASSISTANT-1", primary_site: @site)
    @other_patient = @practice.patients.create!(display_name: "Synthetic other patient", reference: "SYN-ASSISTANT-2", primary_site: @site)
    @encounter = @practice.encounters.create!(patient: @patient, site: @site, status: "open", started_at: 1.hour.ago)
    @clinical = Clinical.new(practice: @practice, actor: @user, site: @site, patient: @patient, encounter: @encounter)
    @admin = Administration.new(practice: @practice, actor: @user, site: @site, patient: nil, encounter: nil)
  end

  test "catalog loads generated clinical drafts and semantic configuration controls" do
    clinical = Clinical.definitions
    administration = Administration.definitions
    assert_equal 54, clinical.length
    assert_equal 23, administration.length
    assert_includes clinical.pluck(:key), "care.plan_medication_requests_draft_create"
    assert_includes clinical.pluck(:key), "care.history_allergies_update"
    hours = administration.find { |entry| entry[:key] == "configuration.site_hours_save" }
    assert_equal %w[day_of_week closed open_time close_time], hours[:fields].pluck(:key)
    profile = administration.find { |entry| entry[:key] == "configuration.profile_save" }
    scope = profile[:fields].find { |field| field[:key] == "service_scope" }
    assert_equal "select", scope.dig(:items, :type)
    assert scope.dig(:items, :options).all? { |option| option[:value].present? && option[:label].present? }
  end

  test "assistant registration replays once and partial correction preserves identity and preferences" do
    inputs = { "display_name" => "Synthetic registered patient", "reference" => "SYN-REGISTERED",
      "sex" => "unknown", "preferred_name" => "Synthetic preferred name", "primary_language" => "Spanish",
      "preferred_contact_method" => "text", "appointment_reminders_consent" => true }
    resolved = @clinical.resolve(key: "patients.register", inputs:)
    resolved["_request_key"] = "synthetic-assistant-registration-replay"
    assert_difference "@practice.patients.count", 1 do
      2.times { @clinical.execute(key: "patients.register", resolved:) }
    end
    patient = @practice.patients.find_by!(reference: "SYN-REGISTERED")
    assert_nil patient.demographics.date_of_birth
    assert_equal "unknown", patient.demographics.sex
    assert_equal @site.id, patient.primary_site_id
    handler = Clinical.new(practice: @practice, actor: @user, site: @site, patient:, encounter: nil)
    perform(handler, "patients.registration_correct", { "preferred_name" => "Synthetic corrected preference" })
    patient.reload
    assert_equal "Synthetic corrected preference", patient.demographics.reload.preferred_name
    assert_equal "Spanish", patient.demographics.primary_language
    assert_equal "text", patient.communication_preference.preferred_contact_method
    assert patient.communication_preference.appointment_reminders_consent
    assert_equal "SYN-REGISTERED", patient.reference
    original = patient.display_name
    assert_no_difference "patient.contacts.count" do
      assert_raises(ArgumentError) do
        perform(handler, "patients.registration_correct", { "display_name" => "Synthetic rejected name",
          "contact_type" => "email", "contact_value" => "invalid-email" })
      end
    end
    assert_equal original, patient.reload.display_name
  end

  test "clinical history and partial unsigned note revisions persist without signing" do
    allergy = { "allergen_name" => "Synthetic reported allergen", "reaction" => "Synthetic reaction",
      "category" => "medication", "clinical_status" => "active", "verification_status" => "confirmed",
      "criticality" => "high", "severity" => "moderate" }
    perform(@clinical, "care.history_allergies_create", allergy)
    record = @patient.allergies.reload.sole
    perform(@clinical, "care.history_allergies_update", allergy.merge("history_record" => ref(record), "reaction" => "Synthetic revised reaction"))
    assert_equal "Synthetic revised reaction", record.reload.reaction
    assert_equal 1, @patient.allergies.count
    perform(@clinical, "care.note_draft_create", { "template_id" => "scribe-reviewed-soap",
      "subjective" => "Synthetic supplied history", "objective" => "Synthetic supplied measurement",
      "assessment" => "Synthetic draft assessment", "plan" => "Synthetic initial draft plan" })
    note = @encounter.notes.reload.sole
    selected_note = ref(note)
    perform(@clinical, "care.note_draft_revise", { "note" => selected_note, "plan" => "Synthetic revised draft plan" })
    latest = note.revisions.order(revision_no: :desc).first
    body = Clinic::Care::SoapNotePayload.load!(latest.encrypted_body)
    assert_equal "Synthetic revised draft plan", body.dig(:sections, :plan)
    assert_equal "Synthetic supplied history", body.dig(:sections, :subjective)
    assert_equal "Synthetic supplied measurement", body.dig(:sections, :objective)
    assert_equal "Synthetic draft assessment", body.dig(:sections, :assessment)
    assert_equal 2, note.revisions.count
    assert_empty latest.signatures
    assert_raises(ActiveRecord::StaleObjectError) do
      @clinical.resolve(key: "care.note_draft_revise", inputs: { "note" => selected_note, "plan" => "Synthetic stale revision" })
    end
  end

  test "partial registration corrections preserve omitted contact emergency and social members and explicit clears remain versioned" do
    perform(@clinical, "patients.register", { "display_name" => "Synthetic partial registration", "reference" => "SYN-PARTIAL-REGISTER",
      "sex" => "unknown", "contact_type" => "phone", "contact_value" => "512-555-0110", "preferred" => true,
      "emergency_name" => "Synthetic emergency contact", "emergency_relationship" => "Sibling", "emergency_phone" => "512-555-0111",
      "permission_to_contact" => true, "occupation" => "Synthetic occupation", "diet" => "Synthetic supplied diet",
      "living_situation" => "Synthetic supplied home context" })
    patient = @practice.patients.find_by!(reference: "SYN-PARTIAL-REGISTER")
    handler = Clinical.new(practice: @practice, actor: @user, site: @site, patient:, encounter: nil)
    perform(handler, "patients.registration_correct", { "preferred" => false,
      "emergency_name" => "Synthetic corrected emergency contact", "permission_to_contact" => false,
      "occupation" => "Synthetic revised occupation" })
    phone = patient.contacts.order(id: :desc).first
    assert_equal "512-555-0110", phone.contact_value
    refute phone.preferred
    assert_nil phone.effective_until
    emergency = patient.emergency_contacts.order(id: :desc).first
    assert_equal "Synthetic corrected emergency contact", emergency.name
    assert_equal "Sibling", emergency.relationship
    assert_equal "512-555-0111", emergency.phone
    refute emergency.permission_to_contact
    assert_nil emergency.effective_until
    social = patient.social_histories.order(id: :desc).first
    assert_equal "Synthetic revised occupation", social.occupation
    assert_equal "Synthetic supplied diet", social.diet
    assert_equal "Synthetic supplied home context", social.living_situation
    perform(handler, "patients.registration_correct", { "diet" => "" })
    social = patient.social_histories.order(id: :desc).first
    assert_nil social.diet
    assert_equal "Synthetic revised occupation", social.occupation
    perform(handler, "patients.registration_correct", { "contact_type" => "phone", "contact_value" => "",
      "emergency_name" => "", "emergency_relationship" => "", "emergency_phone" => "" })
    assert patient.contacts.order(id: :desc).first.effective_until
    assert patient.emergency_contacts.order(id: :desc).first.effective_until
    assert_equal 3, patient.contacts.count
    assert_equal 3, patient.emergency_contacts.count
  end

  test "typed intake answers preserve other answers and remain an unconfirmed draft" do
    perform(@clinical, "intake.draft_save", { "text" => "Synthetic intake narrative" })
    perform(@clinical, "intake.question_answer_save", { "question_id" => "goals", "state" => "answered", "value" => "Synthetic supplied goal" })
    perform(@clinical, "intake.question_answer_save", { "question_id" => "goals", "state" => "declined", "value" => "" })
    intake = Clinic::Care::NurseWorkflow.latest_intake(@practice, @encounter)
    payload = Clinic::Care::PrevisitIntake.decode(intake.encrypted_questionnaire)
    assert_equal "Synthetic intake narrative", payload["text"]
    assert_equal "declined", payload.dig("answers", "goals", "state")
    assert_equal "draft", payload["status"]
    refute payload["confirmed"]
    assert_equal "incomplete", intake.status
    assert_raises(ArgumentError) do
      @clinical.resolve(key: "intake.question_answer_save", inputs: { "question_id" => "unsupported-question", "state" => "answered", "value" => "Synthetic answer" })
    end
  end

  test "clinical plan draft revisions retain the initial state and reject another patient or stale choice" do
    perform(@clinical, "care.plan_medication_requests_draft_create", { "medication_name" => "Synthetic medication draft", "intent" => "order" })
    record = Clinic::Care::MedicationRequestRevision.where(practice: @practice, patient: @patient).sole
    selected = ref(record)
    perform(@clinical, "care.plan_medication_requests_draft_revise", { "plan_record" => selected, "instructions" => "Synthetic supplied draft instructions" })
    revisions = Clinic::Care::MedicationRequestRevision.where(practice: @practice, series_id: record.series_id).order(:version_number)
    assert_equal [1, 2], revisions.pluck(:version_number)
    assert_equal %w[draft draft], revisions.pluck(:status)
    assert_equal "Synthetic supplied draft instructions", revisions.last.instructions
    assert_empty Clinic::ClinicalTask.where(practice: @practice, source_kind: "medication_request")
    assert_raises(ActiveRecord::RecordNotFound) do
      @clinical.resolve(key: "care.plan_medication_requests_draft_revise", inputs: { "plan_record" => selected, "instructions" => "Synthetic stale draft" })
    end
    handler = Clinical.new(practice: @practice, actor: @user, site: @site, patient: @other_patient, encounter: @encounter)
    assert_raises(ActiveRecord::RecordNotFound) do
      handler.resolve(key: "care.plan_medication_requests_draft_revise", inputs: { "plan_record" => ref(revisions.last), "instructions" => "Synthetic cross-patient draft" })
    end
  end

  test "facility operations persist default rooms and preserve other weekday hours" do
    perform(@admin, "configuration.site_create", { "code" => "SYNTHETIC-NEW-LOCATION", "name" => "Synthetic new location",
      "status" => "active", "timezone_override" => "America/Chicago", "address_line1" => "100 Synthetic Street",
      "city" => "Sherman", "state" => "TX", "postal_code" => "75090", "country" => "US" })
    site = @practice.sites.find_by!(code: "SYNTHETIC-NEW-LOCATION")
    assert_equal ["Room 1", "Room 2"], site.rooms.order(:code).pluck(:code)
    handler = Administration.new(practice: @practice, actor: @user, site:, patient: nil, encounter: nil)
    perform(handler, "configuration.site_hours_save", { "day_of_week" => "1", "closed" => false, "open_time" => "08:00", "close_time" => "17:00" })
    perform(handler, "configuration.site_hours_save", { "day_of_week" => "2", "closed" => true })
    assert_equal [1, 2], site.operating_hours.order(:day_of_week).pluck(:day_of_week)
    assert_equal "08:00", site.operating_hours.find_by!(day_of_week: 1).open_time.strftime("%H:%M")
    assert_no_difference "site.operating_hours.count" do
      assert_raises(ArgumentError) do
        perform(handler, "configuration.site_hours_save", { "day_of_week" => "1", "closed" => false, "open_time" => "18:00", "close_time" => "09:00" })
      end
    end
    assert_equal "08:00", site.operating_hours.find_by!(day_of_week: 1).open_time.strftime("%H:%M")
    perform(handler, "configuration.department_create", { "code" => "Synthetic department" })
    department = @practice.departments.find_by!(code: "Synthetic department")
    perform(handler, "configuration.department_update", { "department" => ref(department), "code" => "Synthetic renamed department" })
    assert_equal "Synthetic renamed department", department.reload.code
  end

  test "visit type retirement and draft offering use scoped versioned selections" do
    perform(@admin, "configuration.visit_type_create", { "code" => "Synthetic assistant visit" })
    visit = @practice.visit_types.find_by!(code: "Synthetic assistant visit")
    selected = ref(visit)
    perform(@admin, "configuration.visit_type_retire", { "visit_type" => selected })
    assert visit.reload.retired_at
    assert_raises(ActiveRecord::StaleObjectError) do
      @admin.resolve(key: "configuration.visit_type_update", inputs: { "visit_type" => selected, "code" => "Synthetic stale visit" })
    end
    perform(@admin, "configuration.service_offering_draft_create", { "name" => "Synthetic offering draft",
      "description" => "Synthetic supplied catalog description", "visit_type" => ref(visit), "duration_minutes" => 30 })
    offering = @practice.service_offerings.find_by!(name: "Synthetic offering draft")
    assert_equal "draft", offering.status
    assert_equal [@site.id], offering.sites.pluck(:id)
    assert_nil offering.published_at
    perform(@admin, "configuration.service_offering_draft_revise", { "offering" => ref(offering), "description" => "Synthetic revised catalog description" })
    assert_equal "Synthetic revised catalog description", offering.reload.description
    assert_equal "draft", offering.status
  end

  test "profile save and finalization preserve protected change and removal review gates" do
    site = @practice.sites.create!(code: "SYNTHETIC-SETUP", name: "Synthetic setup location", status: "active")
    handler = Administration.new(practice: @practice, actor: @user, site:, patient: nil, encounter: nil)
    inputs = { "clinic_type" => "primary_care", "insurance_workflows_enabled" => false,
      "service_scope" => [], "assessment_scope" => ["depression"] }
    perform(handler, "configuration.profile_save", inputs)
    perform(handler, "configuration.profile_finalize", {})
    current = Clinic::Configuration::PracticeFeatures.snapshot(practice: @practice, site:)
    assert current[:finalized]
    assert_equal 2, current[:revision]
    assert_equal ["depression"], current[:assessment_scope]
    removal = inputs.merge("assessment_scope" => [])
    assert_raises(ArgumentError) { handler.resolve(key: "configuration.profile_save", inputs: removal) }
    impact = handler.resolve(key: "configuration.profile_impacts", inputs: removal.slice("service_scope", "assessment_scope"))
    assert impact.fetch("_impact")[:review_complete]
    reviewed = removal.merge("reviewed_consequences" => true)
    prepared = handler.resolve(key: "configuration.profile_save", inputs: reviewed)
    assert prepared.fetch("_impact")[:impact_digest].present?
    assert handler.preview(key: "configuration.profile_save", resolved: prepared).any? { |entry| entry[:label].include?("Depression") }
    perform(handler, "configuration.profile_save", reviewed)
    assert_empty Clinic::Configuration::PracticeFeatures.snapshot(practice: @practice, site:)[:assessment_scope]
    before = Clinic::PracticeFeatureVersion.where(practice: @practice, site:).count
    assert_raises(ArgumentError) do
      perform(handler, "configuration.profile_save", inputs.merge("clinic_type" => "behavioral_health", "assessment_scope" => []))
    end
    assert_equal before, Clinic::PracticeFeatureVersion.where(practice: @practice, site:).count
  end

  test "clinical writes and selected-location reads enforce existing permissions" do
    actor = User.create!(email_address: "synthetic-assistant-limited@example.invalid", password: SecureRandom.hex(18))
    member = @practice.memberships.create!(user: actor)
    grant_permissions!(member, "patients.read")
    clinician = Clinical.new(practice: @practice, actor:, site: @site, patient: @patient, encounter: @encounter)
    assert_raises(Clinic::Authorization::Denied) do
      clinician.resolve(key: "care.note_draft_create", inputs: { "template_id" => "scribe-reviewed-soap", "plan" => "Synthetic denied draft" })
    end
    other_site = @practice.sites.create!(code: "SYNTHETIC-OTHER-LOCATION")
    grant_permissions!(member, "facilities.read", scope_kind: "site", site: other_site)
    reader = Administration.new(practice: @practice, actor:, site: @site, patient: nil, encounter: nil)
    assert_raises(Clinic::Authorization::Denied) { reader.resolve(key: "configuration.site", inputs: {}) }
    assert_raises(Clinic::Authorization::Denied) { reader.resolve(key: "configuration.site_update", inputs: { "name" => "Synthetic denied name" }) }
  end

  private

  def perform(handler, key, inputs)
    resolved = handler.resolve(key:, inputs:)
    resolved["_request_key"] = "synthetic-assistant-#{SecureRandom.hex(12)}"
    ApplicationRecord.transaction { handler.execute(key:, resolved:) }
  end

  def ref(record)
    record.reload
    { "record_type" => record.class.name, "record_id" => record.id,
      "version" => @clinical.selection_version(record) }
  end
end
