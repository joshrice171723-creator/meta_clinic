module Development
  # Wholly invented fixtures. Re-running preserves existing scenario edits and grants.
  class BackendSamples
    ROLES = {
      # Keep the already-granted review role immutable; SOAP note reads use
      # TestClinic/Omni fixtures until a versioned sample-role transition exists.
      "admin" => TestClinic::DEFAULT_PERMISSIONS - [ "notes.read" ],
      "clinician" => %w[patients.read patients.write appointments.write encounters.write notes.write notes.sign observations.write documents.read],
      "staff" => %w[patients.read patients.write appointments.write inventory.read staff.read messages.write],
      "reader" => %w[patients.read documents.read inventory.read staff.read]
    }.freeze
    PREFIX = "Synthetic Backend Review".freeze

    def self.call
      raise "Synthetic backend samples are local only." unless Rails.env.development? || Rails.env.test?

      ApplicationRecord.transaction do
        connection = ApplicationRecord.connection
        connection.execute("SELECT pg_advisory_xact_lock(hashtextextended('apply:backend-samples:v1', 0))")
        roles = ROLES.to_h do |name, actions|
          role = RoleVersion.find_or_create_by!(role_code: "synthetic-review-#{name}", version: 1)
          actions.each do |action|
            permission = Permission.find_or_create_by!(action_code: action)
            RoleVersionPermission.find_or_create_by!(role_version: role, permission: permission)
          end
          [ name, role ]
        end
        %w[A B].map { |label| create_practice(label, roles) }
      end
    end

    def self.create_practice(label, roles)
      organization = Organization.find_or_create_by!(name: "#{PREFIX} Organization #{label}")
      practice = Clinic::Practice.find_or_create_by!(organization: organization, name: "#{PREFIX} Practice #{label}") { |row| row.timezone = "America/Chicago" }
      users = ROLES.keys.to_h do |name|
        email = "synthetic-review-#{label.downcase}-#{name}@example.invalid"
        user = User.find_or_create_by!(email_address: email) { |row| row.password = SecureRandom.hex(32) }
        membership = Clinic::Membership.find_or_create_by!(user: user) { |row| row.practice = practice }
        raise "Synthetic seed identity collision; existing assignment preserved." unless membership.practice_id == practice.id
        role = roles.fetch(name)
        membership.role_grants.find_or_create_by!(role_version: role, scope_kind: "practice", site_id: nil) do |grant|
          grant.practice = practice
          grant.effective_from = Time.utc(2026, 1, 1)
          grant.revision = 1
        end
        [ name, user ]
      end
      actor = users.fetch("admin")
      PaperTrail.request(whodunnit: actor.id.to_s, controller_info: { causal_id: "synthetic-backend-seed-v1" }) do
        sites = %w[MAIN ANNEX].map { |code| practice.sites.find_or_create_by!(code: code) }
        sites.each { |site| site.rooms.find_or_create_by!(practice: practice, code: "ROOM-1") }
        department = practice.departments.find_or_create_by!(code: "SYNTHETIC")
        visit_type = practice.visit_types.find_or_create_by!(code: "SYNTHETIC-REVIEW")
        clinician = practice.clinician_profiles.find_or_create_by!(membership: users.fetch("clinician").clinic_membership)
        sites.each do |site|
          clinician.assignments.find_or_create_by!(practice: practice, site: site, department: department, effective_from: Time.utc(2026, 1, 1))
        end
        clinician.credentials.find_or_create_by!(practice: practice, credential_type: "SYNTHETIC-NOT-A-LICENSE", jurisdiction: "Synthetic", issuer_reference: "SYN-#{label}", review_status: "unverified")
        patients = 30.times.map do |index|
          practice.patients.find_or_create_by!(reference: "SYN-#{label}-#{format('%03d', index + 1)}") { |row| row.display_name = "Synthetic Patient #{label} #{index + 1}" }
        end
        sites.each_with_index do |site, index|
          patient = patients[index]
          appointment = practice.appointments.find_by(patient: patient)
          unless appointment
            appointment = Clinic::Scheduling::BookAppointment.call(practice: practice, actor: actor, patient: patient, site: site,
              room: site.rooms.first, booked_clinician: clinician, visit_type: visit_type,
              starts_at: Time.utc(2030, 1, 7, 15 + index), ends_at: Time.utc(2030, 1, 7, 15 + index, 30))
            Clinic::Scheduling::TransitionAppointment.call(appointment: appointment, actor: actor, to: "confirmed") if index.zero?
          end
          encounter = practice.encounters.find_by(patient: patient) || Clinic::Scheduling::CreateEncounter.call(practice: practice, actor: actor, patient: patient, site: site, appointment: appointment, started_at: Time.utc(2030, 1, 7, 15 + index))
          unless encounter.notes.exists?
            note = Clinic::Care::CreateEncounterNote.call(practice: practice, actor: actor, encounter: encounter, encrypted_body: "SYNTHETIC ONLY: workflow demonstration, no clinical advice.")
            Clinic::Care::ReviseEncounterNote.call(note: note, actor: actor, expected_revision: 1, encrypted_body: "SYNTHETIC ONLY: revised draft for history review.")
          end
          unless patient.observations.exists?
            Clinic::Care::RecordObservation.call(practice: practice, actor: actor, patient: patient, attributes: {
              encounter: encounter, code: "SYNTHETIC-TEXT", code_system: "synthetic", code_version: "1", value_kind: "text",
              text_value: "Wholly invented workflow value", observed_at: encounter.started_at, recorded_at: encounter.started_at
            })
          end
        end
        patient = patients.first
        Clinic::Care::AddPatientAddress.call(practice: practice, actor: actor, patient: patient, encrypted_address: "SYNTHETIC address, not a deliverable location", make_primary: true) unless patient.address_versions.exists?
        category = Clinic::DocumentCategory.find_or_create_by!(practice: practice, code: "SYNTHETIC") { |row| row.name = "Synthetic metadata only" }
        %w[pending clean quarantined rejected].each do |state|
          practice.documents.find_or_create_by!(object_key: "synthetic-review/#{label}/#{state}", object_version: "1") do |document|
            document.assign_attributes(patient: patient, category: category, checksum: Digest::SHA256.hexdigest("synthetic #{state}"), byte_size: 0, media_type: "text/plain", scan_state: state)
          end
        end
        %w[pending delivered unknown].each do |state|
          key = "synthetic-review-#{state}"
          next if practice.message_intents.exists?(request_key: key)
          message = Clinic::Messaging::CreateIntent.call(practice: practice, actor: actor, patient: patient, request_key: key,
            purpose_code: "synthetic-demo", encrypted_recipient_snapshot: "nobody@example.invalid", encrypted_content: "SYNTHETIC ONLY; never transmitted")
          Clinic::Messaging::RecordDelivery.call(intent: message, actor: actor, provider_event_reference: "synthetic-#{state}", outcome: state) unless state == "pending"
        end
        unless patient.invoices.exists?
          Clinic::Billing::DraftInvoice.call(practice: practice, actor: actor, patient: patient, currency: "USD", lines: [ { quantity: "2", unit_amount: "1.25", description_snapshot: "Synthetic arithmetic example; not selected pricing" } ])
        end
        %w[active inactive].each do |state|
          practice.staff_members.find_or_create_by!(job_title: "Synthetic #{state} coordinator") { |row| row.display_name = "Synthetic Staff #{label}"; row.active = state == "active" }
        end
        item = practice.items.find_or_create_by!(sku: "SYN-OFFICE") { |row| row.name = "Synthetic paper"; row.reorder_level = 5 }
        item.adjust!(delta: 12, actor: actor, reason: "Synthetic sample opening", request_key: SecureRandom.uuid) unless item.entries.exists?
      end
      practice
    end
    private_class_method :create_practice
  end
end
