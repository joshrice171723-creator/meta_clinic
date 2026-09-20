module Clinic
  module Care
    class PharmacyDestination < ApplicationRecord
      self.table_name = "clinic_pharmacy_destinations"
      include Clinic::TenantScoped
      include Clinic::Auditable

      validates :name, :address_line1, :city, :state_code, :postal_code, presence: true
      validates :name, :address_line1, length: { maximum: 240 }
      validates :address_line2, length: { maximum: 240 }, allow_nil: true
      validates :city, length: { maximum: 120 }
      validates :state_code, format: { with: /\A[A-Z]{2}\z/ }
      validates :postal_code, length: { maximum: 16 }
      validates :phone_number, :pharmacy_identifier, length: { maximum: 100 }, allow_nil: true
      validates :pharmacy_identifier, uniqueness: { scope: :practice_id }, allow_nil: true

      def snapshot
        slice(:id, :name, :address_line1, :address_line2, :city, :state_code, :postal_code,
          :phone_number, :pharmacy_identifier)
      end
    end
  end
end
