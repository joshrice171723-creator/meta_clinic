module Clinic
  class PracticeFeatureVersion < ApplicationRecord
    self.table_name = "clinic_practice_feature_versions"
    include TenantScoped
    include AppendOnly

    belongs_to :created_by_membership, class_name: "Clinic::Membership"
    belongs_to :site, class_name: "Clinic::Site", optional: true

    validates :revision, numericality: { only_integer: true, greater_than: 0 }
    validates :effective_from, :request_key, :content_digest, presence: true
    validates :request_key, uniqueness: { scope: :practice_id }
    validate :membership_belongs_to_practice
    validate :site_belongs_to_practice

    private

    def membership_belongs_to_practice
      return if created_by_membership&.practice_id == practice_id

      errors.add(:created_by_membership, "must belong to this practice")
    end

    def site_belongs_to_practice
      errors.add(:site, "must belong to this clinic") if site && site.practice_id != practice_id
    end
  end
end
