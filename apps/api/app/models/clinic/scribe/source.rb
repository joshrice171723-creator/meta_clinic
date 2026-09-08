module Clinic
  module Scribe
    class Source < ApplicationRecord
      self.table_name = "clinic_scribe_sources"
      include TenantScoped
      include Auditable

      belongs_to :encounter, class_name: "Clinic::Scribe::Encounter"
      belongs_to :imported_by, class_name: "User"
      belongs_to :telehealth_visit, class_name: "Clinic::Telehealth::Visit", optional: true
      belongs_to :telehealth_recording, class_name: "Clinic::Scribe::Recording", optional: true
      has_many :segments, class_name: "Clinic::Scribe::SourceSegment", foreign_key: :source_id, dependent: :restrict_with_error

      encrypts :content

      validates :source_type, inclusion: { in: %w[transcript] }
      validates :status, inclusion: { in: %w[ready incomplete pending_deletion deleted] }
      validates :content, :content_digest, presence: true
      validates :capture_epoch, numericality: { only_integer: true, greater_than: 0 }, allow_nil: true
      validates :recording_segment_index, numericality: { only_integer: true, greater_than_or_equal_to: 0 }, allow_nil: true
      validates :source_order, numericality: { only_integer: true, greater_than: 0 }, allow_nil: true
      validates :source_set_digest, format: { with: /\A\h{64}\z/ }, allow_nil: true
      validate :telehealth_provenance_is_complete
      validate :encounter_belongs_to_practice

      private

      def encounter_belongs_to_practice
        errors.add(:encounter, "must belong to the selected practice") if encounter && encounter.practice_id != practice_id
      end

      def telehealth_provenance_is_complete
        values = [ telehealth_visit_id, telehealth_recording_id, capture_epoch, recording_segment_index, source_order,
          source_set_digest ]
        return if values.none?(&:present?)
        errors.add(:telehealth_visit, "provenance is incomplete") unless values.all?(&:present?)
      end
    end
  end
end
