module Clinic
  module Care
    class LabSpecimen < ApplicationRecord
      self.table_name = "clinic_lab_specimens"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      CONDITIONS = %w[satisfactory compromised unknown].freeze

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :encounter, class_name: "Clinic::Encounter"
      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :service_request_revision, class_name: "Clinic::Care::ServiceRequestRevision"
      belongs_to :collected_by_membership, class_name: "Clinic::Membership"

      encrypts :specimen_identifier, :specimen_type_display
      validates :specimen_type_code, presence: true, length: { maximum: 80 }
      validates :specimen_type_display, presence: true, length: { maximum: 160 }
      validates :specimen_identifier, length: { maximum: 255 }, allow_nil: true
      validates :condition_code, inclusion: { in: CONDITIONS }
      validates :collected_at, :recorded_at, presence: true
      validate :context_matches

      private

      def context_matches
        records = [ patient, encounter, site, service_request_revision, collected_by_membership ].compact
        errors.add(:base, "Specimen records must remain in one practice") if records.any? { |record| record.practice_id != practice_id }
        errors.add(:encounter, "must belong to this patient") if encounter && encounter.patient_id != patient_id
        if service_request_revision && (
          service_request_revision.patient_id != patient_id || service_request_revision.encounter_id != encounter_id ||
            service_request_revision.site_id != site_id
        )
          errors.add(:service_request_revision, "must belong to this patient encounter and facility")
        end
      end
    end
  end
end
