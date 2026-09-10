module Clinic
  module Care
    class ServiceRequest < ChartCoverageRecord
      self.table_name = "clinic_service_requests"
      include Clinic::Auditable

      KINDS = %w[lab imaging procedure immunization referral other].freeze
      STATUSES = %w[draft active in_progress completed cancelled not_done].freeze
      PRIORITIES = %w[routine urgent as_needed].freeze

      has_many :procedures, class_name: "Clinic::Care::Procedure", dependent: :restrict_with_error
      has_many :immunizations, class_name: "Clinic::Care::Immunization", dependent: :restrict_with_error
      has_many :lab_reports, class_name: "Clinic::Care::LabReport", dependent: :restrict_with_error

      encrypts :request_text, :reason_text
      validates :service_kind, inclusion: { in: KINDS }
      validates :status, inclusion: { in: STATUSES }
      validates :priority, inclusion: { in: PRIORITIES }
      validates :request_text, presence: true, length: { maximum: 4_000 }
      validates :reason_text, length: { maximum: 2_000 }, allow_nil: true
      validates :requested_at, presence: true
    end
  end
end
