module Clinic
  class EncounterNoteSignature < ApplicationRecord
    self.table_name = "clinic_encounter_note_signatures"
    include TenantScoped
    include AppendOnly

    belongs_to :note, class_name: "Clinic::EncounterNote"
    belongs_to :revision, class_name: "Clinic::EncounterNoteRevision"
    belongs_to :signer_membership, class_name: "Clinic::Membership"

    validates :content_digest, :attestation_version, :signed_at, presence: true
    validate :revision_is_for_note

    private

    def revision_is_for_note
      errors.add(:revision, "must belong to the signed note") if revision && revision.note_id != note_id
    end
  end
end
