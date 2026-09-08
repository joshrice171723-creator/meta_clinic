module Clinic
  module Care
    class PatientAddressVersion < ApplicationRecord
      self.table_name = "clinic_patient_address_versions"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      validates :version, numericality: { only_integer: true, greater_than: 0 }
      validates :encrypted_address, presence: true
      scope :chronological, -> { order(:version) }

      # PaperTrail exposes a `version` helper; use the persisted column for
      # this ERD entity so the two meanings cannot collide during assignment.
      def version
        self[:version]
      end

      def version=(value)
        self[:version] = value
      end
    end
  end
end
