module Clinic
  module Scheduling
    class AppointmentSeries < ApplicationRecord
      self.table_name = "clinic_appointment_series"
      include TenantScoped

      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :booked_clinician, class_name: "Clinic::ClinicianProfile"
      belongs_to :visit_type, class_name: "Clinic::VisitType"
      belongs_to :room, class_name: "Clinic::Room", optional: true
      belongs_to :service_offering, class_name: "Clinic::ServiceOffering", optional: true
      belongs_to :created_by_membership, class_name: "Clinic::Membership"
      has_many :occurrences, class_name: "Clinic::Scheduling::AppointmentSeriesOccurrence",
        foreign_key: :series_id, dependent: :restrict_with_error
      has_many :series_changes, class_name: "Clinic::Scheduling::AppointmentSeriesChange",
        foreign_key: :series_id, dependent: :restrict_with_error
    end
  end
end
