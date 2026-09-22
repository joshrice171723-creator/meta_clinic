module Clinic
  class ServiceOfferingSite < ApplicationRecord
    self.table_name = "clinic_service_offering_sites"

    include TenantScoped

    belongs_to :service_offering, class_name: "Clinic::ServiceOffering"
    belongs_to :site, class_name: "Clinic::Site"

    validates :site_id, uniqueness: { scope: [ :practice_id, :service_offering_id ] }
    validate :related_records_belong_to_practice

    private

    def related_records_belong_to_practice
      errors.add(:service_offering, "must belong to this practice") if service_offering && service_offering.practice_id != practice_id
      errors.add(:site, "must belong to this practice") if site && site.practice_id != practice_id
    end
  end
end
