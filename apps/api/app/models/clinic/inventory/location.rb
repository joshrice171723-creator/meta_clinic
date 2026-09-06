module Clinic
  module Inventory
    class Location < ApplicationRecord
      self.table_name = "clinic_inventory_locations"
      KINDS = %w[storage quarantine returns controlled].freeze
      RESTRICTED_KINDS = %w[quarantine returns controlled].freeze
      STATUSES = %w[active retired].freeze

      include Clinic::TenantScoped
      include Clinic::Auditable
      belongs_to :site, class_name: "Clinic::Site", optional: true
      belongs_to :parent_location, class_name: "Clinic::Inventory::Location", optional: true
      has_many :children, class_name: "Clinic::Inventory::Location", foreign_key: :parent_location_id, dependent: :restrict_with_error
      has_many :batches, class_name: "Clinic::Inventory::PharmacyBatch", foreign_key: :location_id, dependent: :restrict_with_error
      validates :name, presence: true, length: { maximum: 100 }
      validates :name, uniqueness: { scope: %i[practice_id site_id parent_location_id] }
      validates :kind, inclusion: { in: KINDS }, allow_nil: true
      validates :status, inclusion: { in: STATUSES }
      validates :address_line1, :address_line2, :city, :state, :postal_code, :country, length: { maximum: 120 }, allow_blank: true
      validate :hierarchy_is_valid
      before_destroy :prevent_destroy

      def stock_destination?
        stock_leaf? && (site.nil? || site.status == "active")
      end

      def stock_leaf?
        status == "active" && !children.any?
      end

      def ensure_stock_destination!
        raise ArgumentError, "Choose an active inventory bin without child locations at an active facility." unless stock_destination?

        self
      end

      def restricted_kind
        current = self
        seen = {}
        while current && !seen[current.id]
          seen[current.id] = true
          return current.kind if RESTRICTED_KINDS.include?(current.kind)

          current = current.parent_location
        end
        nil
      end

      def shipping_address?
        [ address_line1, city, state, postal_code, country ].all?(&:present?)
      end

      def formatted_address
        return nil unless shipping_address?

        [ address_line1, address_line2.presence, [ city, state ].compact.join(", ") + " " + postal_code, country ]
          .compact.join("\n")
      end

      private

      def prevent_destroy
        errors.add(:base, "Inventory locations are retired so their custody history remains available.")
        throw :abort
      end

      def hierarchy_is_valid
        if site_id.present? && (!site || site.practice_id != practice_id)
          errors.add(:site, "must belong to this clinic")
        elsif status == "active" && site && site.status != "active"
          errors.add(:site, "must be active for an active inventory location")
        end

        return if parent_location_id.blank?

        unless parent_location && parent_location.practice_id == practice_id
          errors.add(:parent_location, "must belong to this clinic")
          return
        end
        errors.add(:parent_location, "must be active") unless parent_location.status == "active"
        errors.add(:site, "must match the parent location") if site_id != parent_location.site_id

        inherited_kind = parent_location.restricted_kind
        if inherited_kind && kind != inherited_kind
          errors.add(:kind, "must remain #{inherited_kind} beneath a restricted location")
        end

        ancestor = parent_location
        seen = { id => true }.compact
        while ancestor
          if seen[ancestor.id]
            errors.add(:parent_location, "cannot create a cycle")
            break
          end
          seen[ancestor.id] = true
          ancestor = ancestor.parent_location
        end
      end
    end
  end
end
