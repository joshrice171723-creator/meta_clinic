require "digest"

module Development
  # Wholly invented fixtures. Re-running adds missing fixture structure while
  # preserving edited records, inactive memberships, and revoked grants.
  class BackendSamples
    ROLE_PERMISSIONS = {
      "admin" => TestClinic::DEFAULT_PERMISSIONS,
      "clinician" => %w[patients.read patients.write appointments.write encounters.write encounters.assign_provider notes.read notes.write notes.sign observations.write documents.read],
      "staff" => %w[patients.read patients.write appointments.write encounters.write encounters.assign_provider notes.read observations.write inventory.read staff.read messages.write],
      "inventory" => %w[inventory.read inventory.catalog inventory.receive inventory.adjust inventory.hold inventory.release inventory.count inventory.configure],
      "billing" => %w[patients.read billing.write documents.read],
      "reader" => %w[patients.read notes.read documents.read inventory.read staff.read],
      "front_desk" => %w[patients.identity.read appointments.read appointments.book appointments.status_transition],
      "scheduler" => %w[patients.identity.read appointments.read appointments.book appointments.status_transition],
      "billing_operator" => %w[patients.identity.read billing.read billing.invoice_draft billing.invoice_post billing.payment_record]
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
    BOARD_SCENARIO_ELAPSED_MINUTES = [ 300, 250, 200, 150, 100, 50 ].freeze
    BOARD_REPLACEMENT_SPACING_MINUTES = 35
    BOARD_SCENARIOS = [
      { stage: "waiting", reason: "Annual wellness", visit_type_code: "SYN-BOARD-ANNUAL",
        site_code: "MAIN", room_code: "WAITING", vitals: false },
      { stage: "intake", reason: "New patient intake", visit_type_code: "SYN-BOARD-NEW-PATIENT",
        site_code: "MAIN", room_code: "MAIN-1", vitals: false },
      { stage: "ready", reason: "Medication follow-up", visit_type_code: "SYN-BOARD-MED-FOLLOW-UP",
        site_code: "MAIN", room_code: "MAIN-2", vitals: true },
      { stage: "clinician", reason: "Same-day concern", visit_type_code: "SYN-BOARD-SAME-DAY",
        site_code: "ANNEX", room_code: "ANNEX-1", vitals: true },
      { stage: "checkout", reason: "Results review", visit_type_code: "SYN-BOARD-RESULTS",
        site_code: "MAIN", room_code: "CHECKOUT", vitals: true },
      { stage: "unrecorded", reason: "Care-plan follow-up", visit_type_code: "SYN-BOARD-CARE-PLAN",
        site_code: "ANNEX", room_code: "ANNEX-2", vitals: false }
    ].map(&:freeze).freeze

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
          clinician_users = seed_population_clinicians(practice, actor, label)
          clinicians = seed_clinicians(practice, clinician_users, sites, label)
          patients = seed_patients(practice, label, actor)
          seed_patient_memberships(practice, patients, actor)
          users = { "admin" => [ actor ], "clinician" => clinician_users, "staff" => [ actor, actor ] }
          seed_chart_history(practice, patients, sites, clinicians, users)
          seed_tracking_board_scenarios(practice, patients, sites, clinicians, users)
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
        clinician_users = seed_population_clinicians(
          practice, actor, label,
          candidates: users.fetch("clinician").select { |user| user.clinic_membership.active? }
        )
        clinicians = seed_clinicians(practice, clinician_users, sites, label)
        patients = seed_patients(practice, label, actor)
        seed_patient_memberships(practice, patients, actor)
        users = users.merge("clinician" => clinician_users)
        seed_chart_history(practice, patients, sites, clinicians, users)
        seed_tracking_board_scenarios(practice, patients, sites, clinicians, users)
        seed_external_workflow_examples(practice, patients.first, actor, label)
        seed_staff_and_inventory(practice, actor, label)
      end
      practice
    end
    private_class_method :create_practice

    def self.seed_population_clinicians(practice, actor, label, candidates: [])
      users = [ actor, *candidates ].uniq.first(3)
      while users.length < 3
        position = users.length + 1
        email = "synthetic-review-#{label.downcase}-provider-profile-#{position}@example.invalid"
        user = User.find_or_create_by!(email_address: email) { |row| row.password = SecureRandom.hex(32) }
        membership = Clinic::Membership.find_or_create_by!(user: user) do |row|
          row.practice = practice
          row.active = true
        end
        raise "Synthetic seed identity collision; existing assignment preserved." unless membership.practice_id == practice.id
        users << user
      end
      users
    end
    private_class_method :seed_population_clinicians

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
      rooms_by_site = {
        "MAIN" => %w[WAITING MAIN-1 MAIN-2 CHECKOUT],
        "ANNEX" => %w[ANNEX-1 ANNEX-2]
      }
      rooms_by_site.map do |code, room_codes|
        site = practice.sites.find_or_create_by!(code: code)
        room_codes.each { |room_code| site.rooms.find_or_create_by!(practice: practice, code: room_code) }
        site
      end
    end
    private_class_method :seed_facilities

    def self.seed_clinicians(practice, users, sites, label)
      department = practice.departments.find_or_create_by!(code: "PRIMARY-CARE")
      users.map.with_index do |user, index|
        profile = practice.clinician_profiles.find_or_create_by!(membership: user.clinic_membership)
        profile.update!(display_name: [ "Alex Rowan, NP", "Morgan Ellis, MD", "Riley Chen, DO" ].fetch(index)) if profile.display_name.blank?
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
        first_name, last_name = name.split(" ", 2)
        display_name = "SYN_#{last_name}, #{first_name}"
        previous_display_name = "#{name} [Synthetic]"
        patient = practice.patients.find_or_create_by!(reference: reference) { |row| row.display_name = display_name }
        if [ old_name, previous_display_name ].include?(patient.display_name)
          patient.update!(display_name: display_name)
        end
        seed_registration(patient, actor, label, index)
        patient
      end
    end
    private_class_method :seed_patients

    def self.seed_patient_memberships(practice, patients, actor)
      statuses = [ "member", "nonmember", nil, "member", "nonmember", nil ]
      patients.each_with_index do |patient, index|
        status = statuses.fetch(index % statuses.length)
        next unless status

        membership = patient.patient_memberships.find_or_create_by!(version: 1) do |row|
          row.practice = practice
          row.recorded_by_membership = actor.clinic_membership
          row.status = status
          row.version = 1
          row.effective_from = Time.utc(2026, 1, 1) + index.days
        end
        raise "Synthetic patient membership crossed practice boundary." unless membership.practice_id == practice.id
      end
    end
    private_class_method :seed_patient_memberships

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
          name: "Emergency Contact #{index + 1}", relationship: %w[spouse sibling friend parent][index % 4],
          phone: "+1-202-555-#{format('%04d', 5000 + index)}", permission_to_contact: index % 4 != 0,
          effective_from: effective_from)
      end
      patient.create_communication_preference!(practice: practice,
        preferred_contact_method: %w[text phone email portal][index % 4],
        appointment_reminders_consent: index % 3 != 0,
        general_communications_consent: index.even?) unless patient.communication_preference
      seed_patient_care_records(patient, actor, index)
      unless patient.social_histories.exists?
        patient.social_histories.create!(practice: practice, effective_from: effective_from,
          tobacco_use: index % 5 == 0 ? "Former use reported" : "No use reported",
          alcohol_use: index % 4 == 0 ? "Occasional use reported" : "No use reported",
          exercise_habits: "Walks #{2 + (index % 4)} days per week",
          diet: "Mixed home-prepared diet", occupation: "Occupation #{(index % 8) + 1}",
          living_situation: index % 3 == 0 ? "Lives with family" : "Lives independently",
          relevant_social_factors: index % 6 == 0 ? "Transportation planning requested" : "None recorded")
      end
      return if patient.address_versions.exists?

      Clinic::Care::AddPatientAddress.call(practice: practice, actor: actor, patient: patient,
        encrypted_address: "#{100 + index} Example Avenue, Sample City, TX 750#{format('%02d', index)}",
        make_primary: true)
    end
    private_class_method :seed_registration

    def self.seed_patient_care_records(patient, actor, index)
      membership = actor.clinic_membership
      recorded_at = Time.utc(2025, 12, 10) + index.days
      case index
      when 0
        patient.allergies.find_or_create_by!(recorded_at: recorded_at) do |allergy|
          allergy.practice = patient.practice
          allergy.data_status = "recorded"
          allergy.allergen_name = "Environmental allergen alpha"
          allergy.reaction = "Localized rash"
          allergy.category = "medication"
          allergy.clinical_status = "active"
          allergy.verification_status = "confirmed"
          allergy.criticality = "low"
          allergy.severity = "mild"
          allergy.recorded_by_membership = membership
          allergy.last_reviewed_at = recorded_at
          allergy.reviewed_by_membership = membership
        end
        patient.medication_statements.find_or_create_by!(recorded_at: recorded_at) do |medication|
          medication.practice = patient.practice
          medication.data_status = "recorded"
          medication.medication_name = "Daily medication alpha"
          medication.dose_text = "10 units"
          medication.route_text = "By mouth"
          medication.frequency_text = "Once daily"
          medication.purpose = "Medication history review"
          medication.status = "active"
          medication.information_source = "patient"
          medication.effective_from = recorded_at - 30.days
          medication.asserted_at = recorded_at
          medication.recorded_by_membership = membership
          medication.last_reviewed_at = recorded_at
          medication.reviewed_by_membership = membership
        end
        seed_care_need(patient, membership, recorded_at,
          category: "communication", code: "spoken_language_interpreter",
          description: "Spanish interpreter requested",
          instructions: "Arrange a qualified spoken-language interpreter.")
        seed_condition_alert(patient, membership, recorded_at)
      when 1
        patient.medication_statements.find_or_create_by!(recorded_at: recorded_at) do |medication|
          medication.practice = patient.practice
          medication.data_status = "recorded"
          medication.medication_name = "Maintenance medication beta"
          medication.dose_text = "One tablet"
          medication.route_text = "By mouth"
          medication.frequency_text = "Twice daily"
          medication.status = "active"
          medication.information_source = "caregiver"
          medication.asserted_at = recorded_at
          medication.recorded_by_membership = membership
        end
        seed_care_need(patient, membership, recorded_at,
          category: "mobility", code: "transfer_assistance",
          description: "Transfer assistance requested",
          instructions: "Use the accessible exam room and ask before assisting.")
      when 2
        patient.allergies.find_or_create_by!(recorded_at: recorded_at) do |allergy|
          allergy.practice = patient.practice
          allergy.data_status = "recorded"
          allergy.allergen_name = "Environmental allergen"
          allergy.reaction = "Swelling"
          allergy.category = "environment"
          allergy.clinical_status = "active"
          allergy.verification_status = "presumed"
          allergy.criticality = "unable_to_assess"
          allergy.severity = "moderate"
          allergy.recorded_by_membership = membership
        end
        seed_care_need(patient, membership, recorded_at,
          category: "equipment", code: "supplemental_oxygen",
          description: "Supplemental oxygen equipment noted",
          instructions: "Verify the current device settings with clinical staff.")
      when 3
        seed_care_need(patient, membership, recorded_at,
          category: "communication", code: "hearing_assistance",
          description: "Hearing assistance requested",
          instructions: "Face the patient and use the requested communication aid.")
      when 4
        seed_condition_alert(patient, membership, recorded_at)
      end
    end
    private_class_method :seed_patient_care_records

    def self.seed_care_need(patient, membership, recorded_at, category:, code:, description:, instructions:)
      patient.care_needs.find_or_create_by!(need_code: code, effective_from: recorded_at) do |need|
        need.practice = patient.practice
        need.category = category
        need.description = description
        need.instructions = instructions
        need.status = "active"
        need.recorded_by_membership = membership
        need.recorded_at = recorded_at
      end
    end
    private_class_method :seed_care_need

    def self.seed_condition_alert(patient, membership, recorded_at)
      patient.conditions.find_or_create_by!(recorded_at: recorded_at) do |condition|
        condition.practice = patient.practice
        condition.data_status = "recorded"
        condition.condition_name = "Condition affecting today's care"
        condition.clinical_status = "active"
        condition.verification_status = "confirmed"
        condition.affects_current_care = true
        condition.care_instruction = "Review the current care instruction before treatment."
        condition.recorded_by_membership = membership
      end
    end
    private_class_method :seed_condition_alert

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
        seed_encounter_care_summary(patient, encounter, staff_actor.clinic_membership, started_at, index)
        seed_vitals(practice, patient, encounter, staff_actor, started_at, index)
        seed_soap_note(practice, encounter, clinician_actor, index)
        if encounter.ended_at.nil?
          Clinic::Scheduling::CloseEncounter.call(encounter: encounter, actor: actor, ended_at: started_at + 35.minutes,
            request_key: "synthetic-encounter-close-#{encounter.id}")
        end
        if appointment.status == "confirmed"
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

    def self.seed_tracking_board_scenarios(practice, patients, sites, clinicians, users)
      actor = users.fetch("admin").first
      staff_membership = users.fetch("staff")[1].clinic_membership
      clinician_membership = users.fetch("clinician").first.clinic_membership
      sites_by_code = sites.index_by(&:code)

      BOARD_SCENARIOS.each_with_index do |scenario, index|
        patient = patients.fetch(index)
        encounter = current_or_replacement_board_encounter(
          practice: practice,
          actor: actor,
          patient: patient,
          clinician: clinicians[index % clinicians.length],
          site: sites_by_code.fetch(scenario.fetch(:site_code)),
          scenario: scenario,
          index: index
        )
        seed_board_participants(encounter, staff_membership, clinician_membership, scenario.fetch(:stage))
        provider = clinicians[index % clinicians.length]
        unless encounter.participants.queue_providers.current.exists?
          encounter.participants.create!(practice: practice, patient: patient, membership: provider.membership,
            participation_role: "queue_provider", effective_from: encounter.started_at)
        end
        seed_encounter_care_summary(patient, encounter, staff_membership, encounter.started_at, index)
        seed_vitals(practice, patient, encounter, users.fetch("staff")[1], encounter.started_at, index) if scenario.fetch(:vitals)
      end
    end
    private_class_method :seed_tracking_board_scenarios

    def self.current_or_replacement_board_encounter(practice:, actor:, patient:, clinician:, site:, scenario:, index:)
      visit_type = practice.visit_types.find_or_create_by!(code: scenario.fetch(:visit_type_code))
      current = practice.encounters.open.joins(appointment: :visit_type)
        .find_by(patient: patient, clinic_visit_types: { id: visit_type.id })
      if current
        normalize_board_encounter_timing!(current, scenario: scenario, index: index, now: Time.current)
        return current
      end

      generation = patient.appointments.where(visit_type: visit_type).count
      elapsed_minutes = BOARD_SCENARIO_ELAPSED_MINUTES.fetch(index) +
        (generation * BOARD_REPLACEMENT_SPACING_MINUTES)
      starts_at = Time.current - elapsed_minutes.minutes
      room = site.rooms.find_by!(code: scenario.fetch(:room_code))
      appointment = Clinic::Scheduling::BookAppointment.call(
        practice: practice,
        actor: actor,
        patient: patient,
        site: site,
        room: room,
        booked_clinician: clinician,
        visit_type: visit_type,
        starts_at: starts_at,
        ends_at: starts_at + 30.minutes
      )
      Clinic::Scheduling::TransitionAppointment.call(appointment: appointment, actor: actor, to: "confirmed")
      Clinic::Scheduling::CreateEncounter.call(
        practice: practice,
        actor: actor,
        patient: patient,
        site: site,
        room: room,
        appointment: appointment,
        started_at: starts_at
      )
    end
    private_class_method :current_or_replacement_board_encounter

    def self.normalize_board_encounter_timing!(encounter, scenario:, index:, now:)
      return unless managed_board_encounter?(encounter, scenario, index)

      if encounter.started_at > now
        encounter.update!(started_at: now - BOARD_SCENARIO_ELAPSED_MINUTES.fetch(index).minutes)
      end
      appointment = encounter.appointment
      if appointment && appointment.starts_at > now
        appointment.update!(starts_at: encounter.started_at, ends_at: encounter.started_at + 30.minutes)
      end
      normalize_board_dependents!(encounter, encounter.started_at, now, index)
    end
    private_class_method :normalize_board_encounter_timing!

    def self.managed_board_encounter?(encounter, scenario, index)
      expected_suffix = format("%03d", index + 1)
      encounter.patient.reference.match?(/\ASYN-[A-Z0-9-]+-#{expected_suffix}\z/) &&
        encounter.appointment&.visit_type&.code == scenario.fetch(:visit_type_code)
    end
    private_class_method :managed_board_encounter?

    def self.normalize_board_dependents!(encounter, started_at, now, index)
      normalize_seed_vitals!(encounter, started_at, now, index)
      normalize_seed_history_reviews!(encounter, started_at, now)
      normalize_seed_precaution!(encounter, started_at, now)
    end
    private_class_method :normalize_board_dependents!

    def self.normalize_seed_vitals!(encounter, started_at, now, index)
      expected_values = synthetic_vital_values(index)
      exact_scope = encounter.observations.where(
        practice_id: encounter.practice_id,
        patient_id: encounter.patient_id,
        code: expected_values.keys,
        code_system: "synthetic-vitals",
        code_version: "1",
        value_kind: "numeric"
      )
      receipt_observations = exact_scope.where(id: seed_vital_receipt_resource_ids(encounter)).to_a
      legacy_candidates = exact_scope.where("observed_at > ? AND recorded_at > ?", now, now).to_a.select do |observation|
        observation.recorded_at == observation.observed_at + 1.minute &&
          exact_synthetic_vital?(observation, expected_values)
      end
      legacy_observations = legacy_candidates.group_by { |observation| [ observation.observed_at, observation.recorded_at ] }
        .values.find do |group|
          group.length == expected_values.length && group.map(&:code).sort == expected_values.keys.sort
        end || []

      (receipt_observations + legacy_observations).uniq(&:id).each do |observation|
        next unless observation.observed_at > now && observation.recorded_at > now
        next unless observation.recorded_at == observation.observed_at + 1.minute
        next unless exact_synthetic_vital?(observation, expected_values)

        observation.update!(
          observed_at: started_at + 10.minutes,
          recorded_at: started_at + 11.minutes
        )
      end
    end
    private_class_method :normalize_seed_vitals!

    def self.exact_synthetic_vital?(observation, expected_values)
      expected_value, expected_unit = expected_values.fetch(observation.code)
      observation.unit_code == expected_unit &&
        BigDecimal(observation.numeric_value.to_s) == BigDecimal(expected_value.to_s)
    rescue ArgumentError, KeyError
      false
    end
    private_class_method :exact_synthetic_vital?

    def self.seed_vital_receipt_resource_ids(encounter)
      request_prefix = "synthetic-vital-#{encounter.id}-"
      Clinic::OperationReceipt.where(
        practice_id: encounter.practice_id,
        operation_code: "observations.create"
      ).where("request_key LIKE ?", "#{request_prefix}%").pluck(:resource_id)
    end
    private_class_method :seed_vital_receipt_resource_ids

    def self.normalize_seed_history_reviews!(encounter, started_at, now)
      %w[allergies medications care_needs].each do |topic|
        review = encounter.history_reviews.find_by(
          request_key: "synthetic-history-#{encounter.id}-#{topic}"
        )
        next unless review && review.reviewed_at > now

        encounter.history_reviews.find_or_create_by!(
          request_key: "synthetic-history-normalized-#{encounter.id}-#{topic}"
        ) do |corrected|
          corrected.practice = encounter.practice
          corrected.patient = encounter.patient
          corrected.topic = review.topic
          corrected.outcome = review.outcome
          corrected.information_source = review.information_source
          corrected.notes = review.notes
          corrected.reviewer_membership = review.reviewer_membership
          corrected.reviewed_at = started_at + 5.minutes
        end
      end
    end
    private_class_method :normalize_seed_history_reviews!

    def self.normalize_seed_precaution!(encounter, started_at, now)
      original = encounter.precautions.where(
        precaution_type: "droplet",
        evidence_status: "suspected",
        status: "active"
      ).where("recorded_at > ?", now).detect do |precaution|
        precaution.instructions == "Follow the clinic's reviewed droplet-precaution procedure."
      end
      return unless original

      encounter.precautions.find_or_create_by!(precaution_type: original.precaution_type, recorded_at: started_at + 2.minutes) do |corrected|
        corrected.practice = encounter.practice
        corrected.patient = encounter.patient
        corrected.evidence_status = original.evidence_status
        corrected.status = original.status
        corrected.instructions = original.instructions
        corrected.recorded_by_membership = original.recorded_by_membership
      end
    end
    private_class_method :normalize_seed_precaution!

    def self.seed_board_participants(encounter, staff_membership, clinician_membership, stage)
      memberships = case stage
      when "intake", "ready"
        { "intake" => staff_membership }
      when "clinician"
        { "clinician" => clinician_membership }
      when "checkout"
        { "checkout" => staff_membership }
      else
        {}
      end
      memberships.each do |role, membership|
        encounter.participants.find_or_create_by!(membership: membership, participation_role: role) do |participant|
          participant.practice = encounter.practice
          participant.patient = encounter.patient
          participant.effective_from = encounter.started_at
        end
      end
    end
    private_class_method :seed_board_participants

    def self.tracking_board_scenario_for(encounter)
      return unless Rails.env.development? || Rails.env.test?

      visit_type_code = encounter.appointment&.visit_type&.code
      index = BOARD_SCENARIOS.index { |scenario| scenario.fetch(:visit_type_code) == visit_type_code }
      return unless index && encounter.patient.reference.match?(/\ASYN-[A-Z0-9-]+-#{format('%03d', index + 1)}\z/)

      BOARD_SCENARIOS.fetch(index).slice(:stage, :reason)
    end

    def self.seed_encounter_care_summary(patient, encounter, reviewer, started_at, index)
      topic_items = {
        "allergies" => patient.allergies.active_for_summary.exists?,
        "medications" => patient.medication_statements.active_for_summary.exists?,
        "care_needs" => patient.care_needs.active_at(started_at).exists?
      }
      topic_items.each do |topic, present|
        outcome = if index == 1 && topic == "care_needs"
          "follow_up_needed"
        elsif index == 2 && topic == "medications"
          "unable_to_obtain"
        else
          present ? "current_list_confirmed" : "none_reported"
        end
        patient.history_reviews.find_or_create_by!(practice: patient.practice,
          request_key: "synthetic-history-#{encounter.id}-#{topic}") do |review|
          review.encounter = encounter
          review.topic = topic
          review.outcome = outcome
          review.information_source = "patient"
          review.reviewer_membership = reviewer
          review.reviewed_at = started_at + 5.minutes
          review.notes = outcome == "follow_up_needed" ? "Follow-up is still needed." : nil
        end
      end
      return unless index.zero?

      encounter.precautions.find_or_create_by!(precaution_type: "droplet", recorded_at: started_at + 2.minutes) do |precaution|
        precaution.practice = patient.practice
        precaution.patient = patient
        precaution.evidence_status = "suspected"
        precaution.status = "active"
        precaution.instructions = "Follow the clinic's reviewed droplet-precaution procedure."
        precaution.recorded_by_membership = reviewer
      end
    end
    private_class_method :seed_encounter_care_summary

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
      synthetic_vital_values(index).each do |code, (value, unit)|
        next if patient.observations.exists?(encounter: encounter, code: code)

        Clinic::Care::RecordObservation.call(practice: practice, actor: actor, patient: patient, attributes: {
          encounter: encounter, code: code, code_system: "synthetic-vitals", code_version: "1",
          value_kind: "numeric", numeric_value: value, unit_code: unit,
          observed_at: observed_at + 10.minutes, recorded_at: observed_at + 11.minutes
        }, request_key: "synthetic-vital-#{encounter.id}-#{code}")
      end
    end
    private_class_method :seed_vitals

    def self.synthetic_vital_values(index)
      {
        "vital-systolic-bp" => [ 112 + (index % 8) * 2, "mm[Hg]" ],
        "vital-diastolic-bp" => [ 68 + (index % 6) * 2, "mm[Hg]" ],
        "vital-heart-rate" => [ 64 + index, "/min" ],
        "vital-respiratory-rate" => [ 14 + (index % 4), "/min" ],
        "vital-oxygen-saturation" => [ 96 + (index % 3), "%" ],
        "vital-temperature" => [ BigDecimal("36.4") + BigDecimal((index % 5).to_s) / 10, "Cel" ],
        "vital-weight" => [ 58 + (index * 3), "kg" ]
      }
    end
    private_class_method :synthetic_vital_values

    def self.seed_soap_note(practice, encounter, actor, index)
      note = encounter.notes.find_by(note_kind: "soap")
      unless note
        note = Clinic::Care::CreateEncounterNote.call(practice: practice, actor: actor, encounter: encounter,
          note_kind: "soap", payload_version: Clinic::Care::SoapNotePayload::VERSION,
          encrypted_body: soap_payload(index, revision: 1), request_key: "synthetic-soap-create-#{encounter.id}")
      end
      if index.positive? && note.revisions.count == 1 && note.signatures.empty?
        Clinic::Care::ReviseEncounterNote.call(note: note, actor: actor, expected_revision: 1,
          payload_version: Clinic::Care::SoapNotePayload::VERSION,
          encrypted_body: soap_payload(index, revision: 2), request_key: "synthetic-soap-revise-#{encounter.id}")
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
          subjective: "Visit scenario #{index + 1}; reported history reviewed.",
          objective: "Vital-sign observations recorded separately; examination details are not recorded.",
          assessment: revision == 1 ? "Draft assessment pending review." : "Revised assessment for history review.",
          plan: revision == 1 ? "Draft plan pending review." : "Revised plan for follow-up."
        })
    end
    private_class_method :soap_payload

    def self.seed_external_workflow_examples(practice, patient, actor, label)
      category = Clinic::DocumentCategory.find_or_create_by!(practice: practice, code: "SYNTHETIC") { |row| row.name = "Administrative metadata" }
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
          encrypted_content: "Please review the delivery details before sending.")
        Clinic::Messaging::RecordDelivery.call(intent: message, actor: actor,
          provider_event_reference: "synthetic-#{state}", outcome: state) unless state == "pending"
      end
      return if patient.invoices.exists?

      Clinic::Billing::DraftInvoice.call(practice: practice, actor: actor, patient: patient, currency: "USD",
        lines: [ { quantity: "2", unit_amount: "1.25", description_snapshot: "Administrative service fee" } ])
    end
    private_class_method :seed_external_workflow_examples

    def self.seed_staff_and_inventory(practice, actor, label)
      %w[active inactive].each do |state|
        practice.staff_members.find_or_create_by!(job_title: "#{state.capitalize} coordinator") do |row|
          row.display_name = "Operations staff #{label}"
          row.active = state == "active"
        end
      end
      item = practice.items.find_or_create_by!(sku: "SYN-OFFICE") { |row| row.name = "Copy paper"; row.reorder_level = 5 }
      item.adjust!(delta: 12, actor: actor, reason: "Opening stock", request_key: SecureRandom.uuid) unless item.entries.exists?
    end
    private_class_method :seed_staff_and_inventory
  end
end
