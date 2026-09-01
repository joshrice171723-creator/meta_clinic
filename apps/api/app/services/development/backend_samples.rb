require "digest"

module Development
  # Wholly invented fixtures. Re-running adds missing fixture structure while
  # preserving edited records, inactive memberships, and revoked grants.
  class BackendSamples
    ROLE_PERMISSIONS = {
      "admin" => TestClinic::DEFAULT_PERMISSIONS,
      "clinician" => %w[patients.read patients.write appointments.write encounters.write notes.read notes.write notes.sign observations.write documents.read],
      "staff" => %w[patients.read patients.write appointments.write encounters.write notes.read observations.write inventory.read staff.read messages.write],
      "inventory" => %w[inventory.read inventory.catalog inventory.receive inventory.adjust inventory.hold inventory.release inventory.count inventory.configure],
      "billing" => %w[patients.read billing.write documents.read],
      "reader" => %w[patients.read notes.read documents.read inventory.read staff.read]
    }.transform_values(&:freeze).freeze
    LEGACY_ROLE_PERMISSIONS = {
      "admin" => TestClinic::DEFAULT_PERMISSIONS - [ "notes.read" ],
      "clinician" => %w[patients.read patients.write appointments.write encounters.write notes.write notes.sign observations.write documents.read],
      "staff" => %w[patients.read patients.write appointments.write inventory.read staff.read messages.write],
      "reader" => %w[patients.read documents.read inventory.read staff.read]
    }.transform_values(&:freeze).freeze
    PREFIX = "Synthetic Backend Review".freeze
    ACTIVE_USERS_PER_ROLE = 2
    PATIENT_NAMES = [
      "Avery Rowan", "Jordan Ellis", "Morgan Reyes", "Casey Bennett", "Riley Patel",
      "Taylor Brooks", "Cameron Nguyen", "Quinn Foster", "Parker Sullivan", "Skyler Ward",
      "Emerson Diaz", "Finley Chen", "Hayden Morgan", "Reese Thompson", "Dakota Price",
      "Rowan Cooper", "Alexis Rivera", "Sage Mitchell", "Blake Murphy", "Drew Coleman",
      "Kendall Ross", "Jamie Perry", "Marley Powell", "Elliot Hughes", "Ari Bell",
      "Robin Flores", "Charlie Sanders", "Micah Bryant", "Shawn Russell", "Terry Griffin"
    ].freeze
    HISTORICAL_PATIENT_COUNT = 12
    UPCOMING_PATIENT_COUNT = 4
    SCENARIO_START = Time.utc(2026, 1, 12, 15)

    def self.call
      raise "Synthetic backend samples are local only." unless Rails.env.development? || Rails.env.test?

      ApplicationRecord.transaction do
        ApplicationRecord.connection.execute("SELECT pg_advisory_xact_lock(hashtextextended('apply:backend-samples:v2', 0))")
        roles = create_roles
        %w[A B].map { |label| create_practice(label, roles) }
      end
    end

    def self.populate_practice!(practice:, actor:, label:)
      raise "Synthetic backend samples are local only." unless Rails.env.development? || Rails.env.test?
      raise ArgumentError, "The actor must belong to the selected practice." unless actor.clinic_membership&.practice_id == practice.id

      ApplicationRecord.transaction do
        ApplicationRecord.connection.execute(
          "SELECT pg_advisory_xact_lock(hashtextextended('apply:backend-samples:practice:#{practice.id}', 0))"
        )
        PaperTrail.request(whodunnit: actor.id.to_s,
          controller_info: { causal_id: "synthetic-backend-seed-v2-existing-practice" }) do
          sites = seed_facilities(practice)
          clinicians = seed_clinicians(practice, [ actor ], sites, label)
          patients = seed_patients(practice, label, actor)
          users = { "admin" => [ actor ], "clinician" => [ actor ], "staff" => [ actor, actor ] }
          seed_chart_history(practice, patients, sites, clinicians, users)
          seed_external_workflow_examples(practice, patients.first, actor, label)
        end
      end
      practice
    end

    def self.create_roles
      ROLE_PERMISSIONS.to_h do |name, actions|
        versions = {}
        versions[1] = create_role(name, 1, LEGACY_ROLE_PERMISSIONS.fetch(name)) if LEGACY_ROLE_PERMISSIONS.key?(name)
        versions[2] = create_role(name, 2, actions)
        [ name, versions ]
      end
    end
    private_class_method :create_roles

    def self.create_role(name, version, actions)
      role = RoleVersion.find_or_create_by!(role_code: "synthetic-review-#{name}", version: version)
      actions.each do |action|
        permission = Permission.find_or_create_by!(action_code: action)
        RoleVersionPermission.find_or_create_by!(role_version: role, permission: permission)
      end
      role
    end
    private_class_method :create_role

    def self.create_practice(label, roles)
      organization = Organization.find_or_create_by!(name: "#{PREFIX} Organization #{label}")
      practice = Clinic::Practice.find_or_create_by!(organization: organization, name: "#{PREFIX} Practice #{label}") do |row|
        row.timezone = "America/Chicago"
      end
      users = create_users(practice, label, roles)
      actor = users.fetch("admin").first

      PaperTrail.request(whodunnit: actor.id.to_s, controller_info: { causal_id: "synthetic-backend-seed-v2" }) do
        sites = seed_facilities(practice)
        clinicians = seed_clinicians(practice, users.fetch("clinician").first(ACTIVE_USERS_PER_ROLE), sites, label)
        patients = seed_patients(practice, label, actor)
        seed_chart_history(practice, patients, sites, clinicians, users)
        seed_external_workflow_examples(practice, patients.first, actor, label)
        seed_staff_and_inventory(practice, actor, label)
      end
      practice
    end
    private_class_method :create_practice

    def self.create_users(practice, label, roles)
      ROLE_PERMISSIONS.keys.to_h do |name|
        users = (1..(ACTIVE_USERS_PER_ROLE + 1)).map do |position|
          legacy_identity = position == 1 && LEGACY_ROLE_PERMISSIONS.key?(name)
          suffix = legacy_identity ? "" : position == ACTIVE_USERS_PER_ROLE + 1 ? "-inactive" : "-#{position}"
          email = "synthetic-review-#{label.downcase}-#{name}#{suffix}@example.invalid"
          user = User.find_or_create_by!(email_address: email) { |row| row.password = SecureRandom.hex(32) }
          membership = Clinic::Membership.find_or_create_by!(user: user) do |row|
            row.practice = practice
            row.active = position <= ACTIVE_USERS_PER_ROLE
          end
          raise "Synthetic seed identity collision; existing assignment preserved." unless membership.practice_id == practice.id

          role_version = roles.fetch(name).fetch(legacy_identity ? 1 : 2)
          membership.role_grants.find_or_create_by!(role_version: role_version, scope_kind: "practice", site_id: nil) do |grant|
            grant.practice = practice
            grant.effective_from = Time.utc(2026, 1, 1)
            grant.revision = 1
          end
          user
        end
        [ name, users ]
      end
    end
    private_class_method :create_users

    def self.seed_facilities(practice)
      %w[MAIN ANNEX].map do |code|
        site = practice.sites.find_or_create_by!(code: code)
        %w[ROOM-1 ROOM-2].each { |room_code| site.rooms.find_or_create_by!(practice: practice, code: room_code) }
        site
      end
    end
    private_class_method :seed_facilities

    def self.seed_clinicians(practice, users, sites, label)
      department = practice.departments.find_or_create_by!(code: "PRIMARY-CARE")
      users.map.with_index do |user, index|
        profile = practice.clinician_profiles.find_or_create_by!(membership: user.clinic_membership)
        sites.each do |site|
          profile.assignments.find_or_create_by!(practice: practice, site: site, department: department,
            effective_from: Time.utc(2026, 1, 1))
        end
        profile.credentials.find_or_create_by!(practice: practice,
          credential_type: "SYNTHETIC-NOT-A-LICENSE", jurisdiction: "Synthetic",
          issuer_reference: "SYN-#{label}-#{index + 1}", review_status: "unverified")
        profile
      end
    end
    private_class_method :seed_clinicians

    def self.seed_patients(practice, label, actor)
      PATIENT_NAMES.map.with_index do |name, index|
        reference = "SYN-#{label}-#{format('%03d', index + 1)}"
        old_name = "Synthetic Patient #{label} #{index + 1}"
        patient = practice.patients.find_or_create_by!(reference: reference) { |row| row.display_name = "#{name} [Synthetic]" }
        patient.update!(display_name: "#{name} [Synthetic]") if patient.display_name == old_name
        seed_registration(patient, actor, label, index)
        patient
      end
    end
    private_class_method :seed_patients

    def self.seed_registration(patient, actor, label, index)
      practice = patient.practice
      effective_from = Time.utc(2025, 12, 1) + index.days
      patient.create_demographics!(practice: practice,
        date_of_birth: Date.new(1952 + (index * 3) % 51, (index % 12) + 1, (index % 27) + 1),
        sex: %w[female male intersex unknown not_recorded][index % 5],
        primary_language: index % 7 == 0 ? "Spanish" : "English",
        interpreter_required: index % 7 == 0) unless patient.demographics
      unless patient.contacts.exists?
        patient.contacts.create!(practice: practice, contact_type: "phone",
          contact_value: "+1-202-555-#{format('%04d', 1000 + index)}", preferred: index.even?, effective_from: effective_from)
        patient.contacts.create!(practice: practice, contact_type: "email",
          contact_value: "synthetic.patient.#{label.downcase}.#{index + 1}@example.invalid",
          preferred: index.odd?, effective_from: effective_from)
      end
      unless patient.emergency_contacts.exists?
        patient.emergency_contacts.create!(practice: practice,
          name: "Emergency Contact #{index + 1} [Synthetic]", relationship: %w[spouse sibling friend parent][index % 4],
          phone: "+1-202-555-#{format('%04d', 5000 + index)}", permission_to_contact: index % 4 != 0,
          effective_from: effective_from)
      end
      patient.create_communication_preference!(practice: practice,
        preferred_contact_method: %w[text phone email portal][index % 4],
        appointment_reminders_consent: index % 3 != 0,
        general_communications_consent: index.even?) unless patient.communication_preference
      unless patient.social_histories.exists?
        patient.social_histories.create!(practice: practice, effective_from: effective_from,
          tobacco_use: index % 5 == 0 ? "Synthetic scenario: former use reported" : "Synthetic scenario: no use reported",
          alcohol_use: index % 4 == 0 ? "Synthetic scenario: occasional use reported" : "Synthetic scenario: no use reported",
          exercise_habits: "Synthetic scenario: walks #{2 + (index % 4)} days per week",
          diet: "Synthetic scenario: mixed home-prepared diet", occupation: "Synthetic occupation #{(index % 8) + 1}",
          living_situation: index % 3 == 0 ? "Synthetic scenario: lives with family" : "Synthetic scenario: lives independently",
          relevant_social_factors: index % 6 == 0 ? "Synthetic scenario: transportation planning requested" : "Synthetic scenario: none recorded")
      end
      return if patient.address_versions.exists?

      Clinic::Care::AddPatientAddress.call(practice: practice, actor: actor, patient: patient,
        encrypted_address: "#{100 + index} Example Avenue, Sample City, TX 750#{format('%02d', index)} (synthetic; not deliverable)",
        make_primary: true)
    end
    private_class_method :seed_registration

    def self.seed_chart_history(practice, patients, sites, clinicians, users)
      visit_type = practice.visit_types.find_or_create_by!(code: "SYNTHETIC-FOLLOW-UP")
      actor = users.fetch("admin").first
      staff_actor = users.fetch("staff")[1]
      clinician_actor = users.fetch("clinician").first

      patients.first(HISTORICAL_PATIENT_COUNT).each_with_index do |patient, index|
        site = sites[index % sites.length]
        clinician = clinicians[index % clinicians.length]
        started_at = SCENARIO_START + index.weeks + (index % 3).hours
        appointment = find_or_book_appointment(practice, actor, patient, site, clinician, visit_type, started_at)
        Clinic::Scheduling::TransitionAppointment.call(appointment: appointment, actor: actor, to: "confirmed") if appointment.status == "scheduled"
        encounter = practice.encounters.find_by(appointment: appointment) ||
          Clinic::Scheduling::CreateEncounter.call(practice: practice, actor: actor, patient: patient, site: site,
            room: appointment.room, appointment: appointment, started_at: started_at)
        seed_participants(encounter, staff_actor.clinic_membership, clinician.membership, started_at)
        seed_vitals(practice, patient, encounter, staff_actor, started_at, index)
        seed_soap_note(practice, encounter, clinician_actor, index)
        if encounter.ended_at.nil? && index >= 3
          Clinic::Scheduling::CloseEncounter.call(encounter: encounter, actor: actor, ended_at: started_at + 35.minutes)
        end
        if appointment.status == "confirmed" && index >= 3
          Clinic::Scheduling::TransitionAppointment.call(appointment: appointment, actor: actor, to: "completed")
        end
      end

      patients.drop(HISTORICAL_PATIENT_COUNT).first(UPCOMING_PATIENT_COUNT).each_with_index do |patient, index|
        site = sites[index % sites.length]
        clinician = clinicians[index % clinicians.length]
        starts_at = Time.utc(2026, 9, 8, 14) + index.hours
        find_or_book_appointment(practice, actor, patient, site, clinician, visit_type, starts_at)
      end
    end
    private_class_method :seed_chart_history

    def self.find_or_book_appointment(practice, actor, patient, site, clinician, visit_type, starts_at)
      practice.appointments.find_by(patient: patient, starts_at: starts_at) ||
        Clinic::Scheduling::BookAppointment.call(practice: practice, actor: actor, patient: patient, site: site,
          room: site.rooms.order(:code).first, booked_clinician: clinician, visit_type: visit_type,
          starts_at: starts_at, ends_at: starts_at + 30.minutes)
    end
    private_class_method :find_or_book_appointment

    def self.seed_participants(encounter, staff_membership, clinician_membership, started_at)
      { "intake" => staff_membership, "clinician" => clinician_membership }.each do |role, membership|
        encounter.participants.find_or_create_by!(membership: membership, participation_role: role) do |participant|
          participant.practice = encounter.practice
          participant.patient = encounter.patient
          participant.effective_from = started_at
          participant.effective_until = encounter.ended_at
        end
      end
    end
    private_class_method :seed_participants

    def self.seed_vitals(practice, patient, encounter, actor, observed_at, index)
      values = {
        "vital-systolic-bp" => [ 112 + (index % 8) * 2, "mm[Hg]" ],
        "vital-diastolic-bp" => [ 68 + (index % 6) * 2, "mm[Hg]" ],
        "vital-heart-rate" => [ 64 + index, "/min" ],
        "vital-respiratory-rate" => [ 14 + (index % 4), "/min" ],
        "vital-oxygen-saturation" => [ 96 + (index % 3), "%" ],
        "vital-temperature" => [ BigDecimal("36.4") + BigDecimal((index % 5).to_s) / 10, "Cel" ],
        "vital-weight" => [ 58 + (index * 3), "kg" ]
      }
      values.each do |code, (value, unit)|
        next if patient.observations.exists?(encounter: encounter, code: code)

        Clinic::Care::RecordObservation.call(practice: practice, actor: actor, patient: patient, attributes: {
          encounter: encounter, code: code, code_system: "synthetic-vitals", code_version: "1",
          value_kind: "numeric", numeric_value: value, unit_code: unit,
          observed_at: observed_at + 10.minutes, recorded_at: observed_at + 11.minutes
        })
      end
    end
    private_class_method :seed_vitals

    def self.seed_soap_note(practice, encounter, actor, index)
      note = encounter.notes.find_by(note_kind: "soap")
      unless note
        note = Clinic::Care::CreateEncounterNote.call(practice: practice, actor: actor, encounter: encounter,
          note_kind: "soap", payload_version: Clinic::Care::SoapNotePayload::VERSION,
          encrypted_body: soap_payload(index, revision: 1))
      end
      if index.positive? && note.revisions.count == 1 && note.signatures.empty?
        Clinic::Care::ReviseEncounterNote.call(note: note, actor: actor, expected_revision: 1,
          payload_version: Clinic::Care::SoapNotePayload::VERSION,
          encrypted_body: soap_payload(index, revision: 2))
      end
      return unless index >= 2 && note.signatures.empty?

      revision = note.revisions.order(:revision_no).last
      Clinic::Care::SignEncounterNote.call(note: note, actor: actor, revision_no: revision.revision_no,
        content_digest: Digest::SHA256.hexdigest(revision.encrypted_body),
        attestation_version: "synthetic-seed-v1", signed_at: encounter.started_at + 30.minutes)
    end
    private_class_method :seed_soap_note

    def self.soap_payload(index, revision:)
      Clinic::Care::SoapNotePayload.dump(template_id: "adult-physical-exam-detailed", template_version: 1,
        sections: {
          subjective: "SYNTHETIC ONLY: visit scenario #{index + 1}; invented history for workflow testing.",
          objective: "SYNTHETIC ONLY: vital-sign observations recorded separately; no examination is asserted.",
          assessment: revision == 1 ? "SYNTHETIC ONLY: draft assessment pending review." : "SYNTHETIC ONLY: revised assessment for history testing.",
          plan: revision == 1 ? "SYNTHETIC ONLY: draft plan pending review." : "SYNTHETIC ONLY: revised plan; not medical advice."
        })
    end
    private_class_method :soap_payload

    def self.seed_external_workflow_examples(practice, patient, actor, label)
      category = Clinic::DocumentCategory.find_or_create_by!(practice: practice, code: "SYNTHETIC") { |row| row.name = "Synthetic metadata only" }
      %w[pending clean quarantined rejected].each do |state|
        practice.documents.find_or_create_by!(object_key: "synthetic-review/#{label}/#{state}", object_version: "1") do |document|
          document.assign_attributes(patient: patient, category: category,
            checksum: Digest::SHA256.hexdigest("synthetic #{state}"), byte_size: 0,
            media_type: "text/plain", scan_state: state)
        end
      end
      %w[pending delivered unknown].each do |state|
        key = "synthetic-review-#{state}"
        next if practice.message_intents.exists?(request_key: key)
        message = Clinic::Messaging::CreateIntent.call(practice: practice, actor: actor, patient: patient, request_key: key,
          purpose_code: "synthetic-demo", encrypted_recipient_snapshot: "nobody@example.invalid",
          encrypted_content: "SYNTHETIC ONLY; never transmitted")
        Clinic::Messaging::RecordDelivery.call(intent: message, actor: actor,
          provider_event_reference: "synthetic-#{state}", outcome: state) unless state == "pending"
      end
      return if patient.invoices.exists?

      Clinic::Billing::DraftInvoice.call(practice: practice, actor: actor, patient: patient, currency: "USD",
        lines: [ { quantity: "2", unit_amount: "1.25", description_snapshot: "Synthetic arithmetic example; not selected pricing" } ])
    end
    private_class_method :seed_external_workflow_examples

    def self.seed_staff_and_inventory(practice, actor, label)
      %w[active inactive].each do |state|
        practice.staff_members.find_or_create_by!(job_title: "Synthetic #{state} coordinator") do |row|
          row.display_name = "Synthetic Staff #{label}"
          row.active = state == "active"
        end
      end
      item = practice.items.find_or_create_by!(sku: "SYN-OFFICE") { |row| row.name = "Synthetic paper"; row.reorder_level = 5 }
      item.adjust!(delta: 12, actor: actor, reason: "Synthetic sample opening", request_key: SecureRandom.uuid) unless item.entries.exists?
    end
    private_class_method :seed_staff_and_inventory
  end
end
