module Clinic
  module ClinicalRevision
    extend ActiveSupport::Concern

    included do
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :encounter, class_name: "Clinic::Encounter"
      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :recorded_by_membership, class_name: "Clinic::Membership"

      validates :series_id, :recorded_at, :request_key, :content_digest, presence: true
      validates :version_number, numericality: { only_integer: true, greater_than: 0 }
      validates :request_key, format: { with: Clinic::Idempotency::KEY_PATTERN },
        uniqueness: { scope: %i[practice_id recorded_by_membership_id] }
      validates :content_digest, format: { with: /\A[0-9a-f]{64}\z/ }
      validate :clinical_context_matches
      validate :revision_chain_matches
    end

    private

    def clinical_context_matches
      { patient:, encounter:, site:, recorded_by_membership: }.each do |attribute, record|
        errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
      end
      errors.add(:encounter, "must belong to this patient") if encounter && encounter.patient_id != patient_id
      errors.add(:site, "must match the encounter facility") if encounter && encounter.site_id != site_id
    end

    def revision_chain_matches
      if version_number == 1
        errors.add(:prior_revision, "must be blank for the first revision") if prior_revision_id.present?
        return
      end
      unless prior_revision
        errors.add(:prior_revision, "is required after the first revision")
        return
      end
      expected = [ practice_id, patient_id, encounter_id, site_id, series_id, version_number - 1 ]
      actual = [ prior_revision.practice_id, prior_revision.patient_id, prior_revision.encounter_id,
        prior_revision.site_id, prior_revision.series_id, prior_revision.version_number ]
      errors.add(:prior_revision, "must be the immediately preceding revision") unless actual == expected
    end
  end
end
