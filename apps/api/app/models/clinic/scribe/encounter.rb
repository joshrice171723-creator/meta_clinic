module Clinic
  module Scribe
    class Encounter < ApplicationRecord
      self.table_name = "clinic_scribe_encounters"
      include TenantScoped
      include Auditable

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :site, class_name: "Clinic::Site", optional: true
      belongs_to :created_by, class_name: "User"
      has_many :sources, class_name: "Clinic::Scribe::Source", foreign_key: :encounter_id, dependent: :restrict_with_error
      has_many :drafts, class_name: "Clinic::Scribe::Draft", foreign_key: :encounter_id, dependent: :restrict_with_error
      has_many :events, class_name: "Clinic::Scribe::Event", foreign_key: :encounter_id, dependent: :restrict_with_error

      validates :status, inclusion: { in: %w[awaiting_consent consented source_ready in_review approved exported consent_declined consent_withdrawn deleted] }
      validates :consent_status, inclusion: { in: %w[not_recorded accepted declined withdrawn] }
      validates :template_id, :template_version, :retention_class, presence: true
      validate :patient_belongs_to_practice
      validate :site_belongs_to_practice

      def processing_allowed?
        consent_status == "accepted" && deleted_at.nil? && !consent_withdrawn_at
      end

      private

      def patient_belongs_to_practice
        errors.add(:patient, "must belong to the selected practice") if patient && patient.practice_id != practice_id
      end

      def site_belongs_to_practice
        errors.add(:site, "must belong to the selected practice") if site && site.practice_id != practice_id
      end
    end
  end
end
