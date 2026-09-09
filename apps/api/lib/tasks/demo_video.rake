require "digest"
require "json"

module Development
  class DemoVideo
    DATABASE_NAME = "apply_video_development".freeze
    CLINIC_NAME = "Cedar Grove Family Care".freeze
    BUSINESS_DATE = Date.new(2026, 9, 9)

    PATIENTS = [
      { name: "Avery Morgan", reference: "CGFC-1001", date_of_birth: Date.new(1988, 4, 18), sex: "female" },
      { name: "Jordan Lee", reference: "CGFC-1002", date_of_birth: Date.new(1976, 11, 2), sex: "male" },
      { name: "Sophia Bennett", reference: "CGFC-1003", date_of_birth: Date.new(1994, 7, 23), sex: "female" },
      { name: "Noah Campbell", reference: "CGFC-1004", date_of_birth: Date.new(1969, 1, 14), sex: "male" }
    ].freeze

    PRODUCTS = [
      { sku: "CG-VAX-FLU", name: "Influenza Vaccine, Quadrivalent 0.5 mL", generic_name: "Influenza vaccine",
        ndc: "70000000011", stock_unit: "vial", package_size: 10, unit_reference: "10 single-dose vials",
        package_description: "Carton of 10 single-dose vials", category: "medication", reorder_point: 25,
        opening: 18, lot: "FLU-2708-A", expires_on: Date.new(2027, 8, 31), price: "248.00" },
      { sku: "CG-LAB-A1C", name: "Point-of-Care A1c Test Kit", generic_name: nil,
        ndc: "70000000028", stock_unit: "each", package_size: 10, unit_reference: "10 tests",
        package_description: "Kit of 10 tests", category: "lab_supply", reorder_point: 12,
        opening: 8, lot: "A1C-2706-B", expires_on: Date.new(2027, 6, 30), price: "92.50" },
      { sku: "CG-SUP-GLOVE-M", name: "Nitrile Exam Gloves, Medium", generic_name: nil,
        ndc: "70000000035", stock_unit: "each", package_size: 100, unit_reference: "100 gloves",
        package_description: "Box of 100 gloves", category: "clinical_supply", reorder_point: 500,
        opening: 650, lot: "GLV-2812-C", expires_on: Date.new(2028, 12, 31), price: "8.75" },
      { sku: "CG-SUP-GAUZE", name: "Sterile Gauze Pads, 4 x 4 in", generic_name: nil,
        ndc: "70000000042", stock_unit: "each", package_size: 200, unit_reference: "200 pads",
        package_description: "Case of 200 sterile pads", category: "clinical_supply", reorder_point: 300,
        opening: 240, lot: "GAU-2903-D", expires_on: Date.new(2029, 3, 31), price: "14.20" }
    ].freeze

    class << self
      def prepare!
        ensure_local!
        accounts, practice = ApplicationRecord.transaction do
          ApplicationRecord.connection.execute("SELECT pg_advisory_xact_lock(hashtextextended('apply:demo-video:v1', 0))")
          prepare_accounts!
        end
        result = nil
        ApplicationRecord.transaction do
          ApplicationRecord.connection.execute("SELECT pg_advisory_xact_lock(hashtextextended('apply:demo-video:v1', 0))")
          accounts = accounts.transform_values(&:reload)
          practice.reload
          site, room = prepare_facility!(practice)
          patients = prepare_patients!(practice)
          portal_identity = prepare_patient_identity!(practice, patients.fetch("CGFC-1001"))
          clinician = prepare_clinician!(practice, accounts.fetch("clinician"), site)
          appointments = prepare_schedule!(practice, accounts.fetch("clinic-administrator"), patients, site, room, clinician,
            portal_identity)
          plans = prepare_memberships!(practice, accounts.fetch("clinic-administrator"))
          billing_services = prepare_billing_catalog!(practice)
          invoice = prepare_invoice!(practice, accounts.fetch("clinic-administrator"), patients.fetch("CGFC-1001"),
            billing_services.find { |service| service.code == "OFFICE-VISIT" })
          inventory = prepare_inventory!(practice, accounts.fetch("inventory-coordinator"), site)

          result = {
            clinic: { id: practice.id, name: practice.name },
            patient: { id: patients.fetch("CGFC-1001").id, name: "Avery Morgan",
              account_profile: "patient-#{portal_identity.user_id}", identity_id: portal_identity.id },
            employee_profiles: accounts.transform_values { |user| "employee-#{user.id}" },
            appointment_ids: appointments.transform_values(&:id),
            encounter_id: appointments.fetch(:avery_active).reload.encounter.id,
            membership_plans: plans.map { |plan| { id: plan.id, name: plan.name, state: plan.published_version_id ? "published" : "draft" } },
            billing_service_ids: billing_services.map(&:id),
            posted_invoice_id: invoice.id,
            inventory: inventory,
            routes: %w[/clinic /clinic/scheduling /clinic/patients /clinic/subscriptions /clinic/billing /clinic/inventory /clinic/inventory/replenishment /clinic/inventory/purchasing /patient-portal]
          }
        end
        result
      end

      private

      def ensure_local!
        actual = ActiveRecord::Base.connection_db_config.database
        allowed = Rails.env.development? && ENV["APP_DEVELOPMENT_LOGIN"] == "1" &&
          ENV["APPLY_DEMO_VIDEO"] == "1" && actual == DATABASE_NAME
        return if allowed

        raise "Demo video setup is limited to explicitly enabled local development database #{DATABASE_NAME.inspect}."
      end

      def prepare_accounts!
        practice = Clinic::Practice.find_by(name: CLINIC_NAME)
        if practice
          accounts = Development::RoleAccounts::ACCOUNTS.to_h do |code, definition|
            user = User.find_by!(email_address: definition.fetch(:email))
            raise "Named employee account is assigned outside Cedar Grove." unless user.clinic_membership&.practice_id == practice.id
            [ code, user ]
          end
          return [ accounts, practice ]
        end

        accounts = Development::RoleAccounts.prepare!
        practice = accounts.fetch("clinic-administrator").clinic_membership.practice
        unless practice.name == Development::RoleAccounts::PRACTICE_NAME
          raise "Refusing to rename an unexpected clinic."
        end
        practice.update!(name: CLINIC_NAME, timezone: "America/Chicago")
        [ accounts, practice ]
      end

      def prepare_facility!(practice)
        site = practice.sites.find_or_create_by!(code: "MAIN") do |record|
          record.assign_attributes(name: "Cedar Grove Main Clinic", status: "active", timezone_override: "America/Chicago",
            address_line1: "240 Cedar Grove Lane", city: "Sherman", state: "TX", postal_code: "75090", country: "US",
            phone: "903-555-0142", contact_name: "Front Desk", contact_email: "front-desk@cedargrove.example.invalid")
        end
        (0..6).each do |day|
          site.operating_hours.find_or_create_by!(practice: practice, day_of_week: day) do |hours|
            if day.between?(1, 5)
              hours.assign_attributes(closed: false, open_time: "08:00", close_time: "17:00")
            else
              hours.closed = true
            end
          end
        end
        room = practice.rooms.find_or_create_by!(site: site, code: "EXAM-2")
        [ site, room ]
      end

      def prepare_patients!(practice)
        PATIENTS.to_h do |definition|
          patient = practice.patients.find_or_create_by!(reference: definition.fetch(:reference)) do |record|
            record.display_name = definition.fetch(:name)
          end
          patient.create_demographics!(practice: practice, date_of_birth: definition.fetch(:date_of_birth),
            sex: definition.fetch(:sex), primary_language: "English", interpreter_required: false) unless patient.demographics
          [ definition.fetch(:reference), patient ]
        end
      end

      def prepare_patient_identity!(practice, patient)
        email = Development::TestAccounts::PROFILES.fetch("patient").fetch(:email)
        user = User.find_or_initialize_by(email_address: email)
        if user.new_record?
          user.assign_attributes(admin: false, active: true,
            password: Development::TestAccounts.send(:password_for, "patient"))
          user.save!
        elsif !user.active? || user.admin? || !user.authenticate(Development::TestAccounts.send(:password_for, "patient"))
          raise Development::TestAccounts::Unavailable, "The reserved patient account conflicts with an existing identity."
        end

        identity = Clinic::PatientPortal::Identity.find_or_initialize_by(user: user)
        if identity.persisted? && (identity.practice_id != practice.id || identity.patient_id != patient.id)
          raise Development::TestAccounts::Unavailable, "The reserved patient account is assigned outside Cedar Grove."
        end
        identity.assign_attributes(practice: practice, patient: patient, status: :active,
          invited_at: identity.invited_at || Time.current, activated_at: identity.activated_at || Time.current,
          revoked_at: nil, accepted_terms_version: Clinic::PatientPortal::Identity::TERMS_VERSION,
          accepted_terms_at: identity.accepted_terms_at || Time.current)
        identity.save!
        identity
      end

      def prepare_clinician!(practice, clinician_user, site)
        membership = clinician_user.clinic_membership
        profile = practice.clinician_profiles.find_or_create_by!(membership: membership) do |record|
          record.assign_attributes(display_name: "Dr. Maya Patel", reference: "CGFC-CLIN-01")
        end
        department = practice.departments.find_or_create_by!(code: "PRIMARY-CARE")
        profile.assignments.find_or_create_by!(practice: practice, site: site, department: department) do |assignment|
          assignment.effective_from = Time.zone.parse("2026-01-01 08:00")
        end
        profile
      end

      def prepare_schedule!(practice, actor, patients, site, room, clinician, portal_identity)
        visit_types = {
          wellness: practice.visit_types.find_or_create_by!(code: "ANNUAL-WELLNESS"),
          follow_up: practice.visit_types.find_or_create_by!(code: "PRIMARY-CARE-FOLLOW-UP"),
          same_day: practice.visit_types.find_or_create_by!(code: "SAME-DAY-VISIT")
        }
        zone = Time.find_zone!(practice.timezone)
        specs = {
          avery_active: [ patients.fetch("CGFC-1001"), zone.local(2026, 9, 9, 9, 30), 45.minutes, visit_types.fetch(:follow_up) ],
          jordan: [ patients.fetch("CGFC-1002"), zone.local(2026, 9, 9, 11, 0), 30.minutes, visit_types.fetch(:same_day) ],
          sophia: [ patients.fetch("CGFC-1003"), zone.local(2026, 9, 9, 13, 30), 60.minutes, visit_types.fetch(:wellness) ],
          noah: [ patients.fetch("CGFC-1004"), zone.local(2026, 9, 10, 10, 0), 30.minutes, visit_types.fetch(:follow_up) ]
        }
        appointments = specs.to_h do |key, (patient, starts_at, duration, visit_type)|
          appointment = Clinic::Scheduling::BookAppointment.call(practice: practice, actor: actor, patient: patient,
            starts_at: starts_at, ends_at: starts_at + duration, site: site, room: room,
            booked_clinician: clinician, visit_type: visit_type, visit_modality: "in_person",
            request_key: "demo-video-appointment-#{key}-v1")
          [ key, appointment ]
        end
        %i[avery_active jordan sophia].each do |key|
          appointment = appointments.fetch(key)
          Clinic::Scheduling::TransitionAppointment.call(appointment: appointment, actor: actor, to: "confirmed") if appointment.status == "scheduled"
        end
        avery = appointments.fetch(:avery_active)
        unless Clinic::PatientPortal::PrevisitNotes.latest(avery)
          Clinic::PatientPortal::PrevisitNotes.submit(practice: practice, patient: avery.patient,
            appointment: avery, actor: portal_identity.user, identity: portal_identity, omni_preview: false,
            text: "I have been more tired in the afternoons and would like to review my sleep routine and recent home blood-pressure readings.",
            expected_version: 0, request_key: "demo-video-avery-previsit-v1",
            submitted_at: zone.local(2026, 9, 9, 8, 45))
        end
        Clinic::Scheduling::CreateEncounter.call(practice: practice, actor: actor, patient: avery.patient,
          appointment: avery, started_at: zone.local(2026, 9, 9, 9, 34)) unless avery.encounter
        appointments
      end

      def prepare_memberships!(practice, actor)
        family = Clinic::Care::SubscriptionFamily.find_or_create_by!(practice: practice, name: "Primary Care Memberships") do |record|
          record.assign_attributes(description: "Straightforward primary care access with transparent monthly options.", display_order: 1)
        end
        unless family.published_snapshot
          Clinic::Care::SubscriptionCatalog.save(practice: practice, actor: actor, kind: "family", id: family.id,
            attributes: { "lock_version" => family.lock_version, "publish" => true })
        end
        services = {
          visits: service_option(practice, "Primary care visits", "Scheduled in-person primary care visits."),
          messaging: service_option(practice, "Care team messaging", "Secure non-emergency messages with the care team."),
          planning: service_option(practice, "Annual care planning", "A yearly visit focused on goals and preventive care."),
          coaching: service_option(practice, "Health coaching", "A focused session for practical health goals.")
        }
        definitions = [
          [ "Cedar Essential", "89.00", true, [ component(services[:visits], 2, "term"), component(services[:messaging], 1, "month") ] ],
          [ "Cedar Complete", "149.00", true, [ component(services[:visits], 1, "month"), component(services[:messaging], 1, "month"), component(services[:planning], 1, "term") ] ],
          [ "Cedar Plus", "219.00", false, [ component(services[:visits], 2, "month"), component(services[:messaging], 1, "month"), component(services[:planning], 1, "term"), component(services[:coaching], 1, "month") ] ]
        ]
        definitions.map do |name, amount, publish, components|
          package = Clinic::Care::SubscriptionPackage.find_or_initialize_by(practice: practice, family: family, name: name)
          if package.new_record?
            package.draft = { description: "#{name} supports consistent primary care access.", amount: amount, currency: "USD",
              duration: 1, duration_unit: "months", renewal: "manual", cancellation: "end_of_term",
              refund_policy: "manual_review", terms: "One month of #{name}. Renewal is manual; services are scheduled through the clinic and refunds require clinic review.",
              max_per_patient: 1, eligibility_review: false, components: components }
            package.save!
          end
          if publish && package.published_version_id.nil?
            Clinic::Care::SubscriptionCatalog.publish(practice: practice, actor: actor, id: package.id,
              request_key: "demo-video-publish-#{name.parameterize}-v1", lock_version: package.lock_version)
          end
          package.reload
        end
      end

      def service_option(practice, name, description)
        Clinic::Care::ServiceOption.find_or_create_by!(practice: practice, name: name) { |record| record.description = description }
      end

      def component(service, quantity, frequency)
        { service_id: service.id, mode: "included", group: "", min: 0, max: 100, quantity: quantity,
          frequency: frequency, price_adjustment: "0", eligibility_review: false }
      end

      def prepare_billing_catalog!(practice)
        [
          [ "OFFICE-VISIT", "Primary care office visit", "Standard in-person evaluation and management visit.", "125.00" ],
          [ "WELLNESS", "Annual wellness visit", "Preventive care planning visit.", "175.00" ],
          [ "CARE-COORD", "Care coordination", "Care-plan and referral coordination.", "45.00" ],
          [ "LAB-DRAW", "Laboratory specimen collection", "In-clinic specimen collection service.", "30.00" ]
        ].map do |code, name, description, amount|
          practice.billing_services.find_or_create_by!(code: code) do |service|
            service.assign_attributes(name: name, description: description, unit_amount: amount, currency: "USD", active: true)
          end
        end
      end

      def prepare_invoice!(practice, actor, patient, service)
        invoice = Clinic::Billing::DraftInvoice.call(practice: practice, actor: actor, patient: patient,
          currency: "USD", request_key: "demo-video-avery-office-visit-invoice-v1",
          created_at: Time.find_zone!(practice.timezone).local(2026, 9, 9, 9, 0),
          lines: [ { quantity: "1", billing_service_id: service.id, service_lock_version: service.lock_version } ])
        if invoice.status == "draft"
          invoice = Clinic::Billing::PostInvoice.call(invoice: invoice, actor: actor,
            request_key: "demo-video-avery-office-visit-post-v1")
        end
        invoice
      end

      def prepare_inventory!(practice, actor, site)
        supplier = practice.inventory_suppliers.find_or_create_by!(name: "Prairie Medical Supply")
        stockroom = practice.inventory_locations.find_or_create_by!(name: "Main Supply Room") do |location|
          location.assign_attributes(kind: "storage", site: site, address_line1: site.address_line1,
            city: site.city, state: site.state, postal_code: site.postal_code, country: site.country)
        end
        products = PRODUCTS.to_h do |definition|
          product = practice.pharmacy_products.find_or_create_by!(sku: definition.fetch(:sku)) do |record|
            record.assign_attributes(name: definition.fetch(:name), generic_name: definition[:generic_name], ndc: definition.fetch(:ndc),
              dosage_form: definition.fetch(:category) == "medication" ? "Injection" : nil,
              route: definition.fetch(:category) == "medication" ? "Intramuscular" : nil,
              labeler: "Prairie Medical Supply", ingredients: definition[:generic_name],
              package_description: definition.fetch(:package_description), source: "manual",
              reorder_point: definition.fetch(:reorder_point), active: true, stock_unit: definition.fetch(:stock_unit),
              quantity_scale: 0, package_size: definition.fetch(:package_size), unit_reference: definition.fetch(:unit_reference),
              category: definition.fetch(:category), preferred_supplier: supplier)
          end
          offer = supplier.supplier_products.find_or_create_by!(practice: practice, supplier_sku: "PMS-#{definition.fetch(:sku)}") do |record|
            record.assign_attributes(product: product, ndc: definition.fetch(:ndc), description: definition.fetch(:package_description),
              ordering_unit: "package", currency: "USD", contract_status: "active",
              package_quantity: definition.fetch(:package_size), wholesale_unit_cost: definition.fetch(:price),
              available: true, lead_time_days: 2, effective_date: BUSINESS_DATE - 30.days, imported_at: Time.current)
          end
          Clinic::Inventory::Receiving.call(practice: practice, actor: actor, supplier: supplier.name,
            reason: "Opening stock count", request_key: request_uuid("opening-#{definition.fetch(:sku).downcase}-v1"),
            received_at: Time.find_zone!(practice.timezone).local(2026, 9, 8, 15, 0), lines: [ {
              product_id: product.id, lot_number: definition.fetch(:lot), location_id: stockroom.id,
              expires_on: definition.fetch(:expires_on).iso8601, amount: definition.fetch(:opening).to_s,
              input_unit: definition.fetch(:stock_unit), unit_cost: (BigDecimal(definition.fetch(:price)) / definition.fetch(:package_size)).to_s("F"), currency: "USD"
            } ])
          [ definition.fetch(:sku), { product: product, offer: offer, definition: definition } ]
        end

        draft = prepare_order!(practice, actor, supplier, site, products.fetch("CG-LAB-A1C"),
          number: "PO-CG-2026-1042", packages: 4, delivered: false)
        delivered = prepare_order!(practice, actor, supplier, site, products.fetch("CG-SUP-GLOVE-M"),
          number: "PO-CG-2026-1038", packages: 2, delivered: true)
        { product_ids: products.transform_values { |entry| entry.fetch(:product).id }, draft_order_id: draft.id,
          delivered_order_id: delivered.id, delivered_shipment_id: delivered.shipments.first&.id }
      end

      def prepare_order!(practice, actor, supplier, site, entry, number:, packages:, delivered:)
        product = entry.fetch(:product)
        offer = entry.fetch(:offer)
        total = BigDecimal(packages.to_s) * offer.wholesale_unit_cost
        order = practice.inventory_purchase_orders.find_or_initialize_by(number: number)
        if order.new_record?
          digest = Digest::SHA256.hexdigest(JSON.generate(number: number, product_id: product.id, packages: packages))
          order.assign_attributes(actor: actor, supplier: supplier, status: "draft", destination: site.name,
            destination_address: site.formatted_address, receiving_site: site, reason: "Routine stock replenishment",
            request_key: request_uuid("order-#{number.downcase}-v1"), payload_digest: digest, version: 1,
            subtotal: total, tax: 0, shipping: 0, total: total, source_kind: "manual", currency: "USD")
          order.save!
          order.lines.create!(practice: practice, product: product, product_name: product.name, stock_unit: product.stock_unit,
            input_unit: "package", ordered_quantity: packages, received_quantity: 0, conversion_factor: product.package_size,
            unit_price: offer.wholesale_unit_cost, currency: "USD", supplier_product: offer,
            supplier_sku: offer.supplier_sku, ordered_package_quantity: packages, price_snapshot_at: Time.current,
            price_snapshot_digest: Digest::SHA256.hexdigest("#{offer.id}:#{offer.wholesale_unit_cost}:#{packages}"))
        end
        return order unless delivered

        { "draft" => "submitted", "submitted" => "approved", "approved" => "sent" }.each do |from, target|
          if order.status == from
            order.transition!(to: target, actor: actor, reason: "Approved for Cedar Grove delivery",
              request_key: request_uuid("order-#{number.downcase}-#{target}-v1"))
            order.reload
          end
        end
        line = order.lines.sole
        shipment = order.shipments.find_or_create_by!(reference: "SHIP-#{number}") do |record|
          record.assign_attributes(practice: practice, actor: actor, supplier_reference: "PMS-DELIVERY-1038",
            status: "delivered", package_count: packages, expected_units: packages * line.conversion_factor,
            delivered_at: Time.find_zone!(practice.timezone).local(2026, 9, 9, 8, 20),
            request_key: request_uuid("shipment-#{number.downcase}-v1"),
            payload_digest: Digest::SHA256.hexdigest("#{number}:shipment:#{packages}"))
        end
        shipment.shipment_lines.find_or_create_by!(practice: practice, purchase_order_line: line) do |allocation|
          allocation.expected_packages = packages
        end
        order.reload
      end

      def request_uuid(label)
        hex = Digest::SHA256.hexdigest("apply-demo-video:#{label}").first(32)
        [ hex.first(8), hex[8, 4], hex[12, 4], hex[16, 4], hex.last(12) ].join("-")
      end
    end
  end
end

namespace :demo_video do
  desc "Prepare the isolated Cedar Grove walkthrough database"
  task prepare: :environment do
    puts JSON.pretty_generate(Development::DemoVideo.prepare!)
  end
end
