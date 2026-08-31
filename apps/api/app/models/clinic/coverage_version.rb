module Clinic
  class CoverageVersion < ApplicationRecord
    self.table_name = "clinic_coverage_versions"
    include TenantScoped
    include AppendOnly

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    has_many :insurance_claims, class_name: "Clinic::InsuranceClaim", dependent: :restrict_with_error

    validates :version, numericality: { only_integer: true, greater_than: 0 }
    validates :encrypted_coverage_evidence, presence: true

    def version
      self[:version]
    end

    def version=(value)
      self[:version] = value
    end
  end
end
