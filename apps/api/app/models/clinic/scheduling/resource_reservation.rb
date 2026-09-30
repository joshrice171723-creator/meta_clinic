module Clinic
  module Scheduling
    class ResourceReservation < ApplicationRecord
      self.table_name = "clinic_resource_reservations"
      include TenantScoped
      belongs_to :appointment, class_name: "Clinic::Appointment"
      belongs_to :resource, class_name: "Clinic::Scheduling::Resource"
      belongs_to :resource_compatibility, class_name: "Clinic::Scheduling::ResourceCompatibility"
    end
  end
end
