module Clinic
  module Care
    class Patient < ApplicationRecord
      self.table_name = "clinic_patients"
      include Clinic::TenantScoped
      include Clinic::Auditable
      has_many :notes, class_name: "Clinic::Care::Note", dependent: :restrict_with_error
      has_many :appointments, class_name: "Clinic::Appointment", dependent: :restrict_with_error
      has_many :encounters, class_name: "Clinic::Encounter", dependent: :restrict_with_error
      has_many :encounter_notes, class_name: "Clinic::EncounterNote", dependent: :restrict_with_error
      has_many :observations, class_name: "Clinic::Care::Observation", dependent: :restrict_with_error
      has_many :conditions, class_name: "Clinic::Care::Condition", dependent: :restrict_with_error
      has_many :allergies, class_name: "Clinic::Care::Allergy", dependent: :restrict_with_error
      has_many :medication_statements, class_name: "Clinic::Care::MedicationStatement", dependent: :restrict_with_error
      has_many :care_needs, class_name: "Clinic::Care::PatientCareNeed", dependent: :restrict_with_error
      has_many :history_reviews, class_name: "Clinic::Care::PatientHistoryReview", dependent: :restrict_with_error
      has_many :encounter_precautions, class_name: "Clinic::Care::EncounterPrecaution", dependent: :restrict_with_error
      has_many :address_versions, class_name: "Clinic::Care::PatientAddressVersion", dependent: :restrict_with_error
      has_one :demographics, class_name: "Clinic::Care::PatientDemographics", dependent: :restrict_with_error
      has_many :contacts, class_name: "Clinic::Care::PatientContact", dependent: :restrict_with_error
      has_many :emergency_contacts, class_name: "Clinic::Care::PatientEmergencyContact", dependent: :restrict_with_error
      has_one :communication_preference, class_name: "Clinic::Care::PatientCommunicationPreference", dependent: :restrict_with_error
      has_many :social_histories, class_name: "Clinic::Care::PatientSocialHistory", dependent: :restrict_with_error
      belongs_to :primary_address_version, class_name: "Clinic::Care::PatientAddressVersion", optional: true
      has_many :documents, class_name: "Clinic::Document", dependent: :restrict_with_error
      has_many :message_intents, class_name: "Clinic::MessageIntent", dependent: :restrict_with_error
      has_many :communication_endpoints, class_name: "Clinic::CommunicationEndpoint", dependent: :restrict_with_error
      has_many :communication_preferences, class_name: "Clinic::CommunicationPreference", dependent: :restrict_with_error
      has_many :patient_reminders, class_name: "Clinic::PatientReminder", dependent: :restrict_with_error
      has_many :payment_events, class_name: "Clinic::PaymentEvent", dependent: :restrict_with_error
      has_many :payment_collection_intents, class_name: "Clinic::PaymentCollectionIntent", dependent: :restrict_with_error
      has_many :payment_processor_events, class_name: "Clinic::PaymentProcessorEvent", dependent: :restrict_with_error
      has_many :invoices, class_name: "Clinic::Invoice", dependent: :restrict_with_error
      has_many :coverage_versions, class_name: "Clinic::CoverageVersion", dependent: :restrict_with_error
      has_many :patient_memberships, class_name: "Clinic::Care::PatientMembership", dependent: :restrict_with_error
      has_many :patient_portal_appointment_requests, class_name: "Clinic::PatientPortal::AppointmentRequest", dependent: :restrict_with_error
      has_many :patient_portal_requests, class_name: "Clinic::PatientPortal::Request", dependent: :restrict_with_error
      encrypts :display_name
      validates :display_name, presence: true, length: { maximum: 120 }
      validates :reference, presence: true, length: { maximum: 32 }, uniqueness: { scope: :practice_id }
    end
  end
end
