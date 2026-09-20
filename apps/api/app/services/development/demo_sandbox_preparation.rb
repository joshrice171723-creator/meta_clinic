module Development
  class DemoSandboxPreparation
    PATIENTS = [
      { name: "Casey Brooks", reference: "SANDBOX-PAT-001", offset: 0 },
      { name: "Riley Chen", reference: "SANDBOX-PAT-002", offset: 1 },
      { name: "Avery Diaz", reference: "SANDBOX-PAT-003", offset: 2 },
      { name: "Morgan Ellis", reference: "SANDBOX-PAT-004", offset: 0 },
      { name: "Jordan Flores", reference: "SANDBOX-PAT-005", offset: 4 },
      { name: "Taylor Grant", reference: "SANDBOX-PAT-006", offset: 6 },
      { name: "Quinn Harper", reference: "SANDBOX-PAT-007", offset: 8 }
    ].freeze

    INVENTORY = [
      { name: "Alcohol prep pads", sku: "SANDBOX-PREP-PADS", supplier: "Clinic Supply Co.",
        location: "Supply cabinet", lot: "SBX-PREP-001", quantity: 300, package_size: 100 },
      { name: "Sterile syringes", sku: "SANDBOX-SYRINGES", supplier: "Clinic Supply Co.",
        location: "Supply cabinet", lot: "SBX-SYR-002", quantity: 200, package_size: 50 },
      { name: "Exam table paper", sku: "SANDBOX-TABLE-PAPER", supplier: "Front Office Goods",
        location: "Front desk supply", lot: "SBX-PAPER-003", quantity: 120, package_size: 12 },
      { name: "Cold packs", sku: "SANDBOX-COLD-PACK", supplier: "Northside Medical Supply",
        location: "Northside supply", lot: "SBX-COLD-004", quantity: 80, package_size: 20 }
    ].freeze

    class << self
      def prepare!(run)
        main_site = run.practice.sites.first!
        annex_site = prepare_annex!(run)
        patients = prepare_patients!(run)
        prepare_appointments!(run, patients:, sites: [ main_site, annex_site ])
        prepare_inventory!(run, main_site:, annex_site:)
      end

      private

      def prepare_annex!(run)
        practice = run.practice
        site = practice.sites.find_or_create_by!(code: "SANDBOX-NORTH") do |record|
          record.name = "Northside Clinic"
          record.status = "active"
          record.address_line1 = "240 Northside Avenue"
          record.city = "Austin"
          record.state = "TX"
          record.postal_code = "78702"
          record.country = "US"
        end
        site.rooms.find_or_create_by!(practice:, code: "EXAM-1")
        site.rooms.find_or_create_by!(practice:, code: "EXAM-2")

        clinician = practice.clinician_profiles.first!
        department = practice.departments.first!
        clinician.assignments.find_or_create_by!(practice:, site:, department:) do |assignment|
          assignment.effective_from = Current.business_time
        end
        (0..6).each do |day|
          site.operating_hours.find_or_create_by!(practice:, day_of_week: day) do |hours|
            hours.open_time = "09:00"
            hours.close_time = "17:00"
            hours.closed = false
          end
          Clinic::Scheduling::CapacityRule.find_or_create_by!(practice:, site:, clinician:, kind: "weekly", weekday: day) do |rule|
            rule.start_minute = 540
            rule.end_minute = 1020
          end
        end
        site
      end

      def prepare_patients!(run)
        PATIENTS.map do |fixture|
          patient = run.practice.patients.find_or_create_by!(reference: fixture.fetch(:reference)) do |record|
            record.display_name = fixture.fetch(:name)
          end
          patient.create_demographics!(practice: run.practice, date_of_birth: Date.new(1980 + PATIENTS.index(fixture), 1, 1),
            sex: "unknown", primary_language: "English", interpreter_required: false) unless patient.demographics
          [ fixture, patient ]
        end
      end

      def prepare_appointments!(run, patients:, sites:)
        practice = run.practice
        clinician = practice.clinician_profiles.first!
        visit_type = practice.visit_types.first!
        patients.each_with_index do |(fixture, patient), index|
          site = sites[index % sites.length]
          starts_at = appointment_start(practice:, clinician:, site:, offset: fixture.fetch(:offset), index:)
          appointment = practice.appointments.find_by(patient:, starts_at:) ||
            Clinic::Scheduling::BookAppointment.call(
              practice:, actor: run.operator_user, patient:, site:, room: site.rooms.order(:code).first!,
              booked_clinician: clinician, visit_type:, starts_at:, ends_at: starts_at + 30.minutes,
              reason: "Synthetic sandbox follow-up"
            )
          Clinic::Scheduling::TransitionAppointment.call(appointment:, actor: run.operator_user, to: "confirmed") if appointment.status == "scheduled"
        end
      end

      def appointment_start(practice:, clinician:, site:, offset:, index:)
        zone = ActiveSupport::TimeZone[site.timezone_override.presence || site.practice.timezone] || Time.zone
        date = Current.business_time.in_time_zone(zone).to_date + offset
        starts_at = zone.local(date.year, date.month, date.day, 13 + (index % 3), 0, 0)
        conflicts = practice.appointments.where(booked_clinician: clinician)
          .where("starts_at < ? AND ends_at > ?", starts_at + 30.minutes, starts_at)
        while conflicts.exists?
          starts_at += 30.minutes
          conflicts = practice.appointments.where(booked_clinician: clinician)
            .where("starts_at < ? AND ends_at > ?", starts_at + 30.minutes, starts_at)
        end
        starts_at
      end

      def prepare_inventory!(run, main_site:, annex_site:)
        locations = {
          "Supply cabinet" => main_site,
          "Receiving staging" => main_site,
          "Front desk supply" => main_site,
          "Northside supply" => annex_site
        }.to_h do |name, site|
          location = run.practice.inventory_locations.find_or_create_by!(site:, name:)
          location.update!(kind: "storage", status: "active")
          [ name, location ]
        end

        INVENTORY.each_with_index do |fixture, index|
          supplier = run.practice.inventory_suppliers.find_or_create_by!(name: fixture.fetch(:supplier))
          product = run.practice.pharmacy_products.find_or_initialize_by(sku: fixture.fetch(:sku))
          package_count = fixture.fetch(:quantity) / fixture.fetch(:package_size)
          product.assign_attributes(
            name: fixture.fetch(:name), category: "clinical_supply", source: "synthetic", stock_unit: "each",
            quantity_scale: 0, package_size: fixture.fetch(:package_size), unit_reference: "each",
            package_description: "Synthetic sandbox package", reorder_point: fixture.fetch(:package_size),
            active: true, preferred_supplier: supplier
          )
          product.save!
          location = locations.fetch(fixture.fetch(:location))
          order = run.practice.inventory_purchase_orders.create!(
            actor: run.operator_user, supplier:, receiving_site: location.site,
            number: "SANDBOX-PO-#{index + 1}", status: "sent", destination: location.name,
            reason: "Synthetic sandbox replenishment", request_key: SecureRandom.uuid,
            payload_digest: "sandbox-order-#{index + 1}", version: 1,
            subtotal: 40, tax: 0, shipping: 0, total: 40
          )
          line = order.lines.create!(
            practice: run.practice, product:, product_name: product.name, stock_unit: product.stock_unit,
            input_unit: "package", ordered_quantity: package_count, received_quantity: 0,
            conversion_factor: fixture.fetch(:package_size), unit_price: 20, currency: "USD"
          )
          shipment = order.shipments.create!(
            practice: run.practice, actor: run.operator_user, reference: "SANDBOX-SHIP-#{index + 1}",
            supplier_reference: "SBX-#{index + 1}", status: "delivered", package_count: package_count,
            expected_units: fixture.fetch(:quantity), delivered_at: Current.business_time - (index + 1).days,
            request_key: SecureRandom.uuid, payload_digest: "sandbox-shipment-#{index + 1}"
          )
          shipment.shipment_lines.create!(practice: run.practice, purchase_order_line: line, expected_packages: package_count)
          Clinic::Inventory::Receiving.call(
            practice: run.practice, actor: run.operator_user, supplier: supplier.name, purchase_order: order,
            shipment:, status: "received", reason: "Synthetic sandbox inventory receipt", request_key: SecureRandom.uuid,
            lines: [ {
              product_id: product.id, lot_number: fixture.fetch(:lot), location_id: location.id, location: location.name,
              expires_on: "2099-01-01", amount: package_count, input_unit: "package",
              purchase_order_line_id: line.id
            } ]
          )
        end
      end
    end
  end
end
