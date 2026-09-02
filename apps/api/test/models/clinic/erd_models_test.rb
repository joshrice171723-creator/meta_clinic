require "test_helper"

class ClinicErdModelsTest < ActiveSupport::TestCase
  TARGET_MODELS = [
    Organization,
    Clinic::Site,
    Clinic::Room,
    Clinic::Department,
    Clinic::VisitType,
    Clinic::ClinicianProfile,
    Clinic::ClinicianAssignment,
    Clinic::ClinicianCredential,
    Clinic::Appointment,
    Clinic::Encounter,
    Clinic::EncounterParticipant,
    Clinic::EncounterNote,
    Clinic::EncounterNoteRevision,
    Clinic::EncounterNoteSignature,
    Clinic::Care::Observation,
    Clinic::Care::ObservationSource,
    Clinic::Care::Condition,
    Clinic::Care::Allergy,
    Clinic::Care::MedicationStatement,
    Clinic::Care::PatientAddressVersion,
    Clinic::Care::PatientDemographics,
    Clinic::Care::PatientContact,
    Clinic::Care::PatientEmergencyContact,
    Clinic::Care::PatientCommunicationPreference,
    Clinic::Care::PatientSocialHistory,
    RoleVersion,
    Permission,
    RoleVersionPermission,
    Clinic::RoleGrant,
    Clinic::RoleGrantEvent,
    Clinic::AuditEvent,
    Clinic::AuditResourceManifest,
    Clinic::AuditDeliveryReceipt,
    PlatformAuditEvent,
    Clinic::Staff::AddressVersion,
    Clinic::Inventory::SupplierAddressVersion,
    Clinic::DocumentCategory,
    Clinic::Document,
    Clinic::MessageIntent,
    Clinic::MessageAttachment,
    Clinic::MessageOutbox,
    Clinic::MessageDeliveryEvent,
    Clinic::Invoice,
    Clinic::InvoiceLine,
    Clinic::PaymentEvent,
    Clinic::PaymentAllocation,
    Clinic::CreditNote,
    Clinic::RefundEvent,
    Clinic::CoverageVersion,
    Clinic::Care::PatientMembership,
    Clinic::InsuranceClaim,
    Clinic::ModelVersion
  ].freeze

  test "every target model maps to its ERD table" do
    TARGET_MODELS.each do |model|
      assert_predicate model.table_name, :present?, model.name
    end
  end

  test "tenant models expose a practice scope and explicit tenant association" do
    TARGET_MODELS.select { |model| model < ApplicationRecord && model.column_names.include?("practice_id") }.each do |model|
      assert_equal Clinic::Practice, model.reflect_on_association(:practice).klass, model.name
      assert_respond_to model, :for_practice, model.name
    end
  end

  test "critical relationship optionality follows the target schema" do
    assert_not Clinic::Appointment.reflect_on_association(:patient).options[:optional]
    assert Clinic::Appointment.reflect_on_association(:site).options[:optional]
    assert Clinic::Appointment.reflect_on_association(:room).options[:optional]
    assert Clinic::Encounter.reflect_on_association(:appointment).options[:optional]
    assert Clinic::Document.reflect_on_association(:encounter).options[:optional]
    assert_not Clinic::InvoiceLine.reflect_on_association(:invoice).options[:optional]
  end

  test "stable states use string-backed enums without colliding with Active Record" do
    assert_equal "clean", Clinic::Document.scan_states[:clean]
    assert_equal "group", Clinic::Care::Observation.value_kinds[:group]
    assert_equal "site", Clinic::RoleGrant.scope_kinds[:site]
    assert_equal "released", Clinic::AuditEvent.outcomes[:released]
  end

  test "patient commercial membership is append-only and tenant-bound" do
    assert_equal Clinic::Care::PatientMembership, Clinic::Care::Patient.reflect_on_association(:patient_memberships).klass
    assert_equal Clinic::Membership, Clinic::Care::PatientMembership.reflect_on_association(:recorded_by_membership).klass
    assert_equal %w[member nonmember], Clinic::Care::PatientMembership.statuses.keys
    assert_equal "clinic_patient_memberships", Clinic::Care::PatientMembership.table_name
    assert Clinic::Care::PatientMembership < Clinic::AppendOnly
    assert_respond_to Clinic::Care::PatientMembership, :latest_as_of
  end

  test "observation validation requires exactly one typed representation" do
    practice = Clinic::Practice.new(id: 1)
    patient = Clinic::Care::Patient.new(id: 2, practice_id: 1)
    observation = Clinic::Care::Observation.new(
      practice_id: 1,
      patient_id: patient.id,
      patient: patient,
      practice: practice,
      code: "height",
      code_system: "synthetic",
      code_version: "1",
      value_kind: "numeric",
      numeric_value: 170,
      text_value: "not numeric",
      observed_at: Time.current,
      recorded_at: Time.current
    )

    assert_not observation.valid?
    assert_includes observation.errors[:unit_code], "is required"
    assert_includes observation.errors[:text_value], "must be blank"
  end

  test "auditable models use tenant-bound PaperTrail and do not store snapshots" do
    assert_equal "Clinic::ModelVersion", Clinic::Care::Patient.version_class_name
    assert_equal "Clinic::ModelVersion", Clinic::Document.version_class_name
    assert_equal "clinic_model_versions", Clinic::ModelVersion.table_name
    assert_not_includes Clinic::ModelVersion.column_names, "object"
    assert_not_includes Clinic::ModelVersion.column_names, "object_changes"
    refute Clinic::AuditEvent < PaperTrail::Model::InstanceMethods
  end

  test "auditable create writes a tenant-bound metadata-only version" do
    practice = Clinic::Practice.create!(name: "Version Test Clinic", timezone: "UTC")
    site = Clinic::Site.create!(practice: practice, code: "MAIN")

    version = Clinic::ModelVersion.find_by!(item_type: "Clinic::Site", item_id: site.id)
    assert_equal practice.id, version.practice_id
    assert_equal "create", version.event
    assert_equal %w[code created_at id practice_id updated_at], version.changed_fields.sort
    assert_not_includes version.attributes.keys, "object"
    assert_not_includes version.attributes.keys, "object_changes"
  end
end
