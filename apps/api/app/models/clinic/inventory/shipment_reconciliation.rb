module Clinic
  module Inventory
    class ShipmentReconciliation < ApplicationRecord
      self.table_name = "clinic_inventory_shipment_reconciliations"
      include Clinic::TenantScoped
      include Clinic::AppendOnly
      KINDS = %w[short_delivery damaged wrong_item wrong_lot temperature expiry excess other].freeze
      belongs_to :shipment, class_name: "Clinic::Inventory::Shipment"
      belongs_to :receipt, class_name: "Clinic::Inventory::Receipt", optional: true
      belongs_to :actor, class_name: "User"
      belongs_to :profile, class_name: "Clinic::Inventory::Profile"
      validates :exception, inclusion: { in: KINDS }
      validates :reason, presence: true, length: { maximum: 200 }

      def self.normalize(input)
        return unless input
        values = input.symbolize_keys
        %i[missing_packages rejected_packages excess_packages].to_h do |key|
          [ key, Quantity.parse(values.fetch(key, "0").to_s, scale: 0, zero: true).to_s("F") ]
        end.merge(exception: values[:exception].to_s.strip)
      end
    end
  end
end
