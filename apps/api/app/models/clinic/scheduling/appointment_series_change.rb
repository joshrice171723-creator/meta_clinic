module Clinic
  module Scheduling
    class AppointmentSeriesChange < ApplicationRecord
      self.table_name = "clinic_appointment_series_changes"
      include TenantScoped

      belongs_to :series, class_name: "Clinic::Scheduling::AppointmentSeries"
      belongs_to :written_by_membership, class_name: "Clinic::Membership"
    end
  end
end
