module Clinic
  module Scribe
    class RecordingChunk < ApplicationRecord
      self.table_name = "clinic_scribe_recording_chunks"
      include TenantScoped

      belongs_to :recording, class_name: "Clinic::Scribe::Recording", inverse_of: :chunks

      encrypts :content

      validates :status, inclusion: { in: %w[acknowledged scrubbed] }
      validates :sequence, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
      validates :byte_size, numericality: { only_integer: true, greater_than: 0 }
      validates :content_digest, length: { is: 64 }
      validates :content, presence: true, if: -> { status == "acknowledged" }
      validates :content, absence: true, if: -> { status == "scrubbed" }
      validate :recording_belongs_to_practice

      private

      def recording_belongs_to_practice
        errors.add(:recording, "must belong to the selected practice") if recording && recording.practice_id != practice_id
      end
    end
  end
end
