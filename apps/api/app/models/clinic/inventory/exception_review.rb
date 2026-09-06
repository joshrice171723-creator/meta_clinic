module Clinic
  module Inventory
    class ExceptionReview < ApplicationRecord
      self.table_name = "clinic_inventory_exception_reviews"

      SOURCE_KINDS = %w[batch hold reconciliation].freeze
      CATEGORIES = %w[expiring expired inactive_product inactive_location hold delivery_discrepancy].freeze
      STATES = %w[open reviewed].freeze
      SOURCE_CATEGORIES = {
        "batch" => %w[expiring expired inactive_product inactive_location],
        "hold" => %w[hold],
        "reconciliation" => %w[delivery_discrepancy]
      }.freeze

      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :actor, class_name: "User"
      belongs_to :assignee, class_name: "User", optional: true
      belongs_to :profile, class_name: "Clinic::Inventory::Profile"

      validates :source_kind, inclusion: { in: SOURCE_KINDS }
      validates :category, inclusion: { in: CATEGORIES }
      validates :state, inclusion: { in: STATES }
      validates :reason, presence: true, length: { maximum: 200 }
      validates :evidence_reference, length: { maximum: 200 }, allow_nil: true
      validates :request_key, format: { with: /\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/ }
      validates :payload_digest, format: { with: /\A[0-9a-f]{64}\z/ }
      validate :category_matches_source

      def self.record!(practice:, actor:, source_kind:, source_id:, category:, assignee_id:, state:, reason:, evidence_reference: nil, request_key:)
        attributes = normalized_attributes(
          source_kind: source_kind,
          source_id: source_id,
          category: category,
          assignee_id: assignee_id,
          state: state,
          reason: reason,
          evidence_reference: evidence_reference,
          actor_id: actor.id
        )
        digest = Digest::SHA256.hexdigest(JSON.generate(attributes.sort.to_h))

        transaction do
          Access.with(practice.id, actor, "configure") do |profile|
            Access.retry_lock(practice.id, request_key)
            existing = find_by(practice_id: practice.id, request_key: request_key)
            if existing
              unless existing.actor_id == actor.id && existing.payload_digest == digest
                raise ArgumentError, "This exception-review request key was already used for different data."
              end
              return existing
            end

            lock_source!(practice.id, attributes)
            validate_assignee!(practice, attributes[:assignee_id])
            validate_current_source!(practice, attributes)
            create!(attributes.merge(practice: practice, actor: actor, profile: profile, request_key: request_key, payload_digest: digest))
          end
        end
      end

      def self.normalized_attributes(source_kind:, source_id:, category:, assignee_id:, state:, reason:, evidence_reference:, actor_id:)
        {
          source_kind: source_kind.to_s.strip,
          source_id: canonical_id!(source_id, "exception source"),
          category: category.to_s.strip,
          assignee_id: canonical_id!(assignee_id, "assignee", optional: true),
          state: state.to_s.strip,
          reason: reason.to_s.strip,
          evidence_reference: evidence_reference.to_s.strip.presence,
          actor_id: actor_id
        }
      end
      private_class_method :normalized_attributes

      def self.canonical_id!(value, label, optional: false)
        return nil if optional && value.blank?

        text = value.to_s
        raise ArgumentError, "Choose a valid #{label}." unless /\A[1-9][0-9]*\z/.match?(text)

        text.to_i
      end
      private_class_method :canonical_id!

      def self.lock_source!(practice_id, attributes)
        connection = ApplicationRecord.connection
        key = "inventory-exception:#{practice_id}:#{attributes[:source_kind]}:#{attributes[:source_id]}:#{attributes[:category]}"
        connection.execute("SELECT pg_advisory_xact_lock(hashtextextended(#{connection.quote(key)},0))")
      end
      private_class_method :lock_source!

      def self.validate_assignee!(practice, assignee_id)
        return if assignee_id.blank?

        membership = practice.memberships.active.joins(:user).where(users: { active: true }).find_by(user_id: assignee_id)
        raise ArgumentError, "Choose an active member of this clinic as the assignee." unless membership
      end
      private_class_method :validate_assignee!

      def self.validate_current_source!(practice, attributes)
        source_kind = attributes[:source_kind]
        category = attributes[:category]
        unless SOURCE_CATEGORIES.fetch(source_kind, []).include?(category)
          raise ArgumentError, "Choose a category supported by this exception source."
        end

        case source_kind
        when "batch"
          validate_batch_exception!(practice, attributes[:source_id], category)
        when "hold"
          hold = Hold.where(practice_id: practice.id).includes(:batch).find(attributes[:source_id])
          hold.batch.lock!
          unless hold.reload.release.nil? && hold.batch.reload.quantity.positive?
            raise ArgumentError, "This hold no longer has on-hand inventory to review."
          end
        when "reconciliation"
          ShipmentReconciliation.where(practice_id: practice.id).find(attributes[:source_id])
        else
          raise ArgumentError, "Choose a supported exception source."
        end
      end
      private_class_method :validate_current_source!

      def self.validate_batch_exception!(practice, source_id, category)
        batch = PharmacyBatch.where(practice_id: practice.id).find(source_id)
        product = PharmacyProduct.where(practice_id: practice.id).lock.find(batch.product_id)
        location = Location.where(practice_id: practice.id).includes(:children).lock.find(batch.location_id)
        location.site&.lock!
        batch.lock!
        raise ArgumentError, "This batch no longer has on-hand inventory to review." unless batch.quantity.positive?

        day = practice.inventory_date
        current = case category
        when "expiring"
          batch.expires_on >= day && batch.expires_on <= day + 30
        when "expired"
          batch.expires_on < day
        when "inactive_product"
          !product.active?
        when "inactive_location"
          !location.stock_destination?
        else
          false
        end
        raise ArgumentError, "This inventory exception is no longer current." unless current
      end
      private_class_method :validate_batch_exception!

      private

      def category_matches_source
        return if SOURCE_CATEGORIES.fetch(source_kind, []).include?(category)

        errors.add(:category, "does not match the exception source")
      end
    end
  end
end
