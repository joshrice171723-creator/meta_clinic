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
      has_many :encounter_completion_reviews, class_name: "Clinic::EncounterCompletionReview",
        dependent: :restrict_with_error
      has_many :assessment_revisions, class_name: "Clinic::Care::AssessmentRevision", dependent: :restrict_with_error
      has_many :observations, class_name: "Clinic::Care::Observation", dependent: :restrict_with_error
      has_many :lab_specimens, class_name: "Clinic::Care::LabSpecimen", dependent: :restrict_with_error
      has_many :education_events, class_name: "Clinic::Care::PatientEducationEvent", dependent: :restrict_with_error
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
      belongs_to :primary_site, class_name: "Clinic::Site", optional: true
      belongs_to :merged_into_patient, class_name: "Clinic::Care::Patient", optional: true
      belongs_to :merged_by_membership, class_name: "Clinic::Membership", optional: true
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
      before_validation :refresh_name_search_tokens, if: -> { will_save_change_to_display_name? || will_save_change_to_practice_id? }
      validates :display_name, presence: true, length: { maximum: 120 }
      validates :reference, presence: true, length: { maximum: 32 }, uniqueness: { scope: :practice_id }
      validates :merge_reason, length: { maximum: 500 }, allow_nil: true
      validate :merge_evidence_is_complete
      validate :primary_site_belongs_to_practice
      validate :primary_site_has_selected_specialty, if: -> { primary_site_id.present? && (new_record? || will_save_change_to_primary_site_id?) }

      private

      def merge_evidence_is_complete
        evidence = [ merged_into_patient_id, merged_at, merged_by_membership_id, merge_reason ]
        errors.add(:base, "Patient merge evidence must be recorded together") unless evidence.all?(&:blank?) || evidence.all?(&:present?)
        errors.add(:merged_into_patient, "must belong to this practice") if merged_into_patient && merged_into_patient.practice_id != practice_id
      end

      def primary_site_belongs_to_practice
        errors.add(:primary_site, "must belong to this clinic") if primary_site && primary_site.practice_id != practice_id
      end

      def primary_site_has_selected_specialty
        return if Clinic::Configuration::PracticeFeatures.site_specialty_selected?(practice:, site: primary_site)

        errors.add(:primary_site, "needs a selected location specialty before patients can be assigned")
      end

      def refresh_name_search_tokens
        self.name_search_tokens = if practice_id.present? && display_name.present?
          Clinic::Care::PatientNameSearch.tokens_for(practice_id:, name: display_name)
        else
          []
        end
      end
    end
  end
end
