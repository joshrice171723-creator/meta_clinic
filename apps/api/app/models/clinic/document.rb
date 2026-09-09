module Clinic
  class Document < ApplicationRecord
    self.table_name = "clinic_documents"
    include TenantScoped
    include Auditable

    enum :scan_state, {
      pending: "pending",
      quarantined: "quarantined",
      clean: "clean",
      rejected: "rejected"
    }, validate: true

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :encounter, class_name: "Clinic::Encounter", optional: true
    belongs_to :category, class_name: "Clinic::DocumentCategory"
    has_many :message_attachments, class_name: "Clinic::MessageAttachment", dependent: :restrict_with_error

    scope :downloadable, -> { where(scan_state: :clean) }
    scope :recent, -> { order(created_at: :desc) }

    validates :object_key, :object_version, :checksum, :media_type, :scan_state, presence: true
    validates :byte_size, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
    validate :encounter_belongs_to_patient
    before_destroy { throw :abort }

    private

    def encounter_belongs_to_patient
      return unless encounter

      errors.add(:encounter, "must belong to this practice") if encounter.practice_id != practice_id
      errors.add(:encounter, "must belong to this patient") if encounter.patient_id != patient_id
    end
  end
end
