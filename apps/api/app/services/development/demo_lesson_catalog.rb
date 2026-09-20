require "digest"
require "securerandom"

module Development
  class DemoLessonCatalog
    CORE_DEFINITIONS = [
      { id: "clinic_setup", title: "Finish clinic setup", description: "Review the prepared clinic profile and finalize it.", role: "administrator",
        prepared: [ "Clinic profile", "Active facility", "Visit types" ] },
      { id: "membership_publish", title: "Publish a membership", description: "Create and publish a membership offer for the prepared clinic.", role: "administrator",
        prepared: [ "Finalized clinic", "Membership storefront", "Service catalog" ] },
      { id: "patient_enroll", title: "Enroll a patient", description: "Choose the published offer and create the fictional patient's membership account.", role: "patient",
        prepared: [ "Published membership", "Patient storefront", "Fictional patient identity" ] },
      { id: "membership_payment", title: "Accept simulated payment", description: "Complete the fictional patient's local payment simulation.", role: "patient",
        prepared: [ "Patient account", "Pending checkout", "Local payment simulator" ] },
      { id: "appointment_schedule", title: "Schedule an appointment", description: "Book the prepared patient into an available clinic slot.", role: "front_desk",
        prepared: [ "Paid patient", "Clinician", "Room and capacity" ] },
      { id: "appointment_reschedule", title: "Reschedule an appointment", description: "Move the prepared appointment to a different available time.", role: "front_desk",
        prepared: [ "Paid patient", "Scheduled appointment", "Open capacity" ] },
      { id: "appointment_cancel", title: "Cancel an appointment", description: "Cancel the prepared appointment and confirm the local-only message warning.", role: "front_desk",
        prepared: [ "Paid patient", "Scheduled appointment" ] },
      { id: "patient_check_in", title: "Check in a patient", description: "Start the prepared patient's visit from the front desk.", role: "front_desk",
        prepared: [ "Paid patient", "Today's appointment", "Visit room" ] },
      { id: "visit_save", title: "Save a visit note", description: "Document and save a SOAP note in the prepared open visit.", role: "clinical_team",
        prepared: [ "Checked-in patient", "Open encounter", "SOAP note template" ] },
      { id: "visit_complete", title: "Complete a visit", description: "Review the prepared visit evidence and complete the encounter.", role: "clinical_team",
        prepared: [ "Open encounter", "Signed instructions", "Follow-up disposition" ] },
      { id: "inventory_product_create", title: "Create a product", description: "Add a new fictional product to the inventory catalog.", role: "inventory",
        prepared: [ "Configured inventory", "Product catalog" ] },
      { id: "inventory_supplier_create", title: "Create a supplier", description: "Add a fictional supplier to the clinic directory.", role: "inventory",
        prepared: [ "Configured inventory", "Supplier directory" ] },
      { id: "inventory_location_create", title: "Create a location", description: "Add an active stock location at the prepared facility.", role: "inventory",
        prepared: [ "Configured inventory", "Active facility" ] },
      { id: "inventory_purchase_order_create", title: "Create a purchase order", description: "Create a fictional purchase order for the prepared product.", role: "inventory",
        prepared: [ "Product", "Supplier", "Shipping destination" ] },
      { id: "inventory_shipment_record", title: "Record a shipment", description: "Record a delivered shipment against the prepared sent order.", role: "inventory",
        prepared: [ "Sent purchase order", "Open order line", "Supplier" ] },
      { id: "inventory_receive", title: "Receive inventory", description: "Receive the prepared fictional shipment into the supply cabinet.", role: "inventory",
        prepared: [ "Delivered shipment", "Purchase order", "Stock location" ] },
      { id: "inventory_count", title: "Complete a stock count", description: "Count, reconcile, and complete the prepared location's inventory session.", role: "inventory",
        prepared: [ "On-hand stock", "Supply cabinet", "Count workspace" ] },
      { id: "inventory_adjust", title: "Adjust stock", description: "Record a reasoned stock adjustment for the prepared lot.", role: "inventory",
        prepared: [ "On-hand lot", "Supply cabinet", "Movement ledger" ] },
      { id: "inventory_transfer", title: "Transfer stock", description: "Move part of the prepared lot to the second stock location.", role: "inventory",
        prepared: [ "On-hand lot", "Source location", "Destination location" ] },
      { id: "inventory_recall", title: "Open a recall", description: "Open a fictional recall case for the prepared lot.", role: "inventory",
        prepared: [ "On-hand lot", "Recall workspace", "Stock custody history" ] }
    ].freeze

    CORE_SECTIONS = {
      "clinic_setup" => "Clinic setup", "membership_publish" => "Subscriptions",
      "patient_enroll" => "Patient workspace", "membership_payment" => "Patient workspace",
      "appointment_schedule" => "Schedule", "appointment_reschedule" => "Front desk",
      "appointment_cancel" => "Front desk", "patient_check_in" => "Front desk",
      "visit_save" => "Patients", "visit_complete" => "Patients",
      "inventory_product_create" => "Inventory", "inventory_supplier_create" => "Inventory",
      "inventory_location_create" => "Inventory", "inventory_purchase_order_create" => "Inventory",
      "inventory_shipment_record" => "Inventory", "inventory_receive" => "Inventory",
      "inventory_count" => "Inventory", "inventory_adjust" => "Inventory",
      "inventory_transfer" => "Inventory", "inventory_recall" => "Inventory"
    }.freeze

    CLINIC_VIEW = "clinic"
    SANDBOX_KEY = "sandbox"
    SANDBOX_DEFINITION = {
      id: SANDBOX_KEY,
      title: "Sandbox",
      description: "Work freely in a fully populated synthetic clinic workspace.",
      role: "administrator",
      prepared: [ "Full clinic workspace", "Synthetic records", "Editable controls" ]
    }.freeze
    PATIENT_LESSONS = %w[patient_enroll membership_payment].freeze
    STOCK_LESSONS = %w[inventory_count inventory_adjust inventory_transfer inventory_recall].freeze

    class << self
      def definitions
        navigation_lessons = DemoNavigationLessons::DEFINITIONS
        (
          navigation_lessons.first(1) +
          CORE_DEFINITIONS +
          navigation_lessons.drop(1) +
          DemoSpecialtyLessons.definitions
        ).freeze
      end

      def lesson_keys = definitions.pluck(:id) + [ SANDBOX_KEY ]

      def definition!(lesson_key)
        return SANDBOX_DEFINITION if sandbox?(lesson_key)

        definitions.find { |lesson| lesson.fetch(:id) == lesson_key.to_s } ||
          raise(ArgumentError, "Choose an available demo lesson.")
      end

      def sandbox?(lesson_key) = lesson_key.to_s == SANDBOX_KEY

      def view_for(lesson_key)
        return "patient" if PATIENT_LESSONS.include?(lesson_key.to_s)
        CLINIC_VIEW
      end

      def catalog
        definitions.map do |lesson|
          lesson.merge(section: lesson[:section] || CORE_SECTIONS.fetch(lesson.fetch(:id), "Clinic"), status: "available")
        end
      end

      def prepare!(run)
        if sandbox?(run.lesson_key)
          prepare_sandbox!(run)
          run.update!(baseline: run.baseline.to_h.merge(baseline_for(run)))
          return run
        end

        finalize_clinic!(run) unless run.lesson_key == "clinic_setup"
        case DemoSpecialtyLessons.base_key(run.lesson_key)
        when "clinic_setup", "inventory_product_create", "inventory_supplier_create",
          "inventory_location_create", "inventory_purchase_order_create", "inventory_receive"
          # GuidedClinicDemo.prepare_clinic! supplies the independent baseline for these lessons.
        when "membership_publish"
          finalize_clinic!(run)
        when "patient_enroll"
          finalize_clinic!(run)
          publish_membership!(run)
        when "membership_payment"
          prepare_enrollment!(run)
        when "appointment_schedule"
          prepare_paid_patient!(run)
        when "appointment_reschedule", "appointment_cancel", "patient_check_in"
          prepare_paid_patient!(run)
          book_appointment!(run, today: run.lesson_key == "patient_check_in")
        when "visit_save", "visit_complete"
          prepare_paid_patient!(run)
          appointment = book_appointment!(run, today: true)
          encounter = Clinic::Scheduling::CreateEncounter.call(
            practice: run.practice, actor: run.operator_user, patient: run.patient,
            appointment:, started_at: Current.business_time
          )
          prepare_completion_evidence!(run, encounter) if DemoSpecialtyLessons.base_key(run.lesson_key) == "visit_complete"
        when "inventory_shipment_record"
          prepare_open_purchase_order!(run)
        when *STOCK_LESSONS
          prepare_stock!(run)
          prepare_transfer_destination!(run) if run.lesson_key == "inventory_transfer"
        else
          DemoNavigationLessons.prepare!(run)
        end
        prepare_specialty_note!(run) if DemoSpecialtyLessons.specialty?(run.lesson_key) && DemoSpecialtyLessons.base_key(run.lesson_key) == "visit_save"
        run.update!(baseline: run.baseline.to_h.merge(baseline_for(run)))
        run
      end

      def prepare_context!(run, kind:)
        case kind.to_sym
        when :clinic
          finalize_clinic!(run)
        when :patient
          prepare_paid_patient!(run)
        when :appointment
          prepare_paid_patient!(run)
          book_appointment!(run, today: true)
        when :encounter
          prepare_paid_patient!(run)
          appointment = book_appointment!(run, today: true)
          Clinic::Scheduling::CreateEncounter.call(
            practice: run.practice, actor: run.operator_user, patient: run.patient,
            appointment:, started_at: Current.business_time
          )
        when :stock
          prepare_stock!(run)
        else
          raise ArgumentError, "Unknown demo preparation context."
        end
        run
      end

      def complete?(run)
        return false if sandbox?(run.lesson_key)

        baseline = run.baseline.to_h
        case DemoSpecialtyLessons.base_key(run.lesson_key)
        when "clinic_setup"
          Clinic::Configuration::PracticeFeatures.snapshot(practice: run.practice).fetch(:finalized)
        when "membership_publish"
          new_ids?(Clinic::Care::SubscriptionVersion.where(practice_id: run.practice_id), baseline["subscription_version_ids"])
        when "patient_enroll"
          run.reload.membership_prospect_id.present? && run.patient_user_id.present?
        when "membership_payment"
          run.reload.paid_patient?
        when "appointment_schedule"
          new_ids?(appointments(run), baseline["appointment_ids"])
        when "appointment_reschedule"
          appointment = appointments(run).find_by(id: baseline["target_appointment_id"])
          appointment.present? && appointment.starts_at.iso8601(6) != baseline["appointment_starts_at"]
        when "appointment_cancel"
          appointments(run).where(id: baseline["target_appointment_id"], status: "cancelled").exists?
        when "patient_check_in"
          new_ids?(Clinic::Encounter.where(practice_id: run.practice_id), baseline["encounter_ids"])
        when "visit_save"
          new_ids?(Clinic::EncounterNoteRevision.where(practice_id: run.practice_id), baseline["note_revision_ids"])
        when "visit_complete"
          Clinic::Encounter.where(practice_id: run.practice_id, id: baseline["target_encounter_id"]).where.not(ended_at: nil).exists?
        when "inventory_product_create"
          new_ids?(run.practice.pharmacy_products, baseline["product_ids"])
        when "inventory_supplier_create"
          new_ids?(run.practice.inventory_suppliers, baseline["supplier_ids"])
        when "inventory_location_create"
          new_ids?(run.practice.inventory_locations, baseline["location_ids"])
        when "inventory_purchase_order_create"
          new_ids?(run.practice.inventory_purchase_orders, baseline["purchase_order_ids"])
        when "inventory_shipment_record"
          new_ids?(run.practice.inventory_shipments, baseline["shipment_ids"])
        when "inventory_receive"
          new_ids?(Clinic::Inventory::Receipt.where(practice_id: run.practice_id), baseline["receipt_ids"])
        when "inventory_count"
          new_ids?(Clinic::Inventory::CountSession.where(practice_id: run.practice_id, status: "completed"), baseline["completed_count_ids"])
        when "inventory_adjust"
          movements = Clinic::Inventory::PharmacyMovement.where(practice_id: run.practice_id, kind: %w[adjustment_in adjustment_out])
          new_ids?(movements, baseline["adjustment_ids"])
        when "inventory_transfer"
          new_ids?(Clinic::Inventory::Transfer.where(practice_id: run.practice_id), baseline["transfer_ids"])
        when "inventory_recall"
          new_ids?(Clinic::Inventory::Recall.where(practice_id: run.practice_id), baseline["recall_ids"])
        else
          DemoNavigationLessons.complete?(run)
        end
      end

      def step_for(run)
        lesson = definition!(run.lesson_key)
        lesson.slice(:id, :title, :description).merge(
          status: complete?(run) ? "complete" : "available",
          href: href_for(run), requires: [],
          review: !sandbox?(run.lesson_key) && !core_lesson?(run.lesson_key) && DemoNavigationLessons.review?(run.lesson_key)
        )
      end

      def steps_for(run)
        steps = [ step_for(run) ]
        return steps unless run.lesson_key == "scribe_review"

        patient = run.patient
        encounter = patient && run.practice.encounters.where(patient:).order(:id).last
        return steps unless encounter

        steps << {
          id: "scribe_review_treatment",
          title: "Open treatment workspace",
          description: "Keep the recording dock open while you review the prepared treatment workspace.",
          status: "available",
          href: "/clinic/patients/#{patient.id}/encounters/#{encounter.id}",
          requires: [],
          review: false
        }
      end

      private

      def core_lesson?(lesson_key)
        CORE_DEFINITIONS.any? { |lesson| lesson.fetch(:id) == DemoSpecialtyLessons.base_key(lesson_key) }
      end

      def prepare_sandbox!(run)
        %i[patient appointment encounter stock].each do |kind|
          prepare_context!(run, kind:)
        end
        DemoSandboxPreparation.prepare!(run)
        DemoNavigationPreparation.prepare!(run)
        DemoWorkspacePreparation.prepare!(run)
      end

      def baseline_for(run)
        appointment = appointments(run).order(:id).last
        encounter = Clinic::Encounter.where(practice_id: run.practice_id).order(:id).last
        {
          subscription_version_ids: Clinic::Care::SubscriptionVersion.where(practice_id: run.practice_id).pluck(:id),
          appointment_ids: appointments(run).pluck(:id), target_appointment_id: appointment&.id,
          appointment_starts_at: appointment&.starts_at&.iso8601(6),
          encounter_ids: Clinic::Encounter.where(practice_id: run.practice_id).pluck(:id), target_encounter_id: encounter&.id,
          note_revision_ids: Clinic::EncounterNoteRevision.where(practice_id: run.practice_id).pluck(:id),
          product_ids: run.practice.pharmacy_products.pluck(:id), supplier_ids: run.practice.inventory_suppliers.pluck(:id),
          location_ids: run.practice.inventory_locations.pluck(:id), purchase_order_ids: run.practice.inventory_purchase_orders.pluck(:id),
          shipment_ids: run.practice.inventory_shipments.pluck(:id), receipt_ids: Clinic::Inventory::Receipt.where(practice_id: run.practice_id).pluck(:id),
          completed_count_ids: Clinic::Inventory::CountSession.where(practice_id: run.practice_id, status: "completed").pluck(:id),
          adjustment_ids: Clinic::Inventory::PharmacyMovement.where(practice_id: run.practice_id, kind: %w[adjustment_in adjustment_out]).pluck(:id),
          transfer_ids: Clinic::Inventory::Transfer.where(practice_id: run.practice_id).pluck(:id),
          recall_ids: Clinic::Inventory::Recall.where(practice_id: run.practice_id).pluck(:id)
        }.stringify_keys
      end

      def new_ids?(scope, baseline_ids)
        scope.where.not(id: Array(baseline_ids)).exists?
      end

      def appointments(run)
        Clinic::Appointment.where(practice_id: run.practice_id)
      end

      def finalize_clinic!(run)
        snapshot = Clinic::Configuration::PracticeFeatures.snapshot(practice: run.practice)
        return if snapshot.fetch(:finalized)
        membership = run.operator_user.clinic_memberships.find_by!(practice_id: run.practice_id)
        Clinic::Configuration::PracticeFeatures.revise(
          practice: run.practice, actor: membership, request_key: "guided-finalize-#{run.id}",
          expected_revision: snapshot.fetch(:revision), insurance_workflows_enabled: false,
          clinic_type: snapshot.fetch(:clinic_type), service_scope: snapshot.fetch(:service_scope),
          assessment_scope: snapshot.fetch(:assessment_scope), finalize: true
        )
      end

      def publish_membership!(run)
        return Clinic::Care::SubscriptionProjection.catalog(practice: run.practice).first[:id] if
          Clinic::Care::SubscriptionProjection.catalog(practice: run.practice).any?

        actor = run.operator_user
        family = Clinic::Care::SubscriptionCatalog.save(practice: run.practice, actor:, kind: "family", id: nil,
          attributes: { "name" => "#{DemoSpecialtyLessons::TYPES.fetch(run.template_key)} care program", "lock_version" => 0 })
        Clinic::Care::SubscriptionCatalog.save(practice: run.practice, actor:, kind: "family", id: family.id,
          attributes: { "lock_version" => family.reload.lock_version, "publish" => true })
        service = Clinic::Care::SubscriptionCatalog.save(practice: run.practice, actor:, kind: "service", id: nil,
          attributes: { "name" => "#{DemoSpecialtyLessons::TYPES.fetch(run.template_key)} follow-up", "lock_version" => 0 })
        package = Clinic::Care::SubscriptionCatalog.save(practice: run.practice, actor:, kind: "package", id: nil,
          attributes: { "name" => "#{DemoSpecialtyLessons::TYPES.fetch(run.template_key)} membership", "family_id" => family.id, "lock_version" => 0,
            "draft" => { "amount" => "79.00", "currency" => "USD", "duration" => 1,
              "duration_unit" => "months", "renewal" => "none", "cancellation" => "immediate",
              "terms" => "Fictional guided-demo terms.",
              "components" => [ { "service_id" => service.id, "mode" => "included" } ] } })
        Clinic::Care::SubscriptionCatalog.publish(practice: run.practice, actor:, id: package.id,
          request_key: "guided-publish-#{run.id}", lock_version: package.lock_version).id
      end

      def prepare_enrollment!(run)
        finalize_clinic!(run)
        version_id = publish_membership!(run)
        GuidedClinicDemo.enroll!(run:, version_id:, selections: []) unless run.patient_user_id
      end

      def prepare_paid_patient!(run)
        prepare_enrollment!(run)
        return if run.paid_patient?
        MembershipPaymentSimulator.record!(practice: run.practice, prospect: run.membership_prospect,
          user: run.patient_user, outcome: "paid", request_key: "guided-paid-#{run.id}")
        run.reload
      end

      def book_appointment!(run, today: false)
        existing = appointments(run).order(:id).last
        return existing if existing
        zone = ActiveSupport::TimeZone[run.practice.timezone] || Time.zone
        local = Current.business_time.in_time_zone(zone)
        starts_at = if today
          candidate = [ local + 10.minutes, local.change(hour: 10, min: 0, sec: 0) ].max
          candidate + 30.minutes <= local.change(hour: 17, min: 0, sec: 0) ? candidate : local.tomorrow.change(hour: 10, min: 0, sec: 0)
        else
          local.tomorrow.change(hour: 10, min: 0, sec: 0)
        end
        Clinic::Scheduling::BookAppointment.call(
          practice: run.practice, actor: run.operator_user, patient: run.patient,
          site: run.practice.sites.first!, room: run.practice.rooms.first!,
          booked_clinician: run.practice.clinician_profiles.first!, visit_type: run.practice.visit_types.first!,
          reason: "#{DemoSpecialtyLessons::TYPES.fetch(run.template_key)} follow-up", starts_at:, ends_at: starts_at + 30.minutes,
          request_key: "guided-appointment-#{run.id}", visit_modality: "in_person"
        )
      end

      def prepare_specialty_note!(run)
        encounter = run.practice.encounters.order(:id).last!
        body = Clinic::Care::SoapNotePayload.dump(template_id: DemoSpecialtyLessons.template_id(run),
          template_version: 1, sections: DemoSpecialtyLessons.scenario(run))
        Clinic::Care::CreateEncounterNote.call(practice: run.practice, actor: run.operator_user,
          encounter:, note_kind: "soap", encrypted_body: body,
          payload_version: Clinic::Care::SoapNotePayload::VERSION, request_key: "demo-specialty-note-#{run.id}")
      end

      def prepare_completion_evidence!(run, encounter)
        body = Clinic::Care::SoapNotePayload.dump(
          template_id: DemoSpecialtyLessons.template_id(run), template_version: 1,
          sections: DemoSpecialtyLessons.scenario(run),
          patient_instructions: "Follow the fictional care instructions."
        )
        note = Clinic::Care::CreateEncounterNote.call(
          practice: run.practice, actor: run.operator_user, encounter:, note_kind: "soap",
          encrypted_body: body, payload_version: Clinic::Care::SoapNotePayload::VERSION,
          request_key: "guided-note-#{run.id}"
        )
        revision = note.revisions.order(:revision_no).last!
        Clinic::Care::SignEncounterNote.call(note:, actor: run.operator_user,
          revision_no: revision.revision_no, content_digest: Digest::SHA256.hexdigest(revision.encrypted_body),
          attestation_version: "guided-demo-v1")
        Clinic::Operations::EncounterFollowUps.record(
          practice: run.practice, actor: run.operator_user, encounter:,
          request_key: "guided-follow-up-#{run.id}", expected_version: 0,
          attributes: { status: "not_required", plan: "" }
        )
      end

      def prepare_open_purchase_order!(run)
        product = run.practice.pharmacy_products.first!
        supplier = run.practice.inventory_suppliers.first!
        location = run.practice.inventory_locations.first!
        order = run.practice.inventory_purchase_orders.create!(actor: run.operator_user, supplier:,
          receiving_site: run.practice.sites.first!, number: "GUIDED-SHIP-#{run.id}", status: "sent",
          destination: location.name, reason: "Fictional shipment lesson order",
          request_key: SecureRandom.uuid, payload_digest: "guided-shipment-order-#{run.id}",
          version: 1, subtotal: 10, tax: 0, shipping: 0, total: 10, currency: "USD")
        order.lines.create!(practice: run.practice, product:, product_name: product.name,
          stock_unit: product.stock_unit, input_unit: "package", ordered_quantity: 1,
          received_quantity: 0, conversion_factor: product.package_size, unit_price: 10, currency: "USD")
      end

      def prepare_stock!(run)
        return if Clinic::Inventory::Receipt.where(practice_id: run.practice_id).exists?
        order = run.practice.inventory_purchase_orders.order(:id).first!
        line = order.lines.first!
        shipment = order.shipments.first!
        location = run.practice.inventory_locations.find_by!(name: "Supply cabinet")
        Clinic::Inventory::Receiving.call(
          practice: run.practice, actor: run.operator_user, supplier: order.supplier&.name,
          reason: "Fictional lesson stock", request_key: SecureRandom.uuid,
          purchase_order: order, shipment:, status: "received",
          lines: [ { product_id: line.product_id, lot_number: "GUIDED-LOT-#{run.id}",
            location_id: location.id, location: location.name, expires_on: "2099-01-01",
            amount: 2, input_unit: "package", purchase_order_line_id: line.id } ]
        )
      end

      def prepare_transfer_destination!(run)
        run.practice.inventory_locations.find_or_create_by!(site: run.practice.sites.first!, name: "Secondary cabinet") do |location|
          location.kind = "storage"
          location.status = "active"
        end
      end

      def href_for(run)
        return "/clinic" if sandbox?(run.lesson_key)

        appointment = appointments(run).order(:id).last
        encounter = Clinic::Encounter.where(practice_id: run.practice_id).order(:id).last
        product = run.practice.pharmacy_products.first
        order = run.practice.inventory_purchase_orders.order(:id).last
        shipment = run.practice.inventory_shipments.order(:id).last
        date = appointment&.starts_at&.in_time_zone(run.practice.timezone)&.to_date&.iso8601
        {
          "clinic_setup" => "/clinic/setup",
          "membership_publish" => "/clinic/subscriptions",
          "patient_enroll" => "/memberships/#{run.practice.public_membership_slug}",
          "membership_payment" => "/memberships/account?payment=local",
          "appointment_schedule" => "/clinic/schedule?patient_id=#{run.patient&.id}",
          "appointment_reschedule" => "/clinic/front-desk?date=#{date}",
          "appointment_cancel" => "/clinic/front-desk?date=#{date}",
          "patient_check_in" => "/clinic/front-desk?date=#{date}",
          "visit_save" => "/clinic/patients/#{run.patient&.id}/encounters/#{encounter&.id}",
          "visit_complete" => "/clinic/patients/#{run.patient&.id}/encounters/#{encounter&.id}",
          "inventory_product_create" => "/clinic/inventory/catalog/new",
          "inventory_supplier_create" => "/clinic/inventory/suppliers",
          "inventory_location_create" => "/clinic/inventory/locations",
          "inventory_purchase_order_create" => "/clinic/inventory/purchasing/new?product_id=#{product&.id}",
          "inventory_shipment_record" => "/clinic/inventory/shipments/new?purchase_order_id=#{order&.id}",
          "inventory_receive" => "/clinic/inventory/receiving?shipment_id=#{shipment&.id}",
          "inventory_count" => "/clinic/inventory/counts",
          "inventory_adjust" => "/clinic/inventory/lots?product_id=#{product&.id}",
          "inventory_transfer" => "/clinic/inventory/lots?product_id=#{product&.id}",
          "inventory_recall" => "/clinic/inventory/recalls"
        }.fetch(DemoSpecialtyLessons.base_key(run.lesson_key)) { DemoNavigationLessons.href_for(run) }
      end
    end
  end
end
