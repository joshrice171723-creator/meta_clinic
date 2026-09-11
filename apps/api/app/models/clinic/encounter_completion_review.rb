module Clinic
  class EncounterCompletionReview < ApplicationRecord
    self.table_name = "clinic_encounter_completion_reviews"
    include TenantScoped
    include AppendOnly

    DISPOSITIONS = %w[
      completed_as_planned left_before_completion transferred_to_higher_level_of_care emergency_services other
    ].freeze
    INSTRUCTIONS_STATUSES = %w[provided not_required unable_to_complete].freeze
    EDUCATION_STATUSES = %w[recorded not_required unable_to_complete].freeze
    FOLLOW_UP_STATES = %w[not_required needed arranged completed].freeze

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :encounter, class_name: "Clinic::Encounter"
    belongs_to :follow_up, class_name: "Clinic::EncounterFollowUp"
    belongs_to :instruction_note, class_name: "Clinic::EncounterNote", optional: true
    belongs_to :instruction_note_revision, class_name: "Clinic::EncounterNoteRevision", optional: true
    belongs_to :recorded_by_membership, class_name: "Clinic::Membership"

    encrypts :exception_note

    validates :disposition_code, inclusion: { in: DISPOSITIONS }
    validates :instructions_status, inclusion: { in: INSTRUCTIONS_STATUSES }
    validates :education_status, inclusion: { in: EDUCATION_STATUSES }
    validates :follow_up_state, inclusion: { in: FOLLOW_UP_STATES }
    validates :follow_up_version, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
    validates :encounter_id, uniqueness: { scope: :practice_id }
    validates :request_key, format: { with: Clinic::Idempotency::KEY_PATTERN },
      uniqueness: { scope: %i[practice_id recorded_by_membership_id] }
    validates :recorded_at, presence: true
    validates :exception_note, length: { maximum: 2_000 }, allow_nil: true
    validate :context_matches
    validate :evidence_matches
    validate :open_work_snapshot_is_valid

    private

    def context_matches
      records = [ patient, encounter, follow_up, instruction_note, instruction_note_revision,
        recorded_by_membership ].compact
      if records.any? { |record| record.practice_id != practice_id }
        errors.add(:base, "Completion evidence must remain in one practice")
      end
      errors.add(:encounter, "must belong to this patient") if encounter && encounter.patient_id != patient_id
      if follow_up && (follow_up.patient_id != patient_id || follow_up.encounter_id != encounter_id)
        errors.add(:follow_up, "must belong to this patient encounter")
      end
      if instruction_note && (instruction_note.patient_id != patient_id || instruction_note.encounter_id != encounter_id)
        errors.add(:instruction_note, "must belong to this patient encounter")
      end
      if instruction_note_revision && instruction_note_revision.note_id != instruction_note_id
        errors.add(:instruction_note_revision, "must belong to the selected note")
      end
    end

    def evidence_matches
      if instructions_status == "provided"
        errors.add(:instruction_note, "is required") unless instruction_note
        errors.add(:instruction_note_revision, "is required") unless instruction_note_revision
      elsif instruction_note || instruction_note_revision
        errors.add(:base, "Instruction-note evidence is allowed only when instructions were provided")
      end
      if education_status == "recorded"
        errors.add(:education_event_ids, "must include at least one event") if education_event_ids.empty?
      elsif education_event_ids.any?
        errors.add(:education_event_ids, "must be empty unless education was recorded")
      end
      if exception_required? && exception_note.blank?
        errors.add(:exception_note, "is required for an exception outcome")
      end
    end

    def exception_required?
      disposition_code != "completed_as_planned" || instructions_status == "unable_to_complete" ||
        education_status == "unable_to_complete"
    end

    def open_work_snapshot_is_valid
      unless open_work_snapshot.is_a?(Array) && open_work_snapshot.all? { |item| valid_open_work_item?(item) }
        errors.add(:open_work_snapshot, "must contain supported task evidence")
      end
    end

    def valid_open_work_item?(item)
      item.is_a?(Hash) && item.keys.map(&:to_s).sort == %w[
        assigned_to_membership_id due_at id pool_code state task_kind version
      ].sort && item["id"].is_a?(Integer) && item["id"].positive? &&
        item["version"].is_a?(Integer) && item["version"] >= 0 &&
        Clinic::ClinicalTask::KINDS.include?(item["task_kind"].to_s) &&
        %w[open claimed in_progress].include?(item["state"].to_s) &&
        Clinic::ClinicalTask::POOLS.include?(item["pool_code"].to_s)
    end
  end
end
