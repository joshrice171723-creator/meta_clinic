module Clinic
  module Scribe
    class DraftSection < ApplicationRecord
      self.table_name = "clinic_scribe_draft_sections"
      include TenantScoped
      include Auditable

      belongs_to :draft, class_name: "Clinic::Scribe::Draft"
      encrypts :generated_content, :human_content

      validates :section_key, inclusion: { in: %w[subjective objective assessment plan] }
      validates :status, inclusion: { in: %w[needs_review accepted edited rejected] }
      validate :draft_belongs_to_practice

      def effective_content
        human_content.presence || generated_content.to_s
      end

      private

      def draft_belongs_to_practice
        errors.add(:draft, "must belong to the selected practice") if draft && draft.practice_id != practice_id
      end
    end
  end
end
