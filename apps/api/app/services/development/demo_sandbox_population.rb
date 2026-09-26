module Development
  class DemoSandboxPopulation
    PATIENTS_PER_SITE = 300
    FIRST_NAMES = %w[
      Avery Jordan Morgan Riley Casey Taylor Quinn Cameron Rowan Ellis Jamie Drew
      Parker Sydney Alex Robin Sage Emerson Dakota Hayden Logan Reese Blair Micah
      Arden Bailey Finley Jules Noel Shiloh
    ].freeze
    LAST_NAMES = %w[
      Brooks Chen Diaz Ellis Flores Grant Harper Ibrahim James Kim Lane Moreno
      Nguyen Ortiz Patel Quinn Rivera Silva Turner Usman Vega Walker Xu Young
      Zeller Adams Bennett Clarke Dawson Evans
    ].freeze
    STAFF_TITLES = [
      "Nurse practitioner", "Physician", "Physician assistant", "Registered nurse",
      "Medical assistant", "Medical assistant", "Front desk coordinator",
      "Front desk coordinator", "Billing specialist", "Inventory coordinator",
      "Care coordinator", "Clinic manager"
    ].freeze

    def self.prepare!(run)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? &&
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?

      primary = DemoLesson.find_by!(lesson_key: DemoLessonCatalog::SANDBOX_KEY,
        visitor_id: run.visitor_id, practice_id: run.practice_id)
      companion = DemoLesson.find_by!(lesson_key: DemoLessonCatalog::SANDBOX_COMPANION_KEY,
        visitor_id: run.visitor_id)
      organization = primary.practice.organization || raise(ArgumentError, "Sandbox organization is missing")
      expected_ids = [ primary.practice_id, companion.practice_id ].sort
      raise ArgumentError, "Sandbox organization has unexpected clinics" unless
        organization.practices.order(:id).pluck(:id) == expected_ids

      as_of = Current.business_time
      cohorts = [ primary.practice, companion.practice ].flat_map do |practice|
        sites = practice.sites.order(:id).to_a
        raise ArgumentError, "Sandbox clinic needs two locations" unless sites.length == 2

        sites.each_with_index.map { |site, index| { practice:, site:, site_index: index + 1 } }
      end
      cohorts.each do |cohort|
        prepare_staff!(**cohort, as_of:)
        prepare_patients!(**cohort, as_of:)
      end
      cohorts.each do |cohort|
        prepare_visit_history!(run:, **cohort, as_of:, weeks: 8)
        prepare_upcoming!(run:, **cohort, as_of:)
      end
    end

    def self.prepare_staff!(practice:, site:, site_index:, as_of:)
      department = practice.departments.first!
      3.times do |index|
        site.rooms.find_or_create_by!(practice:, code: "EXAM-#{index + 1}")
      end

      STAFF_TITLES.each_with_index do |title, index|
        person_index = 600 + (site_index - 1) * STAFF_TITLES.length + index
        name = "#{FIRST_NAMES.fetch(person_index % FIRST_NAMES.length)} " \
          "#{LAST_NAMES.fetch(person_index / FIRST_NAMES.length)}"
        email = "sandbox-staff-#{practice.id}-#{site_index}-#{index + 1}@example.test"
        user = User.find_or_create_by!(email_address: email) do |record|
          record.password = SecureRandom.urlsafe_base64(32)
          record.active = true
        end
        membership = practice.memberships.find_or_create_by!(user:)
        staff = practice.staff_members.create!(display_name: name, job_title: title, active: true)
        employment = Clinic::Workforce::Employment.create!(practice:, staff_member: staff,
          membership:, status: "active", effective_from: as_of - 65.days)
        employment.employment_sites.create!(practice:, site:, active: true,
          effective_from: as_of - 65.days)
        next unless index < 3

        clinician = practice.clinician_profiles.create!(membership:, display_name: name,
          reference: "SBX-CLIN-#{site_index}-#{index + 1}")
        clinician.assignments.create!(practice:, site:, department:, effective_from: as_of - 65.days)
        (1..5).each do |weekday|
          Clinic::Scheduling::CapacityRule.create!(practice:, site:, clinician:,
            kind: "weekly", weekday:, start_minute: 540, end_minute: 1020)
        end
      end
    end
    private_class_method :prepare_staff!

    def self.prepare_patients!(practice:, site:, site_index:, as_of:)
      existing = practice.patients.where(primary_site_id: site.id).count
      raise ArgumentError, "Sandbox location exceeds patient target" if existing > PATIENTS_PER_SITE

      (existing + 1).upto(PATIENTS_PER_SITE) do |ordinal|
        person_index = (site_index - 1) * PATIENTS_PER_SITE + ordinal - 1
        name = "#{FIRST_NAMES.fetch(person_index % FIRST_NAMES.length)} " \
          "#{LAST_NAMES.fetch(person_index / FIRST_NAMES.length)}"
        registered_at = as_of - (1 + (person_index * 17 % 59)).days
        patient = practice.patients.create!(
          display_name: name, reference: "SBX-#{site_index}-#{ordinal.to_s.rjust(3, '0')}",
          primary_site: site, created_at: registered_at
        )
        patient.create_demographics!(practice:, date_of_birth: birth_date(person_index),
          sex: %w[female male female male unknown female].fetch(person_index % 6),
          primary_language: person_index % 7 == 0 ? "Spanish" : "English",
          interpreter_required: person_index % 14 == 0)
      end
    end
    private_class_method :prepare_patients!

    def self.birth_date(index)
      Date.new(1945 + (index * 13 % 62), 1 + (index * 5 % 12), 1 + (index * 11 % 27))
    end
    private_class_method :birth_date

    def self.prepare_visit_history!(run:, practice:, site:, site_index:, as_of:, weeks: 1)
      raise ArgumentError, "Visit history belongs to the sandbox clinic" unless
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY &&
        run.practice.organization_id == practice.organization_id && site.practice_id == practice.id
      raise ArgumentError, "Choose one to eight historical weeks" unless weeks.between?(1, 8)

      clinicians = (1..3).map { |number|
        practice.clinician_profiles.find_by!(reference: "SBX-CLIN-#{site_index}-#{number}")
      }
      rooms = (1..3).map { |number| site.rooms.find_by!(code: "EXAM-#{number}") }
      raise ArgumentError, "Visit history needs physical rooms" unless rooms.all? { |room| room.kind == "physical" }
      patients = practice.patients.where(primary_site_id: site.id).order(:id).to_a
      raise ArgumentError, "Visit history needs a complete patient cohort" unless patients.length == PATIENTS_PER_SITE
      background_patients = patients.select { |patient| patient.reference.start_with?("SBX-") }
      raise ArgumentError, "Visit history needs background patients" if background_patients.length < 120

      visit_types = practice.visit_types.order(:id).limit(2).to_a
      raise ArgumentError, "Visit history needs a visit type" if visit_types.empty?

      zone = ActiveSupport::TimeZone[site.timezone_override.presence || practice.timezone] ||
        raise(ArgumentError, "Sandbox location timezone is unavailable")
      first_monday = as_of.in_time_zone(zone).to_date.beginning_of_week(:monday) - weeks.weeks
      last_monday = first_monday + weeks.weeks
      raise ArgumentError, "Visit history already exists for this location" if
        practice.appointments.where(site:, starts_at: first_monday...last_monday).exists?
      (1..5).each do |weekday|
        hours = site.operating_hours.find_by(day_of_week: weekday)
        raise ArgumentError, "Clinic hours do not cover the history slots" unless
          hours && !hours.closed? && hours.open_time.hour <= 9 && hours.close_time.hour >= 15
      end
      clinicians.each do |clinician|
        raise ArgumentError, "Clinician is not assigned for the history window" unless
          clinician.assignments.current(zone.local(first_monday.year, first_monday.month, first_monday.day, 9))
            .exists?(site_id: site.id)
        (1..5).each do |weekday|
          raise ArgumentError, "Clinician capacity does not cover history slots" unless
            Clinic::Scheduling::CapacityRule.where(practice:, site:, clinician:, kind: "weekly",
              weekday:, active: true).where("start_minute <= 540 AND end_minute >= 870").exists?
        end
      end

      ApplicationRecord.transaction do
        weeks.times do |week|
          appointments = []
          5.times do |weekday|
            date = first_monday + week.weeks + weekday.days
            clinicians.each_with_index do |clinician, clinician_index|
              [ 9, 10, 11, 14 ].each_with_index do |hour, slot|
                starts_at = zone.local(date.year, date.month, date.day, hour)
                ordinal = week * 60 + weekday * 12 + clinician_index * 4 + slot
                patient = background_patients.fetch(ordinal % background_patients.length)
                raise ArgumentError, "Visit patient belongs to another location" unless patient.primary_site_id == site.id

                appointments << {
                  practice_id: practice.id, patient_id: patient.id, site_id: site.id,
                  room_id: rooms.fetch(clinician_index).id, booked_clinician_id: clinician.id,
                  visit_type_id: visit_types.fetch(ordinal % visit_types.length).id,
                  starts_at:, ends_at: starts_at + 30.minutes, status: "completed",
                  visit_modality: "in_person", created_at: starts_at - 7.days,
                  updated_at: starts_at + 30.minutes
                }
              end
            end
          end
          inserted = Clinic::Appointment.insert_all!(appointments,
            returning: %w[id patient_id site_id room_id starts_at ends_at])
          raise "Historical appointment count mismatch" unless inserted.rows.length == 60

          encounters = inserted.rows.map do |id, patient_id, site_id, room_id, starts_at, ends_at|
            { practice_id: practice.id, patient_id:, appointment_id: id, site_id:, room_id:,
              started_at: starts_at, ended_at: ends_at, status: "completed",
              created_at: ends_at, updated_at: ends_at }
          end
          saved_encounters = Clinic::Encounter.insert_all!(encounters,
            returning: %w[id appointment_id patient_id ended_at])
          starts_by_appointment = inserted.rows.to_h { |id, _patient_id, _site_id, _room_id, starts_at, _ends_at|
            [ id, starts_at ]
          }
          amount_by_encounter = {}
          invoices = saved_encounters.rows.map do |id, appointment_id, patient_id, ended_at|
            hour = starts_by_appointment.fetch(appointment_id).in_time_zone(zone).hour
            amount_by_encounter[id] = { amount: { 9 => 110, 10 => 95, 11 => 75, 14 => 120 }.fetch(hour), paid: hour != 14 }
            { practice_id: practice.id, patient_id:, encounter_id: id, currency: "USD", status: "posted",
              rounding_policy_version: Clinic::Billing::Money::POLICY_VERSION,
              created_at: ended_at + 1.hour, updated_at: ended_at + 1.hour }
          end
          saved_invoices = Clinic::Invoice.insert_all!(invoices,
            returning: %w[id patient_id encounter_id created_at])
          lines = saved_invoices.rows.map do |id, patient_id, encounter_id, created_at|
            amount = amount_by_encounter.fetch(encounter_id).fetch(:amount)
            { practice_id: practice.id, patient_id:, invoice_id: id, quantity: 1,
              unit_amount: amount, posted_amount: amount, description_snapshot: "Office visit",
              created_at:, updated_at: created_at }
          end
          Clinic::InvoiceLine.insert_all!(lines)

          paid_invoices = saved_invoices.rows.select { |_id, _patient_id, encounter_id, _created_at|
            amount_by_encounter.fetch(encounter_id).fetch(:paid)
          }
          payments = paid_invoices.map do |id, patient_id, encounter_id, created_at|
            { practice_id: practice.id, patient_id:, currency: "USD",
              amount: amount_by_encounter.fetch(encounter_id).fetch(:amount),
              external_event_reference: "sandbox-local-payment-#{id}",
              created_at: created_at + 1.day, updated_at: created_at + 1.day }
          end
          saved_payments = Clinic::PaymentEvent.insert_all!(payments,
            returning: %w[id external_event_reference])
          payment_id_by_invoice = saved_payments.rows.to_h { |id, reference|
            [ Integer(reference.delete_prefix("sandbox-local-payment-")), id ]
          }
          allocations = paid_invoices.map do |id, patient_id, encounter_id, created_at|
            { practice_id: practice.id, patient_id:, invoice_id: id,
              payment_event_id: payment_id_by_invoice.fetch(id),
              amount: amount_by_encounter.fetch(encounter_id).fetch(:amount),
              created_at: created_at + 1.day, updated_at: created_at + 1.day }
          end
          Clinic::PaymentAllocation.insert_all!(allocations)
        end
      end
    end

    def self.prepare_upcoming!(run:, practice:, site:, site_index:, as_of:)
      raise ArgumentError, "Upcoming schedule belongs to the sandbox clinic" unless
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY &&
        run.practice.organization_id == practice.organization_id && site.practice_id == practice.id

      zone = ActiveSupport::TimeZone[site.timezone_override.presence || practice.timezone] ||
        raise(ArgumentError, "Sandbox location timezone is unavailable")
      first_monday = as_of.in_time_zone(zone).to_date.beginning_of_week(:monday) + 1.week
      clinicians = (1..3).map { |number|
        practice.clinician_profiles.find_by!(reference: "SBX-CLIN-#{site_index}-#{number}")
      }
      rooms = (1..3).map { |number| site.rooms.find_by!(code: "EXAM-#{number}") }
      patients = practice.patients.where(primary_site_id: site.id)
        .where("reference LIKE 'SBX-%'").order(:id).to_a
      raise ArgumentError, "Upcoming schedule needs background patients" if patients.length < 120
      visit_types = practice.visit_types.order(:id).limit(2).to_a
      raise ArgumentError, "Upcoming schedule needs visit types" if visit_types.empty?

      appointments = []
      2.times do |week|
        5.times do |weekday|
          date = first_monday + week.weeks + weekday.days
          clinicians.each_with_index do |clinician, clinician_index|
            [ 9, 10, 11, 12 ].each_with_index do |hour, slot|
              starts_at = zone.local(date.year, date.month, date.day, hour)
              ordinal = week * 60 + weekday * 12 + clinician_index * 4 + slot
              appointments << {
                practice_id: practice.id, patient_id: patients.fetch((ordinal + 60) % patients.length).id,
                site_id: site.id, room_id: rooms.fetch(clinician_index).id,
                booked_clinician_id: clinician.id, visit_type_id: visit_types.fetch(ordinal % visit_types.length).id,
                starts_at:, ends_at: starts_at + 30.minutes,
                status: ordinal % 4 == 0 ? "scheduled" : "confirmed", visit_modality: "in_person",
                created_at: as_of - 2.days, updated_at: as_of
              }
            end
          end
        end
      end
      Clinic::Appointment.insert_all!(appointments)
    end
  end
end
