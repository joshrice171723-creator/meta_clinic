module Clinic
  class ServiceOffering < ApplicationRecord
    self.table_name = "clinic_service_offerings"

    include TenantScoped
    include Auditable

    belongs_to :visit_type, class_name: "Clinic::VisitType", optional: true
    belongs_to :billing_service, class_name: "Clinic::BillingService", optional: true
    has_many :offering_sites, class_name: "Clinic::ServiceOfferingSite", dependent: :restrict_with_error
    has_many :sites, through: :offering_sites, class_name: "Clinic::Site"
    has_many :offering_clinicians, class_name: "Clinic::ServiceOfferingClinician", dependent: :restrict_with_error
    has_many :clinicians, through: :offering_clinicians, class_name: "Clinic::ClinicianProfile"

    validates :name, presence: true, length: { maximum: 160 }
    validates :code, length: { maximum: 50 }, uniqueness: { scope: :practice_id }, allow_nil: true
    validates :description, length: { maximum: 500 }, allow_nil: true
    validates :duration_minutes, numericality: { only_integer: true, in: 5..1440 }, allow_nil: true
    validates :modality, inclusion: { in: %w[in_person video either] }
    validates :status, inclusion: { in: %w[draft published retired] }
    validates :booking_required, :requires_room, :public_visible, inclusion: { in: [ true, false ] }
    validates :lock_version, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
    validate :related_records_belong_to_practice
    validate :published_configuration, if: :published?

    def published?
      status == "published"
    end

    private

    def related_records_belong_to_practice
      { visit_type: visit_type, billing_service: billing_service }.each do |attribute, record|
        errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
      end
    end

    def published_configuration
      errors.add(:visit_type, "is required before publishing") unless visit_type
      errors.add(:duration_minutes, "is required before publishing") unless duration_minutes
      errors.add(:sites, "must include at least one eligible site before publishing") if sites.empty?
      if requires_room && sites.any? && sites.none? { |site| site.rooms.any? }
        errors.add(:sites, "must include a site with a room when a room is required")
      end
    end
  end
end
