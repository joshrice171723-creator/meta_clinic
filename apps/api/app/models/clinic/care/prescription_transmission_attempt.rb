module Clinic
  module Care
    class PrescriptionTransmissionAttempt < ApplicationRecord
      self.table_name = "clinic_prescription_transmission_attempts"
      include Clinic::TenantScoped
      include Clinic::Auditable

      ADAPTER = "simulated_pharmacy_network".freeze
      SCHEMA_VERSION = "local-simulation-v1".freeze
      MODES = %w[standard controlled_test].freeze
      OUTCOMES = %w[failure_before_send rejected acknowledged unknown accepted unavailable revoked duplicate outcome_unknown].freeze

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :medication_request_revision, class_name: "Clinic::Care::MedicationRequestRevision"
      belongs_to :pharmacy_destination, class_name: "Clinic::Care::PharmacyDestination"
      belongs_to :prescription_event, class_name: "Clinic::Care::PrescriptionEvent"
      belongs_to :initiated_by_membership, class_name: "Clinic::Membership"
      belongs_to :review_event, class_name: "Clinic::Care::PrescriptionEvent", optional: true
      belongs_to :preparation, class_name: "Clinic::Care::PrescriptionPreparation", optional: true
      belongs_to :prior_attempt, class_name: "Clinic::Care::PrescriptionTransmissionAttempt", optional: true

      validates :preparation, presence: true, on: :create
      validates :adapter, inclusion: { in: [ ADAPTER ] }
      validates :mode, inclusion: { in: MODES }
      validates :outcome, inclusion: { in: OUTCOMES }
      validates :request_key, :submitted_at, presence: true
      validates :request_key, uniqueness: { scope: :practice_id }
      validate :context_matches
      validate :provenance_matches
      validate :preparation_matches

      before_update { throw :abort }
      before_destroy { throw :abort }

      def provenance_matches
        fields = %i[source transaction_type schema_version payload_digest correlation_id review_event_id prior_attempt_id]
        return if fields.all? { |field| public_send(field).nil? }

        errors.add(:source, "must identify the simulator") unless source == "simulation"
        errors.add(:transaction_type, "must identify NewRx") unless transaction_type == "NewRx"
        errors.add(:schema_version, "must identify the local payload") unless schema_version == SCHEMA_VERSION
        errors.add(:payload_digest, "must be a canonical SHA-256 digest") unless payload_digest.to_s.match?(/\A[0-9a-f]{64}\z/)
        errors.add(:correlation_id, "must be a UUID") unless correlation_id.to_s.match?(ClinicalPlanWorkflow::UUID_PATTERN)
        review = review_event
        errors.add(:review_event, "must review this exact patient, clinic and revision") unless review &&
          review.practice_id == practice_id && review.patient_id == patient_id &&
          review.medication_request_revision_id == medication_request_revision_id && review.kind == "review" && review.source == "manual"
        if prior_attempt_id
          prior = prior_attempt
          errors.add(:prior_attempt, "must precede this attempt in the same patient, clinic and series") unless prior &&
            prior.practice_id == practice_id && prior.patient_id == patient_id &&
            prior.medication_request_revision.series_id == medication_request_revision&.series_id &&
            (id.nil? || prior.id < id)
        end
      end

      def preparation_matches
        return unless preparation_id

        prepared = preparation
        errors.add(:preparation, "must match the exact prepared prescription") unless prepared &&
          prepared.practice_id == practice_id && prepared.patient_id == patient_id &&
          prepared.medication_request_revision_id == medication_request_revision_id &&
          prepared.pharmacy_destination_id == pharmacy_destination_id && prepared.review_event_id == review_event_id &&
          prepared.schema_version == schema_version && prepared.payload_digest == payload_digest && prepared.mode == mode &&
          prepared.destination_snapshot == destination_snapshot && prepared.signer_snapshot == signer_snapshot &&
          prepared.reviewer_snapshot == reviewer_snapshot
      end

      def context_matches
        order = medication_request_revision
        destination = pharmacy_destination
        event = prescription_event
        actor = initiated_by_membership
        errors.add(:medication_request_revision, "must match this patient and clinic") unless order &&
          order.practice_id == practice_id && order.patient_id == patient_id
        errors.add(:pharmacy_destination, "must belong to this clinic") unless destination&.practice_id == practice_id
        errors.add(:prescription_event, "must match this prescription") unless event &&
          event.practice_id == practice_id && event.patient_id == patient_id && event.medication_request_revision_id == order&.id &&
          event.source == "simulation" && event.kind == outcome && event.prior_event_id.nil? &&
          event.request_key == "prescription-event:#{request_key}"
        errors.add(:initiated_by_membership, "must belong to this clinic") unless actor&.practice_id == practice_id
      end
    end
  end
end
