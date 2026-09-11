module Clinic
  class Practice < ApplicationRecord
    self.table_name = "clinic_practices"
    belongs_to :organization, optional: true
    has_many :memberships, class_name: "Clinic::Membership", dependent: :restrict_with_error
    has_many :patients, class_name: "Clinic::Care::Patient", dependent: :restrict_with_error
    has_many :patient_memberships, class_name: "Clinic::Care::PatientMembership", dependent: :restrict_with_error
    has_many :pharmacy_products, class_name: "Clinic::Inventory::PharmacyProduct", dependent: :restrict_with_error
    has_many :items, class_name: "Clinic::Inventory::Item", dependent: :restrict_with_error
    has_many :staff_members, class_name: "Clinic::Staff::Member", dependent: :restrict_with_error
    has_many :workforce_employee_invitations, class_name: "Clinic::Workforce::EmployeeInvitation",
      dependent: :restrict_with_error
    has_many :sites, class_name: "Clinic::Site", dependent: :restrict_with_error
    has_many :rooms, class_name: "Clinic::Room", dependent: :restrict_with_error
    has_many :departments, class_name: "Clinic::Department", dependent: :restrict_with_error
    has_many :visit_types, class_name: "Clinic::VisitType", dependent: :restrict_with_error
    has_many :clinician_profiles, class_name: "Clinic::ClinicianProfile", dependent: :restrict_with_error
    has_many :clinician_assignments, class_name: "Clinic::ClinicianAssignment", dependent: :restrict_with_error
    has_many :clinician_credentials, class_name: "Clinic::ClinicianCredential", dependent: :restrict_with_error
    has_many :appointments, class_name: "Clinic::Appointment", dependent: :restrict_with_error
    has_many :encounters, class_name: "Clinic::Encounter", dependent: :restrict_with_error
    has_many :encounter_participants, class_name: "Clinic::EncounterParticipant", dependent: :restrict_with_error
    has_many :encounter_notes, class_name: "Clinic::EncounterNote", dependent: :restrict_with_error
    has_many :encounter_completion_reviews, class_name: "Clinic::EncounterCompletionReview",
      dependent: :restrict_with_error
    has_many :assessment_revisions, class_name: "Clinic::Care::AssessmentRevision", dependent: :restrict_with_error
    has_many :observations, class_name: "Clinic::Care::Observation", dependent: :restrict_with_error
    has_many :observation_sources, class_name: "Clinic::Care::ObservationSource", dependent: :restrict_with_error
    has_many :patient_care_needs, class_name: "Clinic::Care::PatientCareNeed", dependent: :restrict_with_error
    has_many :encounter_precautions, class_name: "Clinic::Care::EncounterPrecaution", dependent: :restrict_with_error
    has_many :patient_history_reviews, class_name: "Clinic::Care::PatientHistoryReview", dependent: :restrict_with_error
    has_many :inventory_profiles, class_name: "Clinic::Inventory::Profile", dependent: :restrict_with_error
    has_many :inventory_suppliers, class_name: "Clinic::Inventory::Supplier", dependent: :restrict_with_error
    has_many :inventory_locations, class_name: "Clinic::Inventory::Location", dependent: :restrict_with_error
    has_many :inventory_purchase_orders, class_name: "Clinic::Inventory::PurchaseOrder", dependent: :restrict_with_error
    has_many :inventory_shipments, class_name: "Clinic::Inventory::Shipment", dependent: :restrict_with_error
    has_many :inventory_transfers, class_name: "Clinic::Inventory::Transfer", dependent: :restrict_with_error
    has_many :inventory_recalls, class_name: "Clinic::Inventory::Recall", dependent: :restrict_with_error
    has_many :role_grants, class_name: "Clinic::RoleGrant", dependent: :restrict_with_error
    has_many :audit_events, class_name: "Clinic::AuditEvent", dependent: :restrict_with_error
    has_many :documents, class_name: "Clinic::Document", dependent: :restrict_with_error
    has_many :message_intents, class_name: "Clinic::MessageIntent", dependent: :restrict_with_error
    has_many :communication_endpoints, class_name: "Clinic::CommunicationEndpoint", dependent: :restrict_with_error
    has_many :communication_preferences, class_name: "Clinic::CommunicationPreference", dependent: :restrict_with_error
    has_many :patient_reminders, class_name: "Clinic::PatientReminder", dependent: :restrict_with_error
    has_many :patient_reminder_outboxes, class_name: "Clinic::PatientReminderOutbox", dependent: :restrict_with_error
    has_many :billing_services, class_name: "Clinic::BillingService", dependent: :restrict_with_error
    has_many :lab_reports, class_name: "Clinic::Care::LabReport", dependent: :restrict_with_error
    has_many :invoices, class_name: "Clinic::Invoice", dependent: :restrict_with_error
    has_many :payment_collection_intents, class_name: "Clinic::PaymentCollectionIntent", dependent: :restrict_with_error
    has_many :payment_processor_events, class_name: "Clinic::PaymentProcessorEvent", dependent: :restrict_with_error
    has_many :invoice_stripe_checkouts, class_name: "Clinic::Billing::InvoiceStripeCheckout", dependent: :restrict_with_error
    has_many :cash_drawer_sessions, class_name: "Clinic::CashDrawerSession", dependent: :restrict_with_error
    has_many :practice_feature_versions, class_name: "Clinic::PracticeFeatureVersion", dependent: :restrict_with_error
    has_many :model_versions, class_name: "Clinic::ModelVersion", dependent: :restrict_with_error
    has_many :patient_portal_appointment_requests, class_name: "Clinic::PatientPortal::AppointmentRequest", dependent: :restrict_with_error
    has_many :patient_portal_requests, class_name: "Clinic::PatientPortal::Request", dependent: :restrict_with_error
    has_many :patient_portal_recovery_deliveries, class_name: "Clinic::PatientPortal::RecoveryDelivery",
      dependent: :restrict_with_error
    has_many :scribe_encounters, class_name: "Clinic::Scribe::Encounter", dependent: :restrict_with_error
    has_many :scribe_sources, class_name: "Clinic::Scribe::Source", dependent: :restrict_with_error
    has_many :scribe_drafts, class_name: "Clinic::Scribe::Draft", dependent: :restrict_with_error
    after_create { inventory_profiles.create!(version: 1, reason: "New synthetic clinic inventory baseline") }

    def inventory_date
      Current.business_time.in_time_zone(timezone).to_date
    end

    validates :timezone, inclusion: { in: ActiveSupport::TimeZone::MAPPING.values + [ "UTC" ] }
    validates :name, presence: true, length: { maximum: 120 }
  end
end
