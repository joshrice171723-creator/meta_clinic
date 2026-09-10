module Clinic
  module Care
    class PatientEducationEvent < ApplicationRecord
      self.table_name = "clinic_patient_education_events"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      TOPICS = %w[medication diagnosis self_care warning_signs procedure device follow_up prevention other].freeze
      DELIVERY_METHODS = %w[discussion handout portal demonstration].freeze
      RECIPIENTS = %w[patient caregiver both].freeze
      TEACH_BACK_STATUSES = %w[demonstrated needs_reteaching declined unable not_applicable].freeze

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :encounter, class_name: "Clinic::Encounter"
      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :recorded_by_membership, class_name: "Clinic::Membership"

      encrypts :topic_title, :material_title, :material_url, :patient_response, :reteaching_summary, :follow_up_plan
      validates :topic_code, inclusion: { in: TOPICS }
      validates :delivery_method, inclusion: { in: DELIVERY_METHODS }
      validates :recipient, inclusion: { in: RECIPIENTS }
      validates :teach_back_status, inclusion: { in: TEACH_BACK_STATUSES }
      validates :topic_title, presence: true, length: { maximum: 240 }
      validates :language, presence: true, length: { maximum: 80 }
      validates :material_title, length: { maximum: 240 }, allow_nil: true
      validates :material_url, length: { maximum: 2_000 }, allow_nil: true
      validates :patient_response, :reteaching_summary, :follow_up_plan, length: { maximum: 2_000 }, allow_nil: true
      validates :request_key, format: { with: Clinic::Idempotency::KEY_PATTERN },
        uniqueness: { scope: %i[practice_id recorded_by_membership_id] }
      validates :recorded_at, presence: true
      validate :evidence_matches
      validate :context_matches

      private

      def evidence_matches
        if delivery_method.in?(%w[handout portal]) && material_title.blank?
          errors.add(:material_title, "is required for a handout or portal resource")
        end
        errors.add(:patient_response, "is required when teach-back is demonstrated") if teach_back_status == "demonstrated" && patient_response.blank?
        if teach_back_status == "needs_reteaching"
          errors.add(:reteaching_summary, "is required when more teaching is needed") if reteaching_summary.blank?
          errors.add(:follow_up_needed, "must be selected when more teaching is needed") unless follow_up_needed
        end
        errors.add(:follow_up_plan, "is required when follow-up is needed") if follow_up_needed && follow_up_plan.blank?
      end

      def context_matches
        records = [ patient, encounter, site, recorded_by_membership ].compact
        errors.add(:base, "Education records must remain in one practice") if records.any? { |record| record.practice_id != practice_id }
        errors.add(:encounter, "must belong to this patient") if encounter && encounter.patient_id != patient_id
        errors.add(:site, "must match the encounter facility") if encounter && site_id != encounter.site_id
      end
    end
  end
end
