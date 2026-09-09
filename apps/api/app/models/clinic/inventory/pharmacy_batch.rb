module Clinic
  module Inventory
    class PharmacyBatch < ApplicationRecord
      self.table_name = "clinic_pharmacy_batches"
      STATUSES = %w[active quarantined recalled].freeze
      include Clinic::TenantScoped
      include Clinic::Auditable
      belongs_to :product, class_name: "Clinic::Inventory::PharmacyProduct"
      belongs_to :lot, class_name: "Clinic::Inventory::Lot"
      has_many :receipt_lines, class_name: "Clinic::Inventory::ReceiptLine", foreign_key: :batch_id, dependent: :restrict_with_error
      has_many :movements, class_name: "Clinic::Inventory::PharmacyMovement", foreign_key: :batch_id, dependent: :restrict_with_error
      has_many :events, class_name: "Clinic::Inventory::PharmacyBatchEvent", foreign_key: :batch_id, dependent: :restrict_with_error
      has_many :holds, class_name: "Clinic::Inventory::Hold", foreign_key: :batch_id
      has_many :counts, class_name: "Clinic::Inventory::Count", foreign_key: :batch_id
      belongs_to :location_record, class_name: "Clinic::Inventory::Location", foreign_key: :location_id
      validates :lot_number, :location, presence: true, length: { maximum: 100 }
      validates :supplier, length: { maximum: 120 }
      validates :expires_on, presence: true
      validates :lot_number, uniqueness: { scope: [ :product_id, :location_id ] }
      before_validation :resolve_position, on: :create
      attr_readonly :practice_id, :product_id, :lot_number, :location, :expires_on, :supplier, :lot_id, :location_id

      NO_HOLD_SQL = "NOT EXISTS (SELECT 1 FROM clinic_inventory_holds h WHERE h.batch_id=clinic_pharmacy_batches.id AND NOT EXISTS (SELECT 1 FROM clinic_inventory_hold_releases r WHERE r.hold_id=h.id))".freeze
      STOCK_DESTINATION_SQL = <<~SQL.squish.freeze
        EXISTS (
          SELECT 1 FROM clinic_inventory_locations inventory_location
          WHERE inventory_location.id=clinic_pharmacy_batches.location_id
            AND inventory_location.practice_id=clinic_pharmacy_batches.practice_id
            AND inventory_location.status='active'
            AND NOT EXISTS (
              SELECT 1 FROM clinic_inventory_locations inventory_child
              WHERE inventory_child.practice_id=inventory_location.practice_id
                AND inventory_child.parent_location_id=inventory_location.id
            )
            AND (
              inventory_location.site_id IS NULL OR EXISTS (
                SELECT 1 FROM clinic_sites inventory_site
                WHERE inventory_site.id=inventory_location.site_id
                  AND inventory_site.practice_id=inventory_location.practice_id
                  AND inventory_site.status='active'
              )
            )
        )
      SQL
      scope :usable, ->(day = Current.business_date) { where(NO_HOLD_SQL).where(STOCK_DESTINATION_SQL).where("clinic_pharmacy_batches.expires_on >= ?", day) }

      def quantity
        self[:on_hand]
      end

      def expired?
        expires_on < practice.inventory_date
      end

      def active_holds
        holds.active
      end

      def status
        kinds = active_holds.pluck(:kind)
        kinds.include?("recalled") ? "recalled" : kinds.any? ? "quarantined" : "active"
      end

      def available?
        !active_holds.exists? && !expired? && product.active? && location_record.stock_destination?
      end

      def transferable?
        !active_holds.exists? && !expired? && product.active? && location_record.stock_leaf?
      end

      def expiring?
        available? && quantity.positive? && expires_on <= practice.inventory_date + 30
      end

      def display_status
        return "expired" if expired?
        return "inactive product" unless product.active?
        status
      end

      def move!(kind:, amount:, reason:, actor:, request_key:, occurred_at: Current.business_time)
        if kind == "receipt"
          receipt = Clinic::Inventory::Receiving.call(practice: practice, actor: actor, reason: reason, request_key: request_key, supplier: supplier,
            lines: [ { product_id: product_id, lot_number: lot_number, location_id: location_id, location: location, expires_on: expires_on, amount: amount, input_unit: product.stock_unit } ], received_at: occurred_at)
          reload
          return movements.find_by!(receipt_line_id: receipt.lines.sole.id)
        end
        direction = PharmacyMovement::KINDS.fetch(kind) { raise ArgumentError, "Choose a supported movement." }
        count = Clinic::Inventory::Quantity.parse(amount, scale: product.quantity_scale)
        attributes = { practice_id: practice_id, batch_id: id, actor_id: actor.id, kind: kind, quantity: count * direction, reason: reason, request_key: request_key }
        Clinic::Inventory::Access.with(practice_id, actor, "adjust") do |profile|
          Clinic::Inventory::Access.retry_lock(practice_id, request_key)
          PharmacyProduct.lock("FOR SHARE").find(product_id)
          location_record.lock!
          with_lock do
            existing = PharmacyMovement.find_by(practice_id: practice_id, request_key: request_key)
            if existing
              raise ArgumentError, "This form was already used for a different movement. Reload and try again." unless attributes.all? { |key, value| existing.public_send(key) == value }
              return existing
            end
            location_record.ensure_stock_destination! if direction.positive?
            raise ArgumentError, "Reactivate this product before adding stock." if direction.positive? && !product.reload.active?
            raise ArgumentError, "This movement would make stock negative or exceed 1,000,000." unless (quantity + attributes[:quantity]).between?(0, 1_000_000)
            movement = movements.create!(attributes.merge(stock_unit: product.stock_unit, profile_id: profile.id, occurred_at: occurred_at, created_at: occurred_at, updated_at: occurred_at))
            reload
            movement
          end
        end
      end

      def change_status!(status:, reason:, actor:, request_key:, hold_id: nil)
        raise ArgumentError, "Choose a supported hold or release." unless (STATUSES + %w[temperature damaged]).include?(status)
        Clinic::Inventory::Access.with(practice_id, actor, status == "active" ? "release" : "hold") do
          Clinic::Inventory::Access.retry_lock(practice_id, request_key)
          with_lock do
            existing = events.find_by(request_key: request_key)
            if existing
              evidence = status == "active" ? HoldRelease.find_by(practice_id: practice_id, request_key: request_key) : holds.find_by(request_key: request_key)
              matches = evidence && (status == "active" ? (hold_id.blank? || evidence.hold_id == hold_id.to_i) : evidence.kind == status)
              raise ArgumentError, "This form was already used. Reload and try again." unless matches && existing.reason == reason && existing.actor_id == actor.id
              return existing
            end
            previous = self.status
            if status == "active"
              held = hold_id.present? ? active_holds.find(hold_id) : active_holds.sole
              if held.recall_id.present?
                raise ArgumentError, "Recall holds remain as evidence. Record disposition through the recall case."
              end
              HoldRelease.create!(practice_id: practice_id, hold_id: held.id, actor_id: actor.id, reason: reason, request_key: request_key)
            else
              holds.create!(practice_id: practice_id, actor_id: actor.id, kind: status, reason: reason, request_key: request_key)
            end
            events.create!(practice_id: practice_id, actor: actor, from_status: previous, to_status: self.status, reason: reason, request_key: request_key)
          end
        end
      rescue ActiveRecord::SoleRecordExceeded
        raise ArgumentError, "Choose the specific hold to release; other holds remain active."
      end

      private

      def resolve_position
        return unless lot_number.present? && expires_on.present? && (location_id.present? || location.present?)

        self.lot ||= Lot.find_or_create_by!(practice_id: practice_id, product_id: product_id, number: lot_number) { |record| record.expires_on = expires_on }
        errors.add(:expires_on, "does not match the recorded manufacturing lot") unless lot.expires_on == expires_on

        resolved = if location_id.present?
          Location.where(practice_id: practice_id).find_by(id: location_id)
        else
          matches = Location.where(practice_id: practice_id, name: location).limit(2).to_a
          if matches.many?
            errors.add(:location, "matches more than one inventory bin; provide location_id")
            nil
          else
            matches.first || Location.create_or_find_by!(practice_id: practice_id, site_id: nil, parent_location_id: nil, name: location) do |record|
              record.status = "active"
            end
          end
        end
        unless resolved
          errors.add(:location_record, "must belong to this clinic") if location_id.present?
          return
        end

        errors.add(:location_record, "must be an active stock destination") unless resolved.stock_destination?
        self.location_record = resolved
        self.location = resolved.name
      end
    end
  end
end
