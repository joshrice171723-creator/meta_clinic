require "csv"
require "digest"

module Development
  class BulkDevSeed
    DATA_ROOT = Rails.root.join("db", "seed_data", "bulk_v1").freeze
    PRACTICE_NAME = "Dev Seed Clinic"
    ORGANIZATION_NAME = "Dev Seed Organization"
    TIME_ZONE = "America/Chicago"
    WINDOW_DAYS = 90
    CURRENT_FLOW_VISIT_KEYS = %w[visit_001 visit_002 visit_003 visit_004 visit_005 visit_006].freeze

    class << self
      def call(as_of: Time.current)
        raise "Bulk dev seed is only available in development and test." unless Rails.env.development? || Rails.env.test?

        rows = load_rows
        validate_rows!(rows)
        as_of = seed_anchor(as_of)

        ApplicationRecord.transaction do
          roles = seed_roles(rows.fetch("roles.csv"))
          organization = Organization.find_or_create_by!(name: ORGANIZATION_NAME)
          practice = Clinic::Practice.find_or_initialize_by(name: PRACTICE_NAME)
          practice.organization = organization
          practice.timezone = TIME_ZONE
          practice.created_at ||= seed_timestamp(as_of, 0, hour: 7)
          practice.save!

          users = seed_users(practice, rows.fetch("users.csv"), rows.fetch("role_grants.csv"), roles, as_of)
          seed_staff_members(practice, rows.fetch("users.csv"), as_of)
          facilities = seed_facilities(practice, as_of)
          patients = seed_patients(practice, users.fetch(:admin), rows.fetch("patients.csv"), as_of)
          visits = seed_visits(practice, users.fetch(:admin), users.fetch(:clinicians), facilities, patients, rows.fetch("visits.csv"), as_of)
          seed_billing(practice, users.fetch(:admin), patients, visits, rows, as_of)
          seed_inventory(practice, users.fetch(:admin), users.fetch(:inventory), rows, as_of)
        end
      end

      def ready?
        practice = Clinic::Practice.find_by(name: PRACTICE_NAME)
        practice.present? &&
          practice.patients.count == 100 &&
          practice.patients.where("reference LIKE ?", "SYNTH_PAT_%").count == 100 &&
          practice.clinician_profiles.where("reference LIKE ?", "SYNTH_PROV_%").count == 2 &&
          practice.staff_members.count == 13 &&
          practice.appointments.count == 220 &&
          practice.encounters.count == 220 &&
          practice.encounters.open.count == CURRENT_FLOW_VISIT_KEYS.length &&
          Clinic::Invoice.where(practice_id: practice.id).count == 220 &&
          Clinic::InvoiceLine.where(practice_id: practice.id).count == 1100 &&
          practice.items.count == 100 &&
          practice.pharmacy_products.count == 100
      end

      private

      def load_rows
        files = %w[
          manifest.csv roles.csv users.csv role_grants.csv patients.csv visits.csv
          invoice_headers.csv invoice_lines.csv payments.csv coverage_versions.csv
          credit_notes.csv refund_events.csv insurance_claims.csv office_items.csv
          pharmacy_products.csv pharmacy_batches.csv inventory_adjustments.csv
        ]
        files.to_h do |file|
          path = DATA_ROOT.join(file)
          raise "Missing bulk dev seed file: #{path}" unless File.file?(path)

          csv = File.read(path).gsub("\r\n", "\n")
          [file, CSV.parse(csv, headers: true).map(&:to_h)]
        end
      end

      def validate_rows!(rows)
        expected = {
          "patients.csv" => 100,
          "visits.csv" => 220,
          "invoice_headers.csv" => 220,
          "invoice_lines.csv" => 1100,
          "office_items.csv" => 100,
          "pharmacy_products.csv" => 100,
          "pharmacy_batches.csv" => 200,
          "inventory_adjustments.csv" => 100
        }
        expected.each do |file, count|
          actual = rows.fetch(file).length
          raise "#{file} must contain #{count} records; found #{actual}. Regenerate the CSV bundle." unless actual == count
        end
        raise "Each invoice must have five line items." unless rows.fetch("invoice_lines.csv").group_by { |row| row.fetch("invoice_key") }.values.all? { |lines| lines.length == 5 }
        raise "The visit distribution must total 220 visits." unless rows.fetch("visits.csv").group_by { |row| row.fetch("patient_key") }.values.map(&:length).sort == ([1] * 20 + [2] * 40 + [3] * 40).sort
      end

      def seed_roles(rows)
        rows.to_h do |row|
          permissions = row.fetch("permissions").split("|").reject(&:blank?)
          role = RoleVersion.find_or_create_by!(role_code: row.fetch("role_code"), version: integer(row.fetch("version")))
          permissions.each do |action_code|
            permission = Permission.find_or_create_by!(action_code: action_code)
            RoleVersionPermission.find_or_create_by!(role_version: role, permission: permission)
          end
          [row.fetch("role_key"), { record: role, permissions: permissions }]
        end
      end

      def seed_users(practice, user_rows, grant_rows, roles, as_of)
        grants_by_user = grant_rows.group_by { |row| row.fetch("user_key") }
        users = {}
        memberships = {}
        user_rows.each do |row|
          user = User.find_or_initialize_by(email_address: row.fetch("email"))
          if user.new_record?
            user.password = if row["password_profile"] == "omni"
              TestAccounts.send(:password_for, "omni")
            else
              "ApplyDev-#{row.fetch('user_key')}-2026!"
            end
            user.created_at = seed_timestamp(as_of, 0, hour: 7)
          end
          user.admin = boolean(row.fetch("admin"))
          user.active = boolean(row.fetch("active"))
          user.save!

          membership = Clinic::Membership.find_or_initialize_by(user: user)
          if membership.persisted? && membership.practice_id != practice.id
            raise "Seed identity collision: #{user.email_address} already belongs to another practice."
          end
          membership.practice = practice
          membership.active = user.active?
          permissions = roles.fetch(row.fetch("role_key")).fetch(:permissions)
          membership.assign_attributes(
            patients_access: permissions.any? { |permission| permission.start_with?("patients.") },
            inventory_access: permissions.any? { |permission| permission.start_with?("inventory.") },
            staff_access: permissions.any? { |permission| permission.start_with?("staff.") },
            inventory_catalog: permissions.include?("inventory.catalog"),
            inventory_receive: permissions.include?("inventory.receive"),
            inventory_adjust: permissions.include?("inventory.adjust"),
            inventory_hold: permissions.include?("inventory.hold"),
            inventory_release: permissions.include?("inventory.release"),
            inventory_count: permissions.include?("inventory.count"),
            inventory_configure: permissions.include?("inventory.configure"),
            inventory_transfer: permissions.include?("inventory.transfer")
          )
          membership.created_at ||= seed_timestamp(as_of, 0, hour: 7)
          membership.save!

          grants_by_user.fetch(row.fetch("user_key")).each do |grant_row|
            role = roles.fetch(grant_row.fetch("role_key")).fetch(:record)
            grant = membership.role_grants.find_or_initialize_by(role_version: role, scope_kind: "practice")
            grant.practice = practice
            grant.effective_from = seed_timestamp(as_of, integer(grant_row.fetch("effective_days_ago")), hour: 7)
            grant.effective_until = nil
            grant.revoked_at = nil
            grant.revision ||= 1
            grant.save!
          end
          users[row.fetch("user_key")] = user
          memberships[row.fetch("user_key")] = membership
        end

        {
          all: users,
          memberships: memberships,
          admin: users.fetch("test_admin"),
          inventory: users.fetch("test_inventory_1"),
          clinicians: users.values_at("test_clinician_1", "test_clinician_2")
        }
      end

      def seed_facilities(practice, as_of)
        sites = %w[MAIN ANNEX].to_h do |code|
          site = practice.sites.find_or_initialize_by(code: code)
          site.timezone_override = TIME_ZONE
          site.created_at ||= seed_timestamp(as_of, 0, hour: 7)
          site.save!
          [code, site]
        end
        rooms = {}
        sites.each_value do |site|
          4.times do |index|
            room = site.rooms.find_or_initialize_by(code: "EXAM-#{index + 1}")
            room.practice = practice
            room.created_at ||= seed_timestamp(as_of, 0, hour: 7)
            room.save!
            rooms[[site.id, room.code]] = room
          end
        end
        department = practice.departments.find_or_initialize_by(code: "PRIMARY-CARE")
        department.created_at ||= seed_timestamp(as_of, 0, hour: 7)
        department.save!
        clinicians = {
          "test_clinician_1" => ["Alex Rowan, NP", "clinician1@test.com"],
          "test_clinician_2" => ["Morgan Ellis, MD", "clinician2@test.com"]
        }.to_h do |key, (display_name, email)|
          user = User.find_by!(email_address: email)
          membership = Clinic::Membership.find_by!(practice: practice, user: user)
          profile = practice.clinician_profiles.find_or_initialize_by(membership_id: membership.id)
          profile.display_name = display_name
          profile.reference = provider_reference(key)
          profile.created_at ||= seed_timestamp(as_of, 0, hour: 7)
          profile.save!
          sites.each_value do |site|
            assignment = profile.assignments.find_or_initialize_by(practice: practice, site: site, department: department)
            assignment.effective_from = seed_timestamp(as_of, 0, hour: 7)
            assignment.created_at ||= seed_timestamp(as_of, 0, hour: 7)
            assignment.save!
          end
          [key, profile]
        end
        visit_types = %w[WELLNESS FOLLOW_UP NEW_CONCERN MEDICATION_REVIEW RESULTS_REVIEW CARE_PLAN].to_h do |code|
          visit_type = practice.visit_types.find_or_initialize_by(code: code)
          visit_type.created_at ||= seed_timestamp(as_of, 0, hour: 7)
          visit_type.save!
          [code, visit_type]
        end
        { sites: sites, rooms: rooms, clinicians: clinicians, visit_types: visit_types }
      end

      def seed_staff_members(practice, rows, as_of)
        titles = {
          "omni_administrator" => "Clinic operations administrator",
          "administrator" => "Clinic administrator",
          "clinician" => "Clinician",
          "staff" => "Clinical staff member",
          "inventory" => "Inventory coordinator",
          "billing" => "Billing specialist",
          "front_desk" => "Front desk coordinator",
          "reader" => "Records coordinator"
        }

        role_occurrences = Hash.new(0)
        rows.each do |row|
          role_key = row.fetch("role_key")
          role_occurrences[role_key] += 1
          job_title = titles.fetch(role_key)
          job_title = "#{job_title} #{role_occurrences.fetch(role_key)}" if role_occurrences.fetch(role_key) > 1
          staff = practice.staff_members.find_or_initialize_by(job_title: job_title)
          staff.display_name = row.fetch("display_name")
          staff.active = boolean(row.fetch("active"))
          staff.created_at ||= seed_timestamp(as_of, 0, hour: 7)
          staff.save!
        end
      end

      def seed_patients(practice, admin, rows, as_of)
        rows.to_h do |row|
          patient = practice.patients.find_or_initialize_by(reference: row.fetch("reference"))
          patient.display_name = row.fetch("display_name")
          patient.created_at ||= seed_timestamp(as_of, integer(row.fetch("created_days_ago")), hour: 8)
          patient.save!
          patient.create_demographics!(practice: practice, date_of_birth: Date.iso8601(row.fetch("date_of_birth")),
            sex: row.fetch("sex"), primary_language: row.fetch("primary_language"),
            interpreter_required: boolean(row.fetch("interpreter_required"))) unless patient.demographics

          effective_from = seed_timestamp(as_of, integer(row.fetch("created_days_ago")), hour: 8)
          patient.contacts.find_or_create_by!(contact_type: "phone", effective_from: effective_from) do |contact|
            contact.practice = practice
            contact.contact_value = row.fetch("phone")
            contact.preferred = row.fetch("preferred_contact") == "phone"
          end
          patient.contacts.find_or_create_by!(contact_type: "email", effective_from: effective_from) do |contact|
            contact.practice = practice
            contact.contact_value = row.fetch("email")
            contact.preferred = row.fetch("preferred_contact") == "email"
          end
          patient.emergency_contacts.find_or_create_by!(effective_from: effective_from) do |contact|
            contact.practice = practice
            contact.name = row.fetch("emergency_name")
            contact.relationship = row.fetch("emergency_relationship")
            contact.phone = row.fetch("emergency_phone")
            contact.permission_to_contact = boolean(row.fetch("emergency_permission"))
          end
          patient.create_communication_preference!(practice: practice,
            preferred_contact_method: row.fetch("preferred_contact"),
            appointment_reminders_consent: boolean(row.fetch("appointment_reminders_consent")),
            general_communications_consent: boolean(row.fetch("general_communications_consent"))) unless patient.communication_preference
          patient.social_histories.find_or_create_by!(effective_from: effective_from) do |history|
            history.practice = practice
            history.tobacco_use = "No use reported"
            history.alcohol_use = "Occasional use reported"
            history.exercise_habits = "Walks #{2 + (patient.id % 4)} days per week"
            history.diet = "Mixed home-prepared diet"
            history.occupation = "Office professional"
            history.living_situation = "Lives independently"
            history.relevant_social_factors = "None recorded"
          end
          patient.patient_memberships.find_or_create_by!(version: 1) do |membership|
            membership.practice = practice
            membership.recorded_by_membership = admin.clinic_membership
            membership.status = row.fetch("membership_status")
            membership.effective_from = effective_from
          end
          [row.fetch("patient_key"), patient]
        end
      end

      def seed_visits(practice, admin, clinicians, facilities, patients, rows, as_of)
        rows.to_h do |row|
          patient = patients.fetch(row.fetch("patient_key"))
          site = facilities.fetch(:sites).fetch(row.fetch("site_code"))
          room = facilities.fetch(:rooms).fetch([site.id, row.fetch("room_code")])
          clinician = facilities.fetch(:clinicians).fetch(row.fetch("clinician_key"))
          visit_type = facilities.fetch(:visit_types).fetch(row.fetch("visit_type_code"))
          starts_at = current_flow_starts_at(as_of, row) || seed_timestamp(as_of, integer(row.fetch("days_ago")), hour: integer(row.fetch("start_hour")), minute: integer(row.fetch("start_minute")))
          ends_at = starts_at + integer(row.fetch("duration_minutes")).minutes
          appointment = practice.appointments.find_by(patient_id: patient.id, starts_at: starts_at)
          appointment ||= Clinic::Scheduling::BookAppointment.call(practice: practice, actor: admin, patient: patient,
            starts_at: starts_at, ends_at: ends_at, site: site, room: room, booked_clinician: clinician, visit_type: visit_type)
          Clinic::Scheduling::TransitionAppointment.call(appointment: appointment, actor: admin, to: "confirmed") if appointment.status == "scheduled"
          encounter = appointment.encounter || Clinic::Scheduling::CreateEncounter.call(practice: practice, actor: admin,
            patient: patient, started_at: starts_at, appointment: appointment, site: site, room: room)
          unless encounter.participants.exists?(membership_id: clinician.membership_id, participation_role: "clinician")
            encounter.participants.create!(practice: practice, patient: patient, membership: clinician.membership,
              participation_role: "clinician", effective_from: starts_at)
          end
          unless current_flow_visit?(row) || encounter.ended_at.present?
            Clinic::Scheduling::CloseEncounter.call(encounter: encounter, actor: admin,
              request_key: uuid("encounter-close:#{row.fetch('visit_key')}"), ended_at: ends_at)
          end
          unless current_flow_visit?(row)
            Clinic::Scheduling::TransitionAppointment.call(appointment: appointment, actor: admin, to: "completed") if appointment.status == "confirmed"
          end
          [row.fetch("visit_key"), { appointment: appointment.reload, encounter: encounter.reload, starts_at: starts_at }]
        end
      end

      def seed_billing(practice, admin, patients, visits, rows, as_of)
        lines_by_invoice = rows.fetch("invoice_lines.csv").group_by { |row| row.fetch("invoice_key") }
        existing_invoice_by_marker = Clinic::InvoiceLine.where(
          practice_id: practice.id,
          description_snapshot: lines_by_invoice.values.map { |lines| lines.first.fetch("description") }
        ).includes(:invoice).to_h { |line| [line.description_snapshot, line.invoice] }
        invoices = {}
        rows.fetch("invoice_headers.csv").each do |row|
          lines = lines_by_invoice.fetch(row.fetch("invoice_key"))
          marker = lines.first.fetch("description")
          invoice = existing_invoice_by_marker[marker]
          unless invoice
            visit = visits.fetch(row.fetch("visit_key"))
            invoice = Clinic::Billing::DraftInvoice.call(practice: practice, actor: admin,
              patient: patients.fetch(row.fetch("patient_key")), currency: row.fetch("currency"),
              lines: lines.map { |line| { quantity: line.fetch("quantity"), unit_amount: line.fetch("unit_amount"), description_snapshot: line.fetch("description") } },
              created_at: visit.fetch(:starts_at) + integer(row.fetch("created_hour")).hours)
          end
          if %w[posted paid partial open void].include?(row.fetch("display_status")) && invoice.status == "draft"
            Clinic::Billing::PostInvoice.call(invoice: invoice, actor: admin)
          end
          invoice.transition_to!("void") if row.fetch("display_status") == "void" && invoice.status == "posted"
          invoices[row.fetch("invoice_key")] = invoice.reload
        end

        rows.fetch("payments.csv").each do |row|
          invoice = invoices.fetch(row.fetch("invoice_key"))
          payment = Clinic::Billing::AllocatePayment.call(practice: practice, actor: admin,
            patient: patients.fetch(row.fetch("patient_key")), invoice: invoice,
            external_event_reference: row.fetch("payment_key"), currency: row.fetch("currency"),
            amount: row.fetch("amount"), payment_amount: row.fetch("amount"),
            created_at: seed_timestamp(as_of, integer(row.fetch("days_ago")), hour: 15))
        end

        rows.fetch("coverage_versions.csv").each do |row|
          patient = patients.fetch(row.fetch("patient_key"))
          coverage = patient.coverage_versions.find_or_initialize_by(version: integer(row.fetch("version")))
          next if coverage.persisted?

          coverage.practice = practice
          coverage.encrypted_coverage_evidence = row.fetch("evidence")
          coverage.created_at ||= seed_timestamp(as_of, integer(row.fetch("days_ago")), hour: 10)
          coverage.save!
        end
        rows.fetch("credit_notes.csv").each do |row|
          invoice = invoices.fetch(row.fetch("invoice_key"))
          credit = invoice.credit_notes.find_or_initialize_by(amount: row.fetch("amount"))
          next if credit.persisted?

          credit.assign_attributes(practice: practice, patient: patients.fetch(row.fetch("patient_key")), currency: row.fetch("currency"))
          credit.created_at ||= seed_timestamp(as_of, integer(row.fetch("days_ago")), hour: 16)
          credit.save!
        end
        rows.fetch("refund_events.csv").each do |row|
          payment = Clinic::PaymentEvent.find_by!(practice: practice, external_event_reference: row.fetch("payment_key"))
          refund = Clinic::RefundEvent.find_or_initialize_by(payment_event: payment, amount: row.fetch("amount"))
          next if refund.persisted?

          refund.assign_attributes(practice: practice, patient: patients.fetch(row.fetch("patient_key")), currency: row.fetch("currency"),
            reason: row.fetch("reason", "Historical refund record"))
          refund.created_at ||= seed_timestamp(as_of, integer(row.fetch("days_ago")), hour: 17)
          refund.save!
        end
        coverage_rows_by_key = rows.fetch("coverage_versions.csv").to_h { |candidate| [candidate.fetch("coverage_key"), candidate] }
        rows.fetch("insurance_claims.csv").each do |row|
          invoice = invoices.fetch(row.fetch("invoice_key"))
          coverage_row = coverage_rows_by_key[row.fetch("coverage_key")]
          raise "Insurance claim coverage does not match its patient." unless coverage_row && coverage_row.fetch("patient_key") == row.fetch("patient_key")
          coverage = patients.fetch(coverage_row.fetch("patient_key")).coverage_versions.find_by!(version: integer(coverage_row.fetch("version")))
          claim = Clinic::InsuranceClaim.find_or_initialize_by(invoice: invoice, coverage_version: coverage)
          next if claim.persisted?

          claim.assign_attributes(practice: practice, patient: patients.fetch(row.fetch("patient_key")))
          claim.created_at ||= seed_timestamp(as_of, integer(row.fetch("days_ago")), hour: 17)
          claim.save!
        end
      end

      def seed_inventory(practice, admin, inventory_actor, rows, as_of)
        suppliers = 20.times.to_h do |index|
          key = "supplier_#{format('%02d', index + 1)}"
          supplier = practice.inventory_suppliers.find_or_initialize_by(name: "Dev Supplier #{format('%02d', index + 1)}")
          supplier.created_at ||= seed_timestamp(as_of, 0, hour: 7)
          supplier.save!
          [key, supplier]
        end
        locations = {
          "Main Pharmacy" => "storage", "North Cabinet" => "storage",
          "Clinic Store" => "storage", "Controlled Cabinet" => "controlled"
        }.to_h do |name, kind|
          location = practice.inventory_locations.find_or_initialize_by(name: name)
          location.kind = kind
          location.created_at ||= seed_timestamp(as_of, 0, hour: 7)
          location.save!
          [name, location]
        end
        rows.fetch("office_items.csv").each do |row|
          item = practice.items.find_or_initialize_by(sku: row.fetch("sku"))
          item.name = row.fetch("name")
          item.reorder_level = integer(row.fetch("reorder_level"))
          item.created_at ||= seed_timestamp(as_of, integer(row.fetch("days_ago")), hour: 7)
          item.save!
          unless item.entries.exists?
            item.adjust!(delta: integer(row.fetch("opening_quantity")), reason: "DEV-SEED opening stock", actor: admin,
              request_key: uuid("office-opening:#{row.fetch('item_key')}"), occurred_at: seed_timestamp(as_of, integer(row.fetch("days_ago")), hour: 7))
          end
        end
        products = rows.fetch("pharmacy_products.csv").to_h do |row|
          product = practice.pharmacy_products.find_or_initialize_by(sku: row.fetch("sku"))
          attributes = {
            name: row.fetch("name"), generic_name: row.fetch("generic_name"), ndc: row.fetch("ndc"), product_ndc: row.fetch("product_ndc"),
            dosage_form: row.fetch("dosage_form"), route: row.fetch("route"), labeler: row.fetch("labeler"), ingredients: row.fetch("ingredients"),
            package_description: row.fetch("package_description"), reorder_point: integer(row.fetch("reorder_point")), active: boolean(row.fetch("active")),
            source: row.fetch("source"), stock_unit: row.fetch("stock_unit"), quantity_scale: integer(row.fetch("quantity_scale")),
            package_size: decimal(row.fetch("package_size")), unit_reference: row.fetch("unit_reference"), dea_schedule: row["dea_schedule"].presence
          }
          if product.new_record?
            product.assign_attributes(attributes)
            product.created_at = seed_timestamp(as_of, integer(row.fetch("days_ago")), hour: 7)
            product.save!
          elsif attributes.any? { |key, value| product.public_send(key) != value }
            product.update_catalog!(attributes, actor: admin)
          end
          [row.fetch("product_key"), product]
        end
        batch_rows = rows.fetch("pharmacy_batches.csv")
        batch_rows.each do |row|
          product = products.fetch(row.fetch("product_key"))
          expires_on = as_of.to_date + integer(row.fetch("expires_in_days")).days
          receipt_time = seed_timestamp(as_of, integer(row.fetch("days_ago")), hour: 7)
          request_key = uuid("receipt:#{row.fetch('batch_key')}")
          unless Clinic::Inventory::Receipt.exists?(practice_id: practice.id, request_key: request_key)
            Clinic::Inventory::Receiving.call(practice: practice, actor: inventory_actor,
              supplier: suppliers.fetch(row.fetch("supplier_key")).name, reason: "DEV-SEED receipt #{row.fetch('batch_key')}",
              request_key: request_key, received_at: receipt_time,
              lines: [{ product_id: product.id, lot_number: row.fetch("lot_number"), location: row.fetch("location"),
                expires_on: expires_on.iso8601, amount: row.fetch("opening_packages"), input_unit: "package", unit_cost: "12.50", currency: "USD" }])
          end
        end
        batches_by_key = batch_rows.to_h do |batch_row|
          batch = Clinic::Inventory::PharmacyBatch.find_by!(practice_id: practice.id,
            lot_number: batch_row.fetch("lot_number"), location: batch_row.fetch("location"))
          [batch_row.fetch("batch_key"), batch]
        end
        rows.fetch("inventory_adjustments.csv").each do |row|
          batch = batches_by_key.fetch(row.fetch("batch_key"))
          request_key = uuid("inventory-adjustment:#{row.fetch('adjustment_key')}")
          unless Clinic::Inventory::PharmacyMovement.exists?(practice_id: practice.id, request_key: request_key)
            batch.move!(kind: row.fetch("kind"), amount: row.fetch("amount"), reason: row.fetch("reason"), actor: inventory_actor,
              request_key: request_key, occurred_at: seed_timestamp(as_of, integer(row.fetch("days_ago")), hour: 14))
          end
        end
      end

      def seed_anchor(value)
        zone = ActiveSupport::TimeZone[TIME_ZONE]
        time = value.respond_to?(:in_time_zone) ? value.in_time_zone(zone) : Time.zone.parse(value.to_s).in_time_zone(zone)
        zone.local(time.year, time.month, time.day, 12)
      end

      def seed_timestamp(as_of, source_day, hour:, minute: 0)
        zone = ActiveSupport::TimeZone[TIME_ZONE]
        date = as_of.in_time_zone(zone).to_date + source_day.to_i.days - (WINDOW_DAYS / 2).days
        zone.local(date.year, date.month, date.day, hour, minute)
      end

      def current_flow_visit?(row)
        CURRENT_FLOW_VISIT_KEYS.include?(row.fetch("visit_key"))
      end

      # Keep a usable current-day board at every seed anchor while the rest of the
      # bundle remains evenly distributed across the centered 90-day window.
      def current_flow_starts_at(as_of, row)
        return unless current_flow_visit?(row)

        index = CURRENT_FLOW_VISIT_KEYS.index(row.fetch("visit_key"))
        minutes_after_midnight = (13 * 60) + (index * 45)
        hour = minutes_after_midnight / 60
        minute = minutes_after_midnight % 60
        zone = ActiveSupport::TimeZone[TIME_ZONE]
        date = as_of.in_time_zone(zone).to_date
        zone.local(date.year, date.month, date.day, hour, minute)
      end

      def provider_reference(key)
        "SYNTH_PROV_#{key.delete_prefix('test_clinician_').to_i.to_s.rjust(3, '0')}"
      end

      def boolean(value)
        value.to_s == "true"
      end

      def integer(value)
        Integer(value.to_s, 10)
      end

      def decimal(value)
        BigDecimal(value.to_s)
      end

      def uuid(value)
        hex = Digest::MD5.hexdigest("apply:bulk-dev-seed:v1:#{value}")
        [hex[0, 8], hex[8, 4], hex[12, 4], hex[16, 4], hex[20, 12]].join("-")
      end
    end
  end
end
