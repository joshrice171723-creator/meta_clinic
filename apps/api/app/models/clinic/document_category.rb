module Clinic
  class DocumentCategory < ApplicationRecord
    self.table_name = "clinic_document_categories"
    include TenantScoped
    include Auditable

    has_many :documents, class_name: "Clinic::Document", dependent: :restrict_with_error
    validates :code, :name, presence: true
    validates :code, uniqueness: { scope: :practice_id }
  end
end
