module Clinic
  module Care
    class ServiceOption < ApplicationRecord
      self.table_name = "clinic_service_options"
      include Clinic::TenantScoped
      include Clinic::Auditable
      validates :name, presence: true, length: { maximum: 160 }
      validates :description, length: { maximum: 4000 }
    end
  end
end
