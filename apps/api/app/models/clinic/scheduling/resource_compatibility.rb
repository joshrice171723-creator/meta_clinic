module Clinic
  module Scheduling
    class ResourceCompatibility < ApplicationRecord
      self.table_name = "clinic_resource_compatibilities"
      include TenantScoped
      include AppendOnly
      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :service_offering, class_name: "Clinic::ServiceOffering"
      belongs_to :written_by_membership, class_name: "Clinic::Membership"
      def self.current(practice:, site:, offering:)
        where(practice: practice, site: site, service_offering: offering).order(revision: :desc).first
      end
      def snapshot
        { service_offering_id: service_offering_id, revision: revision, mode: mode, chair_ids: chair_ids, equipment_ids: equipment_ids }
      end
    end
  end
end
