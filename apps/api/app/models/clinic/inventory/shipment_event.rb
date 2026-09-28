module Clinic
  module Inventory
    class ShipmentEvent < ApplicationRecord
      self.table_name = "clinic_inventory_shipment_events"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      TRANSITIONS = {
        "expected" => %w[in_transit delivered exception],
        "in_transit" => %w[delayed out_for_delivery delivered exception],
        "delayed" => %w[in_transit out_for_delivery delivered exception],
        "out_for_delivery" => %w[delivered exception],
        "exception" => %w[in_transit delivered]
      }.freeze

      belongs_to :shipment, class_name: "Clinic::Inventory::Shipment", inverse_of: :shipment_events
      belongs_to :recorded_by_membership, class_name: "Clinic::Membership"

      validates :status, inclusion: { in: TRANSITIONS.values.flatten.uniq }
      validates :note, :request_key, :payload_digest, :recorded_at, presence: true
      validates :note, length: { in: 1..1000 }
      validates :request_key, length: { maximum: 160 }
      validates :payload_digest, format: { with: /\A[0-9a-f]{64}\z/ }
      validate :records_belong_to_practice

      def self.record!(shipment:, actor:, status:, note:, request_key:)
        status = status.to_s
        note = note.to_s.strip
        request_key = request_key.to_s
        membership = Clinic::Membership.active.find_by!(practice_id: shipment.practice_id, user_id: actor.id)
        digest = Digest::SHA256.hexdigest(JSON.generate([ shipment.id, actor.id, status, note ]))
        prior = find_by(practice_id: shipment.practice_id, request_key:)
        return prior if prior && prior.payload_digest == digest
        raise Clinic::Idempotency::Conflict unless prior.nil?

        shipment.with_lock do
          prior = find_by(practice_id: shipment.practice_id, request_key:)
          if prior
            raise Clinic::Idempotency::Conflict unless prior.payload_digest == digest
            next prior
          end
          raise Clinic::Idempotency::Conflict, "Receiving or reconciliation has already started." if shipment.receipts.exists? || shipment.reconciliation
          allowed = TRANSITIONS.fetch(shipment.effective_status, [])
          raise ArgumentError, "Choose a valid next shipment status: #{allowed.join(', ')}." unless allowed.include?(status)

          create!(practice_id: shipment.practice_id, shipment:, recorded_by_membership: membership,
            status:, note:, request_key:, payload_digest: digest, recorded_at: Current.business_time)
        end
      rescue ActiveRecord::RecordNotUnique
        prior = find_by!(practice_id: shipment.practice_id, request_key:)
        raise Clinic::Idempotency::Conflict unless prior.payload_digest == digest

        prior
      end

      private

      def records_belong_to_practice
        errors.add(:shipment, "must belong to this practice") if shipment && shipment.practice_id != practice_id
        if recorded_by_membership && recorded_by_membership.practice_id != practice_id
          errors.add(:recorded_by_membership, "must belong to this practice")
        end
      end
    end
  end
end
