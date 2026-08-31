module Clinic
  class EncounterNoteRevision < ApplicationRecord
    self.table_name = "clinic_encounter_note_revisions"
    include TenantScoped
    include AppendOnly

    belongs_to :note, class_name: "Clinic::EncounterNote"
    belongs_to :prior_revision, class_name: "Clinic::EncounterNoteRevision", optional: true
    belongs_to :author_membership, class_name: "Clinic::Membership"
    has_many :subsequent_revisions, class_name: "Clinic::EncounterNoteRevision", foreign_key: :prior_revision_id, dependent: :restrict_with_error
    has_many :signatures, class_name: "Clinic::EncounterNoteSignature", foreign_key: :revision_id, dependent: :restrict_with_error

    validates :revision_no, :payload_version, numericality: { only_integer: true, greater_than: 0 }
    validates :encrypted_body, presence: true
    validate :predecessor_is_same_note

    scope :chronological, -> { order(:revision_no) }

    private

    def predecessor_is_same_note
      errors.add(:prior_revision, "must belong to the same note") if prior_revision && prior_revision.note_id != note_id
    end
  end
end
