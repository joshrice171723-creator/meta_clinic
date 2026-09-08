module Clinic
  module Scribe
    class Recording < ApplicationRecord
      self.table_name = "clinic_scribe_recordings"
      include TenantScoped
      include Auditable

      belongs_to :encounter, class_name: "Clinic::Scribe::Encounter"
      belongs_to :created_by, class_name: "User"
      belongs_to :telehealth_visit, class_name: "Clinic::Telehealth::Visit", optional: true
      belongs_to :capture_owner_participant, class_name: "Clinic::Telehealth::Participant", optional: true
      has_many :chunks, class_name: "Clinic::Scribe::RecordingChunk", foreign_key: :recording_id,
        dependent: :restrict_with_error, inverse_of: :recording

      validates :status, inclusion: { in: %w[recording interrupted completed cancelled] }
      validates :mime_type, inclusion: { in: %w[audio/webm audio/ogg audio/mp4] }
      validates :idempotency_key, :request_digest, :consent_policy_version, :consented_at, presence: true
      validates :idempotency_key, length: { maximum: 120 }, uniqueness: { scope: :practice_id }
      validates :request_digest, length: { is: 64 }
      validates :total_bytes, :expected_encounter_version,
        numericality: { only_integer: true, greater_than_or_equal_to: 0 }
      validates :duration_ms, numericality: { only_integer: true, greater_than_or_equal_to: 0 }, allow_nil: true
      validates :capture_source, inclusion: { in: %w[microphone telehealth_mix] }
      validates :capture_epoch, numericality: { only_integer: true, greater_than: 0 }, allow_nil: true
      validates :recording_segment_index, numericality: { only_integer: true, greater_than_or_equal_to: 0 }, allow_nil: true
      validates :source_order, numericality: { only_integer: true, greater_than: 0 }, allow_nil: true
      validate :telehealth_capture_is_complete
      validates :total_chunks, numericality: { only_integer: true, greater_than_or_equal_to: 0 }, allow_nil: true
      validate :encounter_belongs_to_practice

      def unfinished?
        status.in?(%w[recording interrupted])
      end

      private

      def encounter_belongs_to_practice
        errors.add(:encounter, "must belong to the selected practice") if encounter && encounter.practice_id != practice_id
      end

      def telehealth_capture_is_complete
        values = [ telehealth_visit_id, capture_owner_participant_id, capture_epoch, recording_segment_index, source_order ]
        if capture_source == "telehealth_mix"
          errors.add(:telehealth_visit, "is required for a telehealth recording") unless values.all?(&:present?)
        elsif values.any?(&:present?)
          errors.add(:capture_source, "must identify telehealth mixed audio")
        end
      end
    end
  end
end
