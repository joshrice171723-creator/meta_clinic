module Clinic
  class RecallEvent < ApplicationRecord
    self.table_name = "clinic_recall_events"
    include TenantScoped
    include AppendOnly

    EVENT_TYPES = %w[outreach_recorded snoozed excluded completed reopened].freeze
    CHANNELS = %w[phone voicemail sms email portal mail in_person other].freeze
    CLINICAL_STATES = %w[needed arranged completed].freeze

    belongs_to :follow_up, class_name: "Clinic::EncounterFollowUp"
    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :encounter, class_name: "Clinic::Encounter"
    belongs_to :actor_membership, class_name: "Clinic::Membership"

    encrypts :reason, :completion_evidence

    validates :event_type, inclusion: { in: EVENT_TYPES }
    validates :previous_clinical_state, :resulting_clinical_state, inclusion: { in: CLINICAL_STATES }
    validates :request_key, presence: true, length: { maximum: 160 },
      format: { with: Clinic::Idempotency::KEY_PATTERN }
    validates :source_version, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
    validates :channel, inclusion: { in: CHANNELS }, allow_nil: true
    validates :reason, length: { maximum: 1_000 }, allow_nil: true
    validates :completion_evidence, length: { maximum: 4_000 }, allow_nil: true
    validates :occurred_at, presence: true
    validate :canonical_links_match
    validate :evidence_matches_event

    private

    def canonical_links_match
      records = [ follow_up, patient, encounter, actor_membership ].compact
      errors.add(:base, "Every recall event must belong to the same practice") if records.any? {
        |record| record.practice_id != practice_id
      }
      return unless follow_up

      if follow_up.patient_id != patient_id || follow_up.encounter_id != encounter_id
        errors.add(:follow_up, "must belong to this patient and encounter")
      end
    end

    def evidence_matches_event
      case event_type
      when "outreach_recorded"
        errors.add(:channel, "is required") if channel.blank?
      when "snoozed"
        errors.add(:reason, "is required") if reason.blank?
        errors.add(:snoozed_until, "is required") unless snoozed_until
      when "excluded", "reopened"
        errors.add(:reason, "is required") if reason.blank?
      when "completed"
        errors.add(:completion_evidence, "is required") if completion_evidence.blank?
      end
    end
  end
end
