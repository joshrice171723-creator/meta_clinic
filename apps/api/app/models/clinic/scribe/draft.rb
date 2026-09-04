module Clinic
  module Scribe
    class Draft < ApplicationRecord
      self.table_name = "clinic_scribe_drafts"
      include TenantScoped
      include Auditable

      belongs_to :encounter, class_name: "Clinic::Scribe::Encounter"
      belongs_to :source, class_name: "Clinic::Scribe::Source"
      belongs_to :parent, class_name: "Clinic::Scribe::Draft", optional: true
      belongs_to :created_by, class_name: "User"
      belongs_to :approved_by, class_name: "User", optional: true
      has_many :sections, class_name: "Clinic::Scribe::DraftSection", foreign_key: :draft_id, dependent: :restrict_with_error
      has_many :exports, class_name: "Clinic::Scribe::Export", foreign_key: :draft_id, dependent: :restrict_with_error
      has_many :events, class_name: "Clinic::Scribe::Event", foreign_key: :draft_id, dependent: :restrict_with_error

      validates :status, inclusion: { in: %w[draft in_review approved superseded exported deleted] }
      validates :template_id, :provider, :model, :model_version, :prompt_digest, :input_digest, :output_digest, presence: true
      validate :encounter_and_source_belong_to_practice

      def current?
        !%w[superseded deleted].include?(status)
      end

      def effective_sections
        sections.order(:id).to_h { |section| [section.section_key, section.human_content.presence || section.generated_content.to_s] }
      end

      private

      def encounter_and_source_belong_to_practice
        errors.add(:encounter, "must belong to the selected practice") if encounter && encounter.practice_id != practice_id
        errors.add(:source, "must belong to the selected practice") if source && source.practice_id != practice_id
        errors.add(:source, "must belong to the encounter") if source && encounter && source.encounter_id != encounter_id
      end
    end
  end
end
