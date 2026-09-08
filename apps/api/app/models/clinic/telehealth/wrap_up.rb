module Clinic
  module Telehealth
    class WrapUp < ApplicationRecord
      self.table_name = "clinic_telehealth_wrap_ups"
      include Clinic::TenantScoped
      include Clinic::Auditable

      OUTCOMES = %w[completed technical_failure follow_up_needed].freeze
      FOLLOW_UP_STATUSES = %w[none needed arranged].freeze
      SCRIBE_REVIEW_STATUSES = %w[not_used reviewed deferred].freeze

      belongs_to :visit, class_name: "Clinic::Telehealth::Visit"
      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :appointment, class_name: "Clinic::Appointment"
      belongs_to :encounter, class_name: "Clinic::Encounter"
      belongs_to :instruction_note, class_name: "Clinic::EncounterNote", optional: true
      belongs_to :instruction_note_revision, class_name: "Clinic::EncounterNoteRevision", optional: true
      belongs_to :instruction_note_signature, class_name: "Clinic::EncounterNoteSignature", optional: true
      belongs_to :follow_up_appointment, class_name: "Clinic::Appointment", optional: true
      belongs_to :scribe_encounter, class_name: "Clinic::Scribe::Encounter", optional: true
      belongs_to :scribe_draft, class_name: "Clinic::Scribe::Draft", optional: true
      belongs_to :scribe_export, class_name: "Clinic::Scribe::Export", optional: true
      belongs_to :scribe_encounter_note, class_name: "Clinic::EncounterNote", optional: true
      belongs_to :scribe_encounter_note_revision, class_name: "Clinic::EncounterNoteRevision", optional: true
      belongs_to :created_by_membership, class_name: "Clinic::Membership"
      belongs_to :updated_by_membership, class_name: "Clinic::Membership"
      belongs_to :finalized_by_membership, class_name: "Clinic::Membership", optional: true

      encrypts :clinician_notes, :patient_instructions, :follow_up_plan

      enum :status, { draft: "draft", finalized: "finalized" }, validate: true
      validates :outcome, inclusion: { in: OUTCOMES }, allow_nil: true
      validates :follow_up_status, inclusion: { in: FOLLOW_UP_STATUSES }, allow_nil: true
      validates :scribe_review_status, inclusion: { in: SCRIBE_REVIEW_STATUSES }, allow_nil: true
      validates :clinician_notes, length: { maximum: 8_000 }
      validates :patient_instructions, :follow_up_plan, length: { maximum: 4_000 }
      validate :canonical_links_match
      validate :follow_up_evidence_matches
      validate :finalization_is_complete
      validate :finalized_record_is_immutable, on: :update

      private

      def canonical_links_match
        return unless visit

        errors.add(:patient, "must match the video visit") unless patient_id == visit.patient_id
        errors.add(:appointment, "must match the video visit") unless appointment_id == visit.appointment_id
        errors.add(:encounter, "must match the video visit") unless encounter_id == visit.encounter_id
        related = [ patient, appointment, encounter, instruction_note, instruction_note_revision,
          instruction_note_signature, follow_up_appointment, scribe_encounter, scribe_draft, scribe_export,
          scribe_encounter_note, scribe_encounter_note_revision, created_by_membership, updated_by_membership,
          finalized_by_membership ].compact
        errors.add(:base, "Every wrap-up record must belong to the visit practice") if related.any? {
          |record| record.practice_id != practice_id
        }
      end

      def follow_up_evidence_matches
        if follow_up_status == "arranged"
          errors.add(:follow_up_appointment, "is required for an arranged follow-up") unless follow_up_appointment
        elsif follow_up_appointment
          errors.add(:follow_up_appointment, "is only allowed for an arranged follow-up")
        end
        return unless follow_up_appointment

        errors.add(:follow_up_appointment, "must belong to this patient") unless follow_up_appointment.patient_id == patient_id
        errors.add(:follow_up_appointment, "must be after this visit") unless follow_up_appointment.starts_at > appointment.ends_at
        errors.add(:follow_up_appointment, "must still be scheduled") unless follow_up_appointment.status.in?(%w[scheduled confirmed])
      end

      def finalization_is_complete
        return unless finalized?

        errors.add(:outcome, "is required") if outcome.blank?
        errors.add(:patient_instructions, "are required") if patient_instructions.blank?
        errors.add(:follow_up_status, "is required") if follow_up_status.blank?
        errors.add(:follow_up_plan, "is required") if follow_up_status.in?(%w[needed arranged]) && follow_up_plan.blank?
        errors.add(:scribe_review_status, "is required") if scribe_review_status.blank?
        errors.add(:instruction_note_revision, "is required") unless instruction_note_revision
        errors.add(:instruction_note_signature, "is required") unless instruction_note_signature
        errors.add(:finalized_by_membership, "is required") unless finalized_by_membership
        errors.add(:finalized_at, "is required") unless finalized_at
      end

      def finalized_record_is_immutable
        errors.add(:base, "A finalized wrap-up cannot be changed") if status_was == "finalized"
      end
    end
  end
end
