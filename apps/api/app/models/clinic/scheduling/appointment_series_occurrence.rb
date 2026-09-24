module Clinic
  module Scheduling
    class AppointmentSeriesOccurrence < ApplicationRecord
      self.table_name = "clinic_appointment_series_occurrences"
      include TenantScoped

      belongs_to :series, class_name: "Clinic::Scheduling::AppointmentSeries"
      belongs_to :appointment, class_name: "Clinic::Appointment", optional: true
      belongs_to :resolved_by_membership, class_name: "Clinic::Membership"

      encrypts :skip_reason
    end
  end
end
