module Clinic
  class Invoice < ApplicationRecord
    self.table_name = "clinic_invoices"
    include TenantScoped
    include Auditable

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :encounter, class_name: "Clinic::Encounter", optional: true
    belongs_to :voided_by_membership, class_name: "Clinic::Membership", optional: true
    has_many :lines, class_name: "Clinic::InvoiceLine", dependent: :restrict_with_error
    has_many :payment_allocations, class_name: "Clinic::PaymentAllocation", dependent: :restrict_with_error
    has_many :payment_collection_intents, class_name: "Clinic::PaymentCollectionIntent", dependent: :restrict_with_error
    has_many :invoice_stripe_checkouts, class_name: "Clinic::Billing::InvoiceStripeCheckout", dependent: :restrict_with_error
    has_one :subscription_agreement, class_name: "Clinic::Care::SubscriptionAgreement", dependent: :restrict_with_error
    has_many :credit_notes, class_name: "Clinic::CreditNote", dependent: :restrict_with_error
    has_many :insurance_claims, class_name: "Clinic::InsuranceClaim", dependent: :restrict_with_error

    scope :recent, -> { order(created_at: :desc) }

    encrypts :void_reason

    STATES = {
      "draft" => %w[posted],
      "posted" => %w[void],
      "void" => []
    }.freeze

    def transition_to!(target)
      target = target.to_s
      raise ArgumentError, "Invoice cannot transition from #{status}." unless STATES.fetch(status, []).include?(target)

      update!(status: target)
    end

    validates :currency, presence: true, format: { with: /\A[A-Z]{3}\z/ }
    validates :rounding_policy_version, presence: true
    validates :status, inclusion: { in: STATES.keys }
    validates :void_reason, length: { maximum: 500 }, allow_nil: true
    validate :checkout_encounter_is_completed_and_scoped
    validate :voider_belongs_to_practice
    validate :void_evidence_is_complete
    validate :void_evidence_is_immutable, on: :update

    private

    def checkout_encounter_is_completed_and_scoped
      return unless encounter

      errors.add(:encounter, "must belong to this practice") if encounter.practice_id != practice_id
      errors.add(:encounter, "must belong to this patient") if encounter.patient_id != patient_id
      errors.add(:encounter, "must be completed before checkout") unless encounter.status == "completed" && encounter.ended_at.present?
    end

    def voider_belongs_to_practice
      return unless voided_by_membership

      errors.add(:voided_by_membership, "must belong to this practice") if voided_by_membership.practice_id != practice_id
    end

    def void_evidence_is_complete
      evidence = [ void_reason, voided_by_membership_id, voided_at ]
      return if evidence.all?(&:blank?) || evidence.all?(&:present?)

      errors.add(:base, "Invoice void evidence must be recorded together")
    end

    def void_evidence_is_immutable
      evidence_already_recorded = [
        attribute_in_database("void_reason"),
        attribute_in_database("voided_by_membership_id"),
        attribute_in_database("voided_at")
      ].any?(&:present?)
      return unless evidence_already_recorded
      return unless will_save_change_to_void_reason? || will_save_change_to_voided_by_membership_id? || will_save_change_to_voided_at?

      errors.add(:base, "Invoice void evidence cannot be changed")
    end
  end
end
