module Clinic
  class ServiceInquiry < ApplicationRecord
    self.table_name = "clinic_service_inquiries"
    include TenantScoped
    include Auditable

    belongs_to :service_offering, class_name: "Clinic::ServiceOffering"
    encrypts :display_name, :email_address, :phone_number

    validates :request_key, presence: true, length: { maximum: 160 }, uniqueness: { scope: :practice_id }
    validates :request_digest, format: { with: /\A[0-9a-f]{64}\z/ }
    validates :display_name, presence: true, length: { maximum: 120 }
    validates :email_address, length: { maximum: 320 }, allow_nil: true
    validates :phone_number, length: { maximum: 40 }, allow_nil: true
    validates :status, inclusion: { in: %w[new contacted closed] }
    validates :outreach_consent_at, presence: true
    validate :contact_and_offering

    private

    def contact_and_offering
      errors.add(:base, "Provide an email address or phone number") if email_address.blank? && phone_number.blank?
      errors.add(:service_offering, "must belong to this clinic") if service_offering && service_offering.practice_id != practice_id
    end
  end
end
