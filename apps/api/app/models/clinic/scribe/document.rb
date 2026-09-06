module Clinic
  module Scribe
    class Document < ApplicationRecord
      self.table_name = "clinic_scribe_documents"
      include TenantScoped
      include Auditable

      belongs_to :encounter, class_name: "Clinic::Scribe::Encounter"
      belongs_to :created_by, class_name: "User"
      belongs_to :current_draft, class_name: "Clinic::Scribe::Draft", optional: true
      has_many :drafts, class_name: "Clinic::Scribe::Draft", foreign_key: :document_id, dependent: :restrict_with_error

      validates :status, inclusion: { in: %w[active deleted] }
      validates :template_id, :template_version, presence: true
      validate :encounter_belongs_to_practice

      private

      def encounter_belongs_to_practice
        errors.add(:encounter, "must belong to the selected practice") if encounter && encounter.practice_id != practice_id
        return unless current_draft

        errors.add(:current_draft, "must belong to the selected practice") if current_draft.practice_id != practice_id
        errors.add(:current_draft, "must belong to the document") if current_draft.document_id != id
      end
    end
  end
end
