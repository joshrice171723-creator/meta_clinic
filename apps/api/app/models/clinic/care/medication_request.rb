module Clinic
  module Care
    class MedicationRequest < ChartCoverageRecord
      self.table_name = "clinic_medication_requests"
      include Clinic::Auditable

      STATUSES = %w[draft active completed cancelled not_done].freeze
      PRIORITIES = %w[routine urgent as_needed].freeze

      has_many :medication_administrations, class_name: "Clinic::Care::MedicationAdministration", dependent: :restrict_with_error

      encrypts :medication_name, :dose_text, :route_text, :frequency_text, :reason_text
      validates :status, inclusion: { in: STATUSES }
      validates :priority, inclusion: { in: PRIORITIES }
      validates :medication_name, presence: true, length: { maximum: 500 }
      validates :dose_text, :route_text, :frequency_text, :reason_text, length: { maximum: 2_000 }, allow_nil: true
      validates :requested_at, presence: true
      validate :acknowledgement_matches_status

      private

      def acknowledgement_matches_status
        return unless acknowledged_at && !status.in?(%w[active completed not_done])

        errors.add(:acknowledged_at, "requires an active or terminal local request")
      end
    end
  end
end
