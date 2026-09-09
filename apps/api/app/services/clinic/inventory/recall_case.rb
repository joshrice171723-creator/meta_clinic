module Clinic
  module Inventory
    class RecallCase
      def self.create!(practice:, actor:, lot_ids:, reference:, reason:, required_disposition:, request_key:)
        request_key = request_key!(request_key)
        ids = normalize_ids!(lot_ids)
        values = {
          actor_id: actor.id,
          lot_ids: ids,
          reference: required_text!(reference, "recall reference", 100),
          reason: required_text!(reason, "recall reason", 200),
          required_disposition: required_text!(required_disposition, "required disposition", 60)
        }
        digest = Digest::SHA256.hexdigest(JSON.generate(values.sort.to_h))

        Recall.transaction do
          with_authority!(practice, actor, "recall.lock") do |locked_practice, locked_actor|
            Access.retry_lock(locked_practice.id, request_key)
            existing = Recall.find_by(practice_id: locked_practice.id, request_key: request_key)
            if existing
              unless existing.actor_id == actor.id && existing.payload_digest == digest
                raise ArgumentError, "This recall request key was already used for different data."
              end
              return existing
            end

            lots = Lot.where(practice_id: locked_practice.id, id: ids).order(:id).to_a
            raise ArgumentError, "Choose 1–100 valid lots from this clinic." unless lots.map(&:id) == ids
            product_ids = lots.map(&:product_id).uniq
            raise ArgumentError, "All recalled lots must belong to one product." unless product_ids.one?

            product = PharmacyProduct.where(practice_id: locked_practice.id).lock.find(product_ids.sole)
            lots = Lot.where(practice_id: locked_practice.id, product_id: product.id, id: ids).order(:id).lock.to_a
            batches = PharmacyBatch.where(practice_id: locked_practice.id, lot_id: ids).where("on_hand > 0").order(:id).lock.to_a
            record = Recall.create!(practice: locked_practice, product: product, actor: locked_actor,
              reference: values[:reference], status: "inventory_locked", reason: values[:reason],
              required_disposition: values[:required_disposition], effective_on: locked_practice.inventory_date,
              affected_units: batches.sum(&:quantity), request_key: request_key, payload_digest: digest)
            lots.each { |lot| record.recall_lots.create!(practice: locked_practice, lot: lot) }
            batches.each_with_index do |batch, index|
              create_hold!(recall: record, batch: batch, actor: locked_actor, reason: record.reason,
                request_key: "#{request_key}:hold:#{index + 1}")
            end
            record
          end
        end
      end

      def self.contain!(recall:, actor:, reason:, request_key:)
        request_key = request_key!(request_key)
        reason = required_text!(reason, "containment reason", 200)
        Recall.transaction do
          with_authority!(recall.practice, actor, "recall.lock") do |practice, locked_actor|
            Access.retry_lock(practice.id, request_key)
            replay = Hold.where(practice_id: practice.id, request_key: request_key).first
            if replay
              unless replay.recall_id == recall.id && replay.actor_id == actor.id && replay.reason == reason
                raise ArgumentError, "This containment request key was already used for different data."
              end
              return recall
            end

            product = PharmacyProduct.where(practice_id: practice.id).lock.find(recall.product_id)
            recall = Recall.where(practice_id: practice.id, product_id: product.id).lock.find(recall.id)
            raise ArgumentError, "This recall case is closed." if recall.closure.present? || recall.status == "closed"
            lot_ids = recall.recall_lots.order(:lot_id).lock.pluck(:lot_id)
            batches = PharmacyBatch.where(practice_id: practice.id, lot_id: lot_ids).where("on_hand > 0").order(:id).lock.to_a
            contained_batch_ids = Hold.active.where(
              practice_id: practice.id,
              batch_id: batches.map(&:id),
              kind: "recalled",
              recall_id: recall.id
            ).pluck(:batch_id).to_h { |id| [ id, true ] }
            missing = batches.reject { |batch| contained_batch_ids.key?(batch.id) }
            raise ArgumentError, "Every on-hand position is already contained for this recall." if missing.empty?

            missing.each_with_index do |batch, index|
              create_hold!(recall: recall, batch: batch, actor: locked_actor, reason: reason,
                request_key: index.zero? ? request_key : "#{request_key}:#{index + 1}")
            end
            recall
          end
        end
      end

      def self.close!(recall:, actor:, reason:, evidence_reference:, request_key:)
        request_key = request_key!(request_key)
        reason = required_text!(reason, "closure reason", 200)
        evidence = required_text!(evidence_reference, "closure evidence reference", 200)
        digest = Digest::SHA256.hexdigest(JSON.generate({ actor_id: actor.id, recall_id: recall.id, reason: reason, evidence_reference: evidence }))

        Recall.transaction do
          with_authority!(recall.practice, actor, "recall.dispose") do |practice, locked_actor|
            Access.retry_lock(practice.id, request_key)
            existing = RecallClosure.find_by(practice_id: practice.id, request_key: request_key)
            if existing
              unless existing.recall_id == recall.id && existing.actor_id == actor.id && existing.payload_digest == digest
                raise ArgumentError, "This recall-closure request key was already used for different data."
              end
              return existing
            end

            PharmacyProduct.where(practice_id: practice.id).lock.find(recall.product_id)
            recall = Recall.where(practice_id: practice.id).lock.find(recall.id)
            raise ArgumentError, "This recall case is already closed." if recall.closure.present? || recall.status == "closed"
            lot_ids = recall.recall_lots.order(:lot_id).lock.pluck(:lot_id)
            positions = PharmacyBatch.where(practice_id: practice.id, lot_id: lot_ids).order(:id).lock.to_a
            remaining = positions.sum(&:quantity)
            raise ArgumentError, "Complete disposition for every on-hand position before closing this recall." unless remaining.zero?

            profile = practice.inventory_profiles.order(version: :desc).first
            closure = RecallClosure.create!(practice: practice, recall: recall, actor: locked_actor, profile: profile,
              reason: reason, evidence_reference: evidence, request_key: request_key, payload_digest: digest)
            recall.update!(status: "closed")
            closure
          end
        end
      end

      def self.create_hold!(recall:, batch:, actor:, reason:, request_key:)
        batch.holds.create!(practice_id: recall.practice_id, actor: actor, recall: recall,
          kind: "recalled", reason: reason, request_key: request_key)
      end
      private_class_method :create_hold!

      def self.normalize_ids!(values)
        raise ArgumentError, "Choose 1–100 recalled lots." unless values.is_a?(Array) && values.size.between?(1, 100)
        ids = values.map do |value|
          text = value.to_s
          raise ArgumentError, "Choose valid recalled lots." unless /\A[1-9][0-9]*\z/.match?(text)
          id = text.to_i
          raise ArgumentError, "Choose valid recalled lots." if id > 9_223_372_036_854_775_807
          id
        end.uniq.sort
        raise ArgumentError, "Choose 1–100 distinct recalled lots." unless ids.size == values.size
        ids
      end
      private_class_method :normalize_ids!

      def self.required_text!(value, label, maximum)
        text = value.to_s.strip
        raise ArgumentError, "Provide a #{label} of #{maximum} characters or fewer." unless text.length.between?(1, maximum)
        text
      end
      private_class_method :required_text!

      def self.request_key!(value)
        key = value.to_s
        unless /\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/.match?(key)
          raise ArgumentError, "Reload the form to obtain a valid retry key."
        end
        key
      end
      private_class_method :request_key!

      def self.with_authority!(practice, actor, action)
        locked_practice = Clinic::Practice.lock("FOR SHARE").find(practice.id)
        locked_actor = User.lock("FOR SHARE").find(actor.id)
        Clinic::Authorization.authorize!(actor: locked_actor, practice: locked_practice, action: action)
        ApplicationRecord.connection.execute("SELECT set_config('apply.inventory_action', #{ApplicationRecord.connection.quote(action)}, true)")
        yield locked_practice, locked_actor
      rescue Clinic::Authorization::Denied => error
        raise ArgumentError, error.message
      end
      private_class_method :with_authority!
    end
  end
end
