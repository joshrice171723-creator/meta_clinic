module Clinic
  class DocumentMetadataRevision < ApplicationRecord
    self.table_name = "clinic_document_metadata_revisions"
    include TenantScoped
    encrypts :content
    # Protected supplied values stay in encrypted content, not model-version snapshots.
    has_paper_trail on: [:create], skip: [:content], versions: { class_name: "Clinic::ModelVersion" },
      meta: { practice_id: :practice_id, actor_reference: ->(_record) { PaperTrail.request.whodunnit }, occurred_at: ->(_record) { Time.current } }
    before_update { throw :abort }
    before_destroy { throw :abort }

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :document, class_name: "Clinic::Document"
    belongs_to :configuration, class_name: "Clinic::DocumentProvenanceConfiguration"
    belongs_to :recorded_by_membership, class_name: "Clinic::Membership"
    belongs_to :prior_revision, class_name: "Clinic::DocumentMetadataRevision", optional: true
    validates :revision, numericality: { only_integer: true, greater_than: 0 }, uniqueness: { scope: %i[practice_id document_id] }
    validates :request_key, :recorded_at, :content, :object_version, :checksum, presence: true
    validate :context_valid

    def payload = JSON.parse(content)

    def context_valid
      errors.add(:document, "must match this patient and clinic") unless document && document.practice_id == practice_id && document.patient_id == patient_id
      errors.add(:configuration, "must explicitly configure this document category") unless configuration &&
        configuration.practice_id == practice_id && configuration.category_id == document&.category_id && configuration.applicable
      errors.add(:recorded_by_membership, "must belong to this clinic") unless recorded_by_membership&.practice_id == practice_id
      if revision == 1
        errors.add(:prior_revision, "must be absent on initial metadata") if prior_revision_id
      elsif !prior_revision || prior_revision.practice_id != practice_id || prior_revision.document_id != document_id ||
          prior_revision.patient_id != patient_id || prior_revision.revision != revision.to_i - 1
        errors.add(:prior_revision, "must immediately precede this metadata revision")
      end
      Documents::Provenance.normalize_content(payload, fields: configuration&.fields || [], correction: revision.to_i > 1)
    rescue JSON::ParserError, ArgumentError, TypeError
      errors.add(:content, "must contain valid configured supplied metadata")
    end
  end
end
