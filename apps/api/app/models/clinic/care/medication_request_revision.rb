module Clinic
  module Care
    class MedicationRequestRevision < ApplicationRecord
      self.table_name = "clinic_medication_request_revisions"
      include Clinic::ClinicalRevision

      STATUSES = %w[draft authorized on_hold completed cancelled entered_in_error].freeze
      INTENTS = %w[proposal plan order].freeze
      TRANSMISSION_STATES = %w[not_requested pending accepted rejected failed unknown].freeze

      belongs_to :prior_revision, class_name: name, optional: true
      belongs_to :source_medication_statement, class_name: "Clinic::Care::MedicationStatement", optional: true

      encrypts :medication_name, :dose_text, :route_text, :frequency_text, :quantity_text, :instructions
      validates :status, inclusion: { in: STATUSES }
      validates :intent, inclusion: { in: INTENTS }
      validates :transmission_state, inclusion: { in: TRANSMISSION_STATES }
      validates :medication_name, presence: true, length: { maximum: 400 }
      validates :dose_text, :route_text, :frequency_text, :quantity_text, length: { maximum: 400 }, allow_nil: true
      validates :instructions, length: { maximum: 2_000 }, allow_nil: true
      validate :source_statement_matches

      private

      def source_statement_matches
        return unless source_medication_statement
        expected = [ practice_id, patient_id ]
        actual = [ source_medication_statement.practice_id, source_medication_statement.patient_id ]
        errors.add(:source_medication_statement, "must belong to this patient") unless actual == expected
      end
    end
  end
end
