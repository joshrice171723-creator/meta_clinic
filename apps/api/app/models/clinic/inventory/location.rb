module Clinic
  module Inventory
    class Location < ApplicationRecord
      self.table_name = "clinic_inventory_locations"
      include Clinic::TenantScoped
      include Clinic::Auditable
      has_many :batches, class_name: "Clinic::Inventory::PharmacyBatch", foreign_key: :location_id, dependent: :restrict_with_error
      validates :name, presence: true, length: { maximum: 100 }
      validates :kind, inclusion: { in: %w[storage quarantine returns controlled] }, allow_nil: true
      validates :address_line1, :address_line2, :city, :state, :postal_code, :country, length: { maximum: 120 }, allow_blank: true

      def shipping_address?
        [ address_line1, city, state, postal_code, country ].all?(&:present?)
      end

      def formatted_address
        return nil unless shipping_address?

        [ address_line1, address_line2.presence, [ city, state ].compact.join(", ") + " " + postal_code, country ]
          .compact.join("\n")
      end
    end
  end
end
