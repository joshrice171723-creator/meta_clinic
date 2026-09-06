module Clinic
  class RoleGrant < ApplicationRecord
    self.table_name = "clinic_role_grants"
    include TenantScoped
    include Auditable

    enum :scope_kind, { practice: "practice", site: "site" }, validate: true

    belongs_to :membership, class_name: "Clinic::Membership"
    belongs_to :role_version
    belongs_to :site, class_name: "Clinic::Site", optional: true
    has_many :events, class_name: "Clinic::RoleGrantEvent", foreign_key: :grant_id, dependent: :restrict_with_error

    scope :active, ->(at = Current.business_time) {
      where("effective_from <= ? AND (effective_until IS NULL OR effective_until > ?) AND revoked_at IS NULL", at, at)
    }

    def applies_to?(requested_site)
      return true if practice?
      requested_site.present? && site_id == (requested_site.respond_to?(:id) ? requested_site.id : requested_site)
    end

    validates :revision, numericality: { only_integer: true, greater_than: 0 }
    validates :effective_from, presence: true
    validate :scope_matches_site
    validate :related_records_belong_to_practice
    before_destroy { throw :abort }

    private

    def scope_matches_site
      errors.add(:site, "must be blank for a practice grant") if practice? && site_id.present?
      errors.add(:site, "is required for a site grant") if site? && site_id.blank?
    end

    def related_records_belong_to_practice
      { membership: membership, site: site }.each do |attribute, record|
        errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
      end
    end
  end
end
