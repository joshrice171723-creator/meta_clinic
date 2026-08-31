module Clinic
  class PharmacyBatch < ApplicationRecord
    self.table_name = "clinic_pharmacy_batches"
    STATUSES = %w[active quarantined recalled].freeze
    belongs_to :product, class_name: "Clinic::PharmacyProduct"
    has_many :movements, class_name: "Clinic::PharmacyMovement", foreign_key: :batch_id, dependent: :restrict_with_error
    has_many :events, class_name: "Clinic::PharmacyBatchEvent", foreign_key: :batch_id, dependent: :restrict_with_error
    validates :lot_number, :location, presence: true, length: { maximum: 100 }
    validates :supplier, length: { maximum: 120 }
    validates :expires_on, presence: true
    validates :status, inclusion: { in: STATUSES }
    validates :lot_number, uniqueness: { scope: [ :product_id, :location ] }
    attr_readonly :practice_id, :product_id, :lot_number, :location, :expires_on, :supplier

    def quantity
      movements.sum(&:quantity)
    end

    def expired?
      expires_on < Date.current
    end

    def available?
      status == "active" && !expired? && product.active?
    end

    def expiring?
      available? && quantity.positive? && expires_on <= 30.days.from_now.to_date
    end

    def display_status
      return "expired" if expired?
      return "inactive product" unless product.active?
      status
    end

    def move!(kind:, amount:, reason:, actor:, request_key:)
      count = Integer(amount.to_s, 10)
      raise ArgumentError, "Enter 1–1,000,000 whole packages." unless count.between?(1, 1_000_000)
      direction = PharmacyMovement::KINDS.fetch(kind) { raise ArgumentError, "Choose a supported movement." }
      attributes = { practice_id: practice_id, batch_id: id, actor_id: actor.id, kind: kind, quantity: count * direction, reason: reason, request_key: request_key }
      with_lock do
        authorize_actor!(actor)
        existing = PharmacyMovement.find_by(practice_id: practice_id, request_key: request_key)
        if existing
          raise ArgumentError, "This form was already used for a different movement. Reload and try again." unless attributes.all? { |key, value| existing.public_send(key) == value }
          return existing
        end
        raise ArgumentError, "Reactivate this product before adding stock." if direction.positive? && !product.active?
        total = movements.sum(:quantity) + attributes[:quantity]
        raise ArgumentError, "This movement would make stock negative or exceed 1,000,000 packages." unless total.between?(0, 1_000_000)
        movements.create!(attributes)
      end
    end

    def change_status!(status:, reason:, actor:, request_key:)
      with_lock do
        authorize_actor!(actor)
        existing = PharmacyBatchEvent.find_by(practice_id: practice_id, request_key: request_key)
        if existing
          raise ArgumentError, "This form was already used. Reload and try again." unless existing.batch_id == id && existing.to_status == status && existing.reason == reason && existing.actor_id == actor.id
          return existing
        end
        raise ArgumentError, "Choose a different batch status." if status == self.status
        event = events.create!(practice_id: practice_id, actor: actor, from_status: self.status, to_status: status, reason: reason, request_key: request_key)
        update!(status: status)
        event
      end
    end

    private

    def authorize_actor!(actor)
      raise ArgumentError, "Inventory access is no longer active." unless Membership.active.exists?(practice_id: practice_id, user_id: actor.id, inventory_access: true)
    end
  end
end
