require "digest"

module Clinic
  module Care
    module MedicationDispensing
      module_function

      def records(order)
        ids = MedicationRequestRevision.where(practice_id: order.practice_id, series_id: order.series_id).select(:id)
        MedicationDispense.where(practice_id: order.practice_id, medication_request_revision_id: ids).order(:id)
      end

      def remaining(order)
        raise ArgumentError, "Record the prescribed stock-unit quantity first." unless order.prescribed_quantity && order.quantity_unit.present?
        order.prescribed_quantity - records(order).sum(:quantity)
      end

      def record(practice:, actor:, order:, status:, request_key:, handed_over_at:, quantity: nil, batch_id: nil, original_dispense_id: nil, reason: nil)
        PrescriptionWorkflow.authorize!(practice, actor, order)
        Clinic::Authorization.authorize!(actor:, practice:, action: "medication_administrations.write", site: order.site)
        raise ArgumentError, "Choose a supported handover outcome." unless status.in?(%w[handed_over reversed not_done])
        raise ArgumentError, "Record the reason for this outcome." if status != "handed_over" && reason.to_s.strip.empty?
        time = Time.iso8601(handed_over_at.to_s)
        raise ArgumentError, "Handover cannot be recorded in the future." if time > Current.business_time
        payload = { order_id: order.id, status:, quantity:, batch_id:, original_dispense_id:, reason:, handed_over_at: time.iso8601 }
        result = nil
        execute = lambda do |profile|
          result = Clinic::Idempotency.execute(practice:, actor:, operation_code: "medication_dispense.record", request_key:, payload:,
            authorization_action: "medication_administrations.write",
            authorization: -> { PrescriptionWorkflow.authorize!(practice, actor, order); Clinic::Authorization.authorize!(actor:, practice:, action: "medication_administrations.write", site: order.site) },
            result_resource: ->(record) { record }, resource_resolver: ->(practice:, receipt:) { MedicationDispense.find_by(practice_id: practice.id, id: receipt.resource_id) }) do
            ApplicationRecord.connection.execute(ApplicationRecord.sanitize_sql_array([
              "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", "clinical-plan:#{practice.id}:medication_requests:#{order.series_id}"
            ]))
            current = MedicationRequestRevision.where(practice:, series_id: order.series_id).order(version_number: :desc).first!
            original = original_dispense_id.present? ? records(order).find(original_dispense_id) : nil
            if status == "reversed"
              unless original&.status == "handed_over" && !MedicationDispense.exists?(original_dispense_id: original.id)
                raise ArgumentError, "Choose an unreversed handover from this prescription."
              end
              batch_id = original.inventory_entry.batch_id
            else
              raise ActiveRecord::StaleObjectError.new(order, "dispense") unless current.id == order.id
              PrescriptionWorkflow.validate_release!(order) unless status == "not_done"
              PrescriptionWorkflow.ensure_dependencies!(order) if status == "handed_over"
              raise ArgumentError, "This prescription is not for take-home fulfillment." unless order.fulfillment_route == "take_home"
              if status == "handed_over" && !PrescriptionWorkflow.events(order).exists?(medication_request_revision_id: order.id, kind: "review")
                raise ArgumentError, "Review this prescription version before handover."
              end
              raise ArgumentError, "Reconcile the prior prescription attempt first." if PrescriptionWorkflow.unresolved?(order)
            end
            product = Clinic::Inventory::PharmacyProduct.where(practice:, category: "medication").lock.find(order.inventory_product_id)
            raise ArgumentError, "Prescribed and inventory units must match; no conversion is assumed." unless order.quantity_unit == product.stock_unit
            amount = status == "not_done" ? BigDecimal("0") : status == "reversed" ? -original.quantity : Clinic::Inventory::Quantity.parse(quantity, scale: product.quantity_scale)
            if status == "handed_over"
              raise ArgumentError, "Handover quantity must be positive and no greater than the remaining prescription quantity." unless amount.positive? && amount <= remaining(order)
              raise ArgumentError, "Record the reason for partial fulfillment." if amount < remaining(order) && reason.to_s.strip.empty?
            end
            movement = nil
            if status != "not_done"
              batch = Clinic::Inventory::PharmacyBatch.where(practice:).lock.find(batch_id)
              location = Clinic::Inventory::Location.where(practice:).find(batch.location_id)
              unless batch.product_id == product.id && location.site_id == order.site_id && product.active? && location.stock_destination?
                raise ArgumentError, "Choose suitable stock for this medication and facility."
              end
              if status == "handed_over" && (batch.expired? || batch.active_holds.exists? || batch.quantity < amount)
                raise ArgumentError, "The lot is expired, held or has insufficient stock. Record a partial fulfillment or choose suitable stock."
              end
              movement = batch.movements.create!(practice:, actor:, profile:, kind: amount.positive? ? "adjustment_out" : "adjustment_in",
                quantity: -amount, stock_unit: product.stock_unit, reason: status == "reversed" ? "Reverse take-home handover entry" : "Take-home medication handover",
                request_key: request_key, occurred_at: time, created_at: Current.business_time, updated_at: Current.business_time)
            end
            dispense = MedicationDispense.create!(practice:, patient_id: order.patient_id, encounter_id: order.encounter_id, site_id: order.site_id,
              medication_request_revision: order, recorded_by_membership: practice.memberships.active.find_by!(user: actor),
              original_dispense: original, inventory_entry: movement, status:, request_key:, stock_unit: product.stock_unit,
              quantity: amount, reason:, handed_over_at: time, recorded_at: Current.business_time)
            if status == "reversed"
              root = MedicationRequestRevision.where(practice:, series_id: order.series_id, version_number: 1).first!
              tasks = Clinic::ClinicalTask.where(practice:, source_type: "order", source_kind: "medication_request", source_id: root.id,
                state: %w[open claimed in_progress on_hold])
              unless tasks.exists?
                Clinic::ClinicalTask.create!(practice:, patient_id: order.patient_id, encounter_id: order.encounter_id, site_id: order.site_id,
                  task_kind: "order_execution", state: "open", pool_code: "clinical", source_type: "order", source_kind: "medication_request",
                  source_id: root.id, recorded_by_membership: practice.memberships.active.find_by!(user: actor))
              end
            end
            dispense
          end
        end
        if status == "not_done"
          execute.call(nil)
        else
          Clinic::Inventory::Access.with_medication_administration(practice.id, actor, site: order.site) { |profile| execute.call(profile) }
        end
        result.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def serialize(record)
        record.slice(:id, :medication_request_revision_id, :original_dispense_id, :inventory_entry_id, :status, :reason, :stock_unit, :recorded_by_membership_id)
          .merge(quantity: record.quantity.to_s("F"), handed_over_at: record.handed_over_at.iso8601, recorded_at: record.recorded_at.iso8601)
      end
    end
  end
end
