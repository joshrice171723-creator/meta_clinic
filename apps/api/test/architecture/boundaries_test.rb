require "test_helper"

class BoundariesTest < ActiveSupport::TestCase
  test "migration versions remain unique across integrated workstreams" do
    migrations = Rails.root.glob("db/migrate/*.rb")
    versions = migrations.map { |path| path.basename.to_s.split("_", 2).first }

    assert_equal versions.uniq.sort, versions.sort
  end

  test "API controllers share transport but not a frontend or sibling product controller" do
    assert_equal ApplicationController, Clinic::BaseController.superclass
    assert_equal ApplicationController, Identity::Api::SessionsController.superclass
    assert_equal ApplicationController, Launch::Api::MaterialsController.superclass
    assert_not ApplicationController.private_method_defined?(:available_materials)
    assert_not Clinic::BaseController.private_method_defined?(:available_materials)
    assert_equal Launch::MaterialAccess, Launch::Api::MaterialsController.instance_method(:available_materials).owner
    assert_equal ["clinic/billing/payment_events/receipt.html.erb"],
      Rails.root.glob("app/views/**/*.erb").map { |path| path.relative_path_from(Rails.root.join("app/views")).to_s }
    assert_empty Rails.root.glob("app/assets/**/*").select(&:file?)
  end

  test "API route names verbs and paths have an explicit versioned contract" do
    expected = JSON.parse(File.read(Rails.root.join("test/architecture/routes_contract.json")))
    actual = Rails.application.routes.routes.reject { |route| route.path.spec.to_s.start_with?("/rails/") }
      .map { |route| [ route.name, route.verb, route.path.spec.to_s ] }.sort_by(&:to_json)
    assert_equal expected, actual
    actual.each { |_, _, path| assert path.start_with?("/api/") || ["/up(.:format)", "/stripe/connect/webhook(.:format)"].include?(path), path }
  end

  test "models retain their original storage identities and resolve domain associations" do
    mappings = {
      Launch::ContactMessage => "contact_messages", Launch::Material => "materials",
      Launch::LearningProgress => "learning_progresses", Launch::Paperwork => "paperworks",
      Clinic::Care::Patient => "clinic_patients", Clinic::Care::Note => "clinic_notes",
      Clinic::Staff::Member => "clinic_staff_members", Clinic::Inventory::Item => "clinic_items",
      Clinic::Inventory::PharmacyProduct => "clinic_pharmacy_products", Clinic::Inventory::PharmacyBatch => "clinic_pharmacy_batches",
      Clinic::Inventory::PharmacyBatchEvent => "clinic_pharmacy_batch_events",
      Clinic::Inventory::Entry => "clinic_inventory_entries", Clinic::Inventory::StockMovement => "clinic_inventory_entries",
      Clinic::Inventory::PharmacyMovement => "clinic_inventory_entries", Clinic::Inventory::Count => "clinic_inventory_counts",
      Clinic::Inventory::CountApproval => "clinic_inventory_count_approvals", Clinic::Inventory::Hold => "clinic_inventory_holds",
      Clinic::Inventory::HoldRelease => "clinic_inventory_hold_releases", Clinic::Inventory::Location => "clinic_inventory_locations",
      Clinic::Inventory::Lot => "clinic_inventory_lots", Clinic::Inventory::Profile => "clinic_inventory_profiles",
      Clinic::Inventory::Receipt => "clinic_inventory_receipts", Clinic::Inventory::ReceiptLine => "clinic_inventory_receipt_lines",
      Clinic::Inventory::Supplier => "clinic_inventory_suppliers", Clinic::Inventory::PurchaseOrder => "clinic_inventory_purchase_orders",
      Clinic::Inventory::PurchaseOrderLine => "clinic_inventory_purchase_order_lines", Clinic::Inventory::PurchaseOrderEvent => "clinic_inventory_purchase_order_events",
      Clinic::Inventory::Shipment => "clinic_inventory_shipments", Clinic::Inventory::Transfer => "clinic_inventory_transfers",
      Clinic::Inventory::Recall => "clinic_inventory_recalls", Clinic::Inventory::RecallLot => "clinic_inventory_recall_lots",
      Clinic::Inventory::RecallDisposition => "clinic_inventory_recall_dispositions", Clinic::Inventory::ControlReview => "clinic_inventory_control_reviews"
    }
    mappings.each do |model, table|
      assert_equal table, model.table_name, model.name
      model.reflect_on_all_associations.each do |association|
        assert association.klass <= ActiveRecord::Base, "#{model.name}.#{association.name}"
      end
    end
    assert_equal Launch::Paperwork, User.reflect_on_association(:paperworks).klass
    assert_equal Clinic::Care::Patient, Clinic::Practice.reflect_on_association(:patients).klass
    assert_equal Clinic::Staff::Member, Clinic::Practice.reflect_on_association(:staff_members).klass
  end


  test "model roots contain only shared identity and clinic tenancy" do
    assert_equal %w[ability.rb application_record.rb member_session.rb organization.rb permission.rb platform_audit_event.rb role_version.rb role_version_permission.rb user.rb], Rails.root.glob("app/models/*.rb").map { |p| p.basename.to_s }.sort
    assert_equal %w[appointment.rb audit_delivery_receipt.rb audit_event.rb audit_resource_manifest.rb billing_receipt.rb cash_drawer_session.rb cash_tender.rb clinician_assignment.rb clinician_credential.rb clinician_profile.rb communication_endpoint.rb communication_preference.rb coverage_version.rb credit_note.rb department.rb document.rb document_category.rb encounter.rb encounter_note.rb encounter_note_revision.rb encounter_note_signature.rb encounter_participant.rb insurance_claim.rb invoice.rb invoice_line.rb membership.rb message_attachment.rb message_delivery_event.rb message_intent.rb message_outbox.rb model_version.rb operation_receipt.rb patient_reminder.rb patient_reminder_action.rb patient_reminder_delivery_attempt.rb patient_reminder_outbox.rb payment_allocation.rb payment_collection_intent.rb payment_event.rb payment_processor_event.rb practice.rb refund_event.rb role_grant.rb role_grant_event.rb room.rb site.rb site_hour_exception.rb site_operating_hour.rb staff_conversation.rb staff_conversation_member.rb staff_message.rb staff_message_attachment.rb staff_message_escalation.rb staff_message_outbox.rb staff_message_receipt.rb staff_message_request.rb staff_notification.rb staff_notification_preference.rb visit_type.rb], Rails.root.glob("app/models/clinic/*.rb").map { |p| p.basename.to_s }.sort
    assert_not MemberAuthentication.private_instance_methods.include?(:create_development_member)
  end
end
