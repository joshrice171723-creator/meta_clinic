module Clinic
  class MembershipProspect < ApplicationRecord
    self.table_name = "clinic_membership_prospects"

    include Clinic::TenantScoped
    include Clinic::Auditable

    IMMUTABLE_INTAKE_FIELDS = %w[
      practice_id subscription_version_id request_key request_digest display_name
      email_address phone_number email_digest phone_digest selected_terms source
      outreach_consent intent_type
    ].freeze

    belongs_to :subscription_version, class_name: "Clinic::Care::SubscriptionVersion"
    belongs_to :account_user, class_name: "User", optional: true
    belongs_to :reviewed_by_membership, class_name: "Clinic::Membership", optional: true
    belongs_to :patient, class_name: "Clinic::Care::Patient", optional: true
    belongs_to :portal_identity, class_name: "Clinic::PatientPortal::Identity", optional: true
    belongs_to :agreement, class_name: "Clinic::Care::SubscriptionAgreement", optional: true
    belongs_to :receipt, class_name: "Clinic::BillingReceipt", optional: true
    belongs_to :onboarding_task, class_name: "Clinic::ClinicalTask", optional: true

    enum :status, {
      new: "new",
      contacted: "contacted",
      qualified: "qualified",
      invited: "invited",
      converted: "converted",
      declined: "declined",
      checkout_pending: "checkout_pending",
      payment_processing: "payment_processing",
      paid_onboarding: "paid_onboarding",
      checkout_expired: "checkout_expired",
      payment_failed: "payment_failed"
    }, prefix: true, validate: true

    encrypts :display_name, :email_address, :phone_number, :portal_setup_token

    validates :request_key, presence: true, length: { maximum: 160 },
      format: { with: /\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}\z/ }, uniqueness: { scope: :practice_id }
    validates :request_digest, presence: true, format: { with: /\A\h{64}\z/ }
    validates :email_digest, format: { with: /\A\h{64}\z/ }, allow_nil: true
    validates :phone_digest, format: { with: /\A\h{64}\z/ }, allow_nil: true
    validates :display_name, presence: true, length: { maximum: 120 }
    validates :email_address, length: { maximum: 320 }, allow_nil: true
    validates :phone_number, length: { maximum: 40 }, allow_nil: true
    validates :portal_setup_token, length: { maximum: 200 }, allow_nil: true
    validates :account_setup_token_digest, format: { with: /\A\h{64}\z/ }, allow_nil: true
    validates :accepted_terms_version, length: { maximum: 80 }, allow_nil: true
    validates :source, length: { maximum: 80 }, allow_nil: true
    validates :selected_terms, presence: true
    validates :outreach_consent, inclusion: { in: [ true, false ] }
    validates :intent_type, inclusion: { in: %w[outreach purchase] }
    validates :checkout_reference, format: { with: /\Aci_[a-f0-9]{32}\z/ }, allow_nil: true,
      uniqueness: true
    validates :checkout_account_id, format: { with: /\Aacct_[a-zA-Z0-9]+\z/ }, allow_nil: true
    validates :checkout_mode, inclusion: { in: %w[payment subscription] }, allow_nil: true
    validates :application_fee_cents, numericality: { only_integer: true, greater_than_or_equal_to: 0 },
      allow_nil: true
    validate :selected_terms_are_an_object
    validate :has_reachable_contact
    validate :related_records_belong_to_practice
    validate :pipeline_state_is_complete
    validate :intake_is_immutable, on: :update

    def possible_duplicate?
      candidates = self.class.where(practice_id: practice_id).where.not(id: id).where.not(status: "declined")
      matches = candidates.none
      matches = matches.or(candidates.where(email_digest: email_digest)) if email_digest
      matches = matches.or(candidates.where(phone_digest: phone_digest)) if phone_digest

      matches.exists?
    end

    def relationship_stage
      patient_id ? "patient" : "prospective_patient"
    end

    private

    def selected_terms_are_an_object
      errors.add(:selected_terms, "must be an object") unless selected_terms.is_a?(Hash)
    end

    def has_reachable_contact
      errors.add(:base, "Provide an email address or phone number") if email_address.blank? && phone_number.blank?
      errors.add(:email_address, "is required to purchase a membership") if intent_type == "purchase" && email_address.blank?
    end

    def related_records_belong_to_practice
      return unless practice_id

      [ subscription_version, reviewed_by_membership, patient, portal_identity, agreement, receipt,
        onboarding_task ].compact.each do |record|
        errors.add(:base, "Membership prospect context must belong to this practice") if record.practice_id != practice_id
      end
      if portal_identity && patient && portal_identity.patient_id != patient.id
        errors.add(:portal_identity, "must belong to the prospect patient")
      end
    end

    def pipeline_state_is_complete
      if status.in?(%w[contacted qualified declined payment_processing paid_onboarding converted]) &&
          (reviewed_by_membership.nil? || reviewed_at.nil?)
        errors.add(:base, "Reviewed membership and time are required after intake")
      end
      if status_paid_onboarding? || status_converted?
        errors.add(:base, "Paid onboarding records are incomplete") unless
          patient && portal_identity && agreement && receipt && onboarding_task && invited_at && paid_at
      end
      errors.add(:converted_at, "is required after conversion") if status_converted? && converted_at.nil?
    end

    def intake_is_immutable
      changed = IMMUTABLE_INTAKE_FIELDS.select { |field| will_save_change_to_attribute?(field) }
      errors.add(:base, "Submitted membership details cannot be changed") if changed.any?
    end
  end
end
