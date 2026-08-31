module Clinic
  module Inventory
    class PharmacyBatch < ApplicationRecord
      self.table_name = "clinic_pharmacy_batches"
      STATUSES = %w[active quarantined recalled].freeze
      belongs_to :practice, class_name: "Clinic::Practice"
      belongs_to :product, class_name: "Clinic::Inventory::PharmacyProduct"
      belongs_to :lot, class_name: "Clinic::Inventory::Lot"
      has_many :movements, class_name: "Clinic::Inventory::PharmacyMovement", foreign_key: :batch_id, dependent: :restrict_with_error
      has_many :events, class_name: "Clinic::Inventory::PharmacyBatchEvent", foreign_key: :batch_id, dependent: :restrict_with_error
      has_many :holds, class_name: "Clinic::Inventory::Hold", foreign_key: :batch_id
      has_many :counts, class_name: "Clinic::Inventory::Count", foreign_key: :batch_id
      validates :lot_number, :location, presence: true, length: { maximum: 100 }
      validates :supplier, length: { maximum: 120 }
      validates :expires_on, presence: true
      validates :lot_number, uniqueness: { scope: [ :product_id, :location ] }
      before_validation :resolve_position, on: :create
      attr_readonly :practice_id, :product_id, :lot_number, :location, :expires_on, :supplier, :lot_id, :location_id

      NO_HOLD_SQL = "NOT EXISTS (SELECT 1 FROM clinic_inventory_holds h WHERE h.batch_id=clinic_pharmacy_batches.id AND NOT EXISTS (SELECT 1 FROM clinic_inventory_hold_releases r WHERE r.hold_id=h.id))".freeze
      scope :usable, ->(day = Date.current) { where(NO_HOLD_SQL).where("expires_on >= ?", day) }

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
        !active_holds.exists? && !expired? && product.active?
      end

      def expiring?
        available? && quantity.positive? && expires_on <= practice.inventory_date + 30
      end

      def display_status
        return "expired" if expired?
        return "inactive product" unless product.active?
        status
      end

      def move!(kind:, amount:, reason:, actor:, request_key:)
        if kind == "receipt"
          receipt = Clinic::Inventory::Receiving.call(practice: practice, actor: actor, reason: reason, request_key: request_key, supplier: supplier,
            lines: [ { product_id: product_id, lot_number: lot_number, location: location, expires_on: expires_on, amount: amount, input_unit: product.stock_unit } ])
          reload
          return movements.find_by!(receipt_line_id: receipt.lines.sole.id)
        end
        direction = PharmacyMovement::KINDS.fetch(kind) { raise ArgumentError, "Choose a supported movement." }
        count = Clinic::Inventory::Quantity.parse(amount, scale: product.quantity_scale)
        attributes = { practice_id: practice_id, batch_id: id, actor_id: actor.id, kind: kind, quantity: count * direction, reason: reason, request_key: request_key }
        Clinic::Inventory::Access.with(practice_id, actor, "adjust") do |profile|
          Clinic::Inventory::Access.retry_lock(practice_id, request_key)
          PharmacyProduct.lock("FOR SHARE").find(product_id)
          with_lock do
            existing = PharmacyMovement.find_by(practice_id: practice_id, request_key: request_key)
            if existing
              raise ArgumentError, "This form was already used for a different movement. Reload and try again." unless attributes.all? { |key, value| existing.public_send(key) == value }
              return existing
            end
            raise ArgumentError, "Reactivate this product before adding stock." if direction.positive? && !product.reload.active?
            raise ArgumentError, "This movement would make stock negative or exceed 1,000,000." unless (quantity + attributes[:quantity]).between?(0, 1_000_000)
            movement = movements.create!(attributes.merge(stock_unit: product.stock_unit, profile_id: profile.id, occurred_at: Time.current))
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
        return unless lot_number.present? && location.present? && expires_on.present?
        self.lot ||= Lot.find_or_create_by!(practice_id: practice_id, product_id: product_id, number: lot_number) { |record| record.expires_on = expires_on }
        errors.add(:expires_on, "does not match the recorded manufacturing lot") unless lot.expires_on == expires_on
        self.location_id ||= Location.create_or_find_by!(practice_id: practice_id, name: location).id
      end
    end
  end
end
