module Clinic
  module Inventory
    class ManageLocation
      ATTRIBUTES = %i[
        name kind status site_id parent_location_id address_line1 address_line2 city state postal_code country
      ].freeze
      IDENTITY_ATTRIBUTES = %w[name kind site_id parent_location_id].freeze

      def self.call(practice:, actor:, attributes:, location_id: nil)
        values = attributes.to_h.symbolize_keys.slice(*ATTRIBUTES)
        normalize!(values)

        Location.transaction do
          locked_practice = Clinic::Practice.lock.find(practice.id)
          Access.with(locked_practice.id, actor, "configure") do
            location = location_id.present? ? Location.where(practice_id: locked_practice.id).lock.find(location_id) : Location.new(practice: locked_practice)
            location.status ||= "active"

            parent = if values.key?(:parent_location_id) && values[:parent_location_id].present?
              Location.where(practice_id: locked_practice.id).lock.find(values[:parent_location_id])
            elsif !values.key?(:parent_location_id)
              location.parent_location
            end
            site = if values.key?(:site_id) && values[:site_id].present?
              Clinic::Site.where(practice_id: locked_practice.id).lock.find(values[:site_id])
            elsif !values.key?(:site_id)
              location.site
            end

            values.delete(:parent_location_id)
            values.delete(:site_id)
            location.assign_attributes(values)
            location.parent_location = parent
            location.site = site
            location.country ||= "US"

            protect_history!(location)
            protect_parent!(location)
            protect_retirement!(location)
            location.save!
            location
          end
        end
      end

      def self.normalize!(values)
        %i[name kind status address_line1 address_line2 city state postal_code country].each do |key|
          values[key] = values[key].to_s.strip.presence if values.key?(key)
        end
        %i[site_id parent_location_id].each do |key|
          values[key] = values[key].presence if values.key?(key)
        end
      end
      private_class_method :normalize!

      def self.protect_history!(location)
        return unless location.persisted?
        return unless IDENTITY_ATTRIBUTES.any? { |attribute| location.will_save_change_to_attribute?(attribute) }
        if location.batches.exists?
          raise ArgumentError, "A location with inventory history cannot be renamed, reparented, moved to another facility, or change kind."
        end
        if location.children.exists?
          raise ArgumentError, "A parent location cannot be renamed, reparented, moved to another facility, or change kind."
        end
      end
      private_class_method :protect_history!

      def self.protect_parent!(location)
        parent = location.parent_location
        return unless parent
        return unless location.new_record? || location.will_save_change_to_parent_location_id?
        return unless parent.batches.exists?

        raise ArgumentError, "A location with inventory history cannot become a parent location."
      end
      private_class_method :protect_parent!

      def self.protect_retirement!(location)
        return unless location.status == "retired" && location.will_save_change_to_status?
        raise ArgumentError, "Move or remove all on-hand stock before retiring this location." if location.batches.where("on_hand > 0").exists?
        raise ArgumentError, "Retire active child locations before retiring their parent." if location.children.where(status: "active").exists?
      end
      private_class_method :protect_retirement!
    end
  end
end
