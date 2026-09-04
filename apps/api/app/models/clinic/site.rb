module Clinic
  class Site < ApplicationRecord
    self.table_name = "clinic_sites"
    include TenantScoped
    include Auditable

    has_many :rooms, class_name: "Clinic::Room", dependent: :restrict_with_error
    has_many :clinician_assignments, class_name: "Clinic::ClinicianAssignment", dependent: :restrict_with_error
    has_many :appointments, class_name: "Clinic::Appointment", dependent: :restrict_with_error
    has_many :encounters, class_name: "Clinic::Encounter", dependent: :restrict_with_error
    has_many :role_grants, class_name: "Clinic::RoleGrant", dependent: :restrict_with_error
    has_many :operating_hours, class_name: "Clinic::SiteOperatingHour", dependent: :restrict_with_error
    has_many :hour_exceptions, class_name: "Clinic::SiteHourException", dependent: :restrict_with_error

    validates :code, presence: true, length: { maximum: 80 }, uniqueness: { scope: :practice_id }
    validates :name, presence: true, length: { maximum: 120 }
    validates :status, inclusion: { in: %w[draft active temporarily_closed retired] }
    validates :timezone_override, inclusion: { in: ActiveSupport::TimeZone::MAPPING.values + [ "UTC" ] }, allow_nil: true
    validates :address_line1, :address_line2, :city, :state, :postal_code, :country, :phone, :contact_name, :contact_email, length: { maximum: 320 }, allow_blank: true
    before_validation :default_name_from_code, on: :create

    def shipping_address?
      [ address_line1, city, state, postal_code, country ].all?(&:present?)
    end

    def formatted_address
      return nil unless shipping_address?

      [ address_line1, address_line2.presence, [ city, state ].compact.join(", ") + " " + postal_code, country ]
        .compact.join("\n")
    end

    private

    def default_name_from_code
      self.name = code if name.blank? && code.present?
    end
  end
end
