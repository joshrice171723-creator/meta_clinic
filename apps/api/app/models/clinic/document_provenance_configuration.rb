module Clinic
  class DocumentProvenanceConfiguration < ApplicationRecord
    self.table_name = "clinic_document_provenance_configurations"
    include TenantScoped
    include AppendOnly

    FIELDS = %w[source issuer issued_date received_date].freeze
    belongs_to :category, class_name: "Clinic::DocumentCategory"
    belongs_to :recorded_by_membership, class_name: "Clinic::Membership"
    validates :revision, numericality: { only_integer: true, greater_than: 0 }, uniqueness: { scope: %i[practice_id category_id] }
    validates :applicable, inclusion: { in: [true, false] }
    validates :request_key, :recorded_at, presence: true
    validate :configuration_valid

    def configuration_valid
      errors.add(:category, "must belong to this clinic") unless category&.practice_id == practice_id
      errors.add(:recorded_by_membership, "must belong to this clinic") unless recorded_by_membership&.practice_id == practice_id
      unless fields.is_a?(Array) && (fields - FIELDS).empty? && fields.uniq == fields &&
          (applicable ? fields.any? : fields.empty?)
        errors.add(:fields, "must explicitly select applicable metadata or be empty when disabled")
      end
    end
  end
end
