module Clinic
  module Scribe
    class SourceSegment < ApplicationRecord
      self.table_name = "clinic_scribe_source_segments"
      include TenantScoped
      include Auditable

      belongs_to :source, class_name: "Clinic::Scribe::Source"
      encrypts :content

      validates :sequence, numericality: { only_integer: true, greater_than: 0 }
      validates :speaker, inclusion: { in: %w[patient clinician caregiver unknown] }
      validates :content, presence: true
      validate :source_belongs_to_practice

      private

      def source_belongs_to_practice
        errors.add(:source, "must belong to the selected practice") if source && source.practice_id != practice_id
      end
    end
  end
end
