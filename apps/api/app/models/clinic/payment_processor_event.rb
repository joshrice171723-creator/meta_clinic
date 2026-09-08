module Clinic
  class PaymentProcessorEvent < ApplicationRecord
    self.table_name = "clinic_payment_processor_events"
    include TenantScoped
    include Auditable

    belongs_to :patient, class_name: "Clinic::Care::Patient", optional: true
    belongs_to :payment_collection_intent, class_name: "Clinic::PaymentCollectionIntent", optional: true

    validates :processor, presence: true, format: { with: /\A[a-z][a-z0-9_.-]{0,39}\z/ }
    validates :processor_event_reference, presence: true, length: { maximum: 200 },
      uniqueness: { scope: [ :practice_id, :processor ] }
    validates :event_type, presence: true, length: { maximum: 120 }
    validates :raw_payload_digest, presence: true, format: { with: /\A[0-9a-f]{64}\z/ }
    validates :normalized_outcome, inclusion: { in: %w[succeeded failed processing canceled unknown] }
    validates :processing_state, inclusion: {
      in: %w[received signature_verified normalized applied ignored_duplicate rejected needs_reconciliation]
    }
    validate :linked_records_share_scope
    validate :immutable_processor_identity, on: :update

    private

    def linked_records_share_scope
      [ patient, payment_collection_intent ].compact.each do |record|
        errors.add(:base, "linked payment records must belong to this practice") if record.practice_id != practice_id
      end
      if patient && payment_collection_intent && patient_id != payment_collection_intent.patient_id
        errors.add(:patient, "must match the collection intent patient")
      end
    end

    def immutable_processor_identity
      %w[practice_id processor processor_event_reference raw_payload_digest verified_at].each do |attribute|
        errors.add(attribute, "cannot be changed") if will_save_change_to_attribute?(attribute)
      end
    end
  end
end
