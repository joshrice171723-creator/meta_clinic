module Clinic
  module Scribe
    class Source < ApplicationRecord
      self.table_name = "clinic_scribe_sources"
      include TenantScoped
      include Auditable

      belongs_to :encounter, class_name: "Clinic::Scribe::Encounter"
      belongs_to :imported_by, class_name: "User"
      has_many :segments, class_name: "Clinic::Scribe::SourceSegment", foreign_key: :source_id, dependent: :restrict_with_error

      encrypts :content

      validates :source_type, inclusion: { in: %w[transcript] }
      validates :status, inclusion: { in: %w[ready incomplete pending_deletion deleted] }
      validates :content, :content_digest, presence: true
      validate :encounter_belongs_to_practice

      private

      def encounter_belongs_to_practice
        errors.add(:encounter, "must belong to the selected practice") if encounter && encounter.practice_id != practice_id
      end
    end
  end
end
