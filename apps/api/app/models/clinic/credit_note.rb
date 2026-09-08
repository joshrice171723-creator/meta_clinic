module Clinic
  class CreditNote < ApplicationRecord
    self.table_name = "clinic_credit_notes"
    include TenantScoped
    include AppendOnly

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :invoice, class_name: "Clinic::Invoice"
    belongs_to :issued_by_membership, class_name: "Clinic::Membership", optional: true

    encrypts :reason

    attr_readonly :practice_id, :patient_id, :invoice_id, :currency, :amount,
      :reason, :issued_by_membership_id, :issued_at

    validates :currency, presence: true, format: { with: /\A[A-Z]{3}\z/ }
    validates :amount, numericality: { greater_than: 0 }
    validates :reason, length: { maximum: 500 }, allow_nil: true
    validate :invoice_belongs_to_patient
    validate :issuer_belongs_to_practice
    validate :issuance_evidence_is_complete

    private

    def invoice_belongs_to_patient
      return unless invoice

      errors.add(:invoice, "must belong to this practice") if invoice.practice_id != practice_id
      errors.add(:invoice, "must belong to this patient") if invoice.patient_id != patient_id
    end

    def issuer_belongs_to_practice
      return unless issued_by_membership

      errors.add(:issued_by_membership, "must belong to this practice") if issued_by_membership.practice_id != practice_id
    end

    def issuance_evidence_is_complete
      evidence = [ reason, issued_by_membership_id, issued_at ]
      return if evidence.all?(&:blank?) || evidence.all?(&:present?)

      errors.add(:base, "Credit issuance evidence must be recorded together")
    end
  end
end
