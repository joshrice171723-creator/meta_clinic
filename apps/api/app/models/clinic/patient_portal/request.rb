module Clinic
  module PatientPortal
    class Request < ApplicationRecord
      self.table_name = "clinic_patient_portal_requests"
      include Clinic::TenantScoped
      include Clinic::Auditable

      enum :request_type, { message: "message", refill: "refill" }, validate: true
      enum :status, { pending: "pending", in_review: "in_review", resolved: "resolved", declined: "declined" }, validate: true

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :identity, class_name: "Clinic::PatientPortal::Identity"

      encrypts :content, :review_note

      scope :recent, -> { order(requested_at: :desc, id: :desc) }

      validates :request_key, presence: true, format: { with: /\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}\z/ }
      validates :content_digest, presence: true, length: { is: 64 }, format: { with: /\A\h{64}\z/ }
      validates :requested_at, :content, presence: true
      validates :review_note, length: { maximum: 1_000 }, allow_nil: true
      validate :records_belong_to_practice
      validate :structured_refill_content, if: -> { refill? && (new_record? || will_save_change_to_content?) }
      validate :structured_terminal_refill_outcome, if: -> { refill? && status.in?(%w[resolved declined]) }

      private

      def records_belong_to_practice
        { patient: patient, identity: identity }.each do |attribute, record|
          errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
        end
        errors.add(:patient, "must match the portal identity") if patient && identity && identity.patient_id != patient_id
      end

      def structured_refill_content
        details = RefillRequestData.parse_content(content)
        %w[medication_name pharmacy_destination].each do |field|
          errors.add(:content, "must include #{field.humanize.downcase}") if details[field].to_s.strip.empty?
        end
        errors.add(:content, "medication name is too long") if details["medication_name"].to_s.length > 240
        errors.add(:content, "pharmacy destination is too long") if details["pharmacy_destination"].to_s.length > 500
        errors.add(:content, "request note is too long") if details["request_note"].to_s.length > 2_000
        unless details["source"].in?(%w[patient staff])
          errors.add(:content, "must identify whether the patient or clinic staff opened the request")
        end
      end

      def structured_terminal_refill_outcome
        outcome = RefillRequestData.parse_outcome(review_note)
        expected_decisions = declined? ? %w[declined] : %w[approved changed]
        errors.add(:review_note, "must include the refill decision") unless outcome["decision"].in?(expected_decisions)
        if outcome["patient_message"].to_s.strip.empty?
          errors.add(:review_note, "must include a patient-visible outcome")
        end
        errors.add(:review_note, "patient-visible outcome is too long") if outcome["patient_message"].to_s.length > 600
        errors.add(:review_note, "reconciliation note is too long") if outcome["reconciliation_note"].to_s.length > 200
        if outcome["decision"].in?(%w[approved changed]) && outcome["reconciliation_acknowledged"] != true
          errors.add(:review_note, "must acknowledge medication reconciliation")
        end
      end
    end
  end
end
