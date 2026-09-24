module Clinic
  class Room < ApplicationRecord
    self.table_name = "clinic_rooms"
    include TenantScoped
    include Auditable

    belongs_to :site, class_name: "Clinic::Site"
    has_many :appointments, class_name: "Clinic::Appointment", dependent: :restrict_with_error
    has_many :encounters, class_name: "Clinic::Encounter", dependent: :restrict_with_error

    validates :code, presence: true, length: { maximum: 80 }, uniqueness: { scope: [ :practice_id, :site_id ] }
    validates :kind, inclusion: { in: %w[physical telehealth] }
    validate :site_belongs_to_practice

    private

    def site_belongs_to_practice
      errors.add(:site, "must belong to this practice") if site && site.practice_id != practice_id
    end
  end
end
