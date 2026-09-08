require "digest"

module Clinic
  module Care
    class AdministerMedication
      OPERATION_CODE = "medication_administrations.create"
      INVENTORY_REASON = "Encounter medication administration"
      MAX_ALLOCATIONS = 20
      Result = Data.define(:medication_administration, :replayed)

      def self.call(practice:, actor:, encounter:, product_id:, allocations:, dose_text:, route_text:,
        administration_site_text:, administered_at:, request_key:)
        encounter = practice.encounters.includes(:site).find(encounter.id)
        raise ArgumentError, "Choose an encounter with a facility before recording medication administration." unless encounter.site

        product_reference = positive_id!(product_id, "product")
        normalized_allocations = normalize_allocations(allocations)
        normalized_dose = required_text!(dose_text, "dose", 500)
        normalized_route = required_text!(route_text, "route", 160)
        normalized_site = optional_text!(administration_site_text, "administration site", 160)
        unless administered_at.is_a?(Time) || administered_at.is_a?(DateTime) || administered_at.is_a?(ActiveSupport::TimeWithZone)
          raise ArgumentError, "Provide the medication administration time."
        end

        payload = {
          encounter_id: encounter.id,
          patient_id: encounter.patient_id,
          site_id: encounter.site_id,
          product_id: product_reference,
          allocations: normalized_allocations.map { |row| row.slice(:batch_id, :quantity) },
          dose_text: normalized_dose,
          route_text: normalized_route,
          administration_site_text: normalized_site,
          administered_at: administered_at
        }
        outcome = nil
        Clinic::Inventory::Access.with(practice.id, actor, "adjust") do |profile|
          outcome = Clinic::Idempotency.execute(
            practice: practice,
            actor: actor,
            operation_code: OPERATION_CODE,
            request_key: request_key,
            payload: payload,
            authorization: -> { authorize!(practice, actor, encounter.id) },
            result_resource: ->(administration) { administration },
            resource_resolver: ->(practice:, receipt:) {
              administration = MedicationAdministration.find_by(practice_id: practice.id, id: receipt.resource_id)
              next unless administration
              next unless administration.encounter_id == encounter.id && administration.patient_id == encounter.patient_id
              next unless administration.site_id == encounter.site_id && administration.product_id == product_reference
              next unless administration.request_key == request_key.to_s

              administration
            }
          ) do
            Clinic::Inventory::Access.retry_lock(practice.id, inventory_lock_key(request_key))
            locked_encounter = practice.encounters.includes(:site).lock.find(encounter.id)
            raise ArgumentError, "Choose an encounter with a facility before recording medication administration." unless locked_encounter.site
            raise Clinic::Idempotency::Conflict, "The encounter context changed before medication administration was recorded." unless
              locked_encounter.patient_id == encounter.patient_id && locked_encounter.site_id == encounter.site_id

            product = Clinic::Inventory::PharmacyProduct.where(practice_id: practice.id).lock.find(product_reference)
            raise ArgumentError, "Choose an active medication inventory item." unless product.active? && product.category == "medication"

            parsed_allocations = normalized_allocations.map do |row|
              row.merge(quantity: Clinic::Inventory::Quantity.parse(row.fetch(:quantity), scale: product.quantity_scale))
            end
            batches = Clinic::Inventory::PharmacyBatch.where(
              practice_id: practice.id, id: parsed_allocations.map { |row| row.fetch(:batch_id) }
            ).includes(:lot, :product, :location_record).order(:id).lock.to_a
            raise ArgumentError, "One or more selected medication batches are unavailable." unless batches.length == parsed_allocations.length

            locations_by_id = Clinic::Inventory::Location.where(
              practice_id: practice.id, id: batches.map(&:location_id)
            ).includes(:site, :children).order(:id).lock.index_by(&:id)
            batches.each { |batch| batch.association(:location_record).target = locations_by_id[batch.location_id] }
            batches.index_by(&:id).then do |batches_by_id|
              parsed_allocations.each do |row|
                batch = batches_by_id.fetch(row.fetch(:batch_id))
                location = locations_by_id[batch.location_id]
                validate_batch!(batch, location, product, locked_encounter, row.fetch(:quantity))
              end
            end

            recorded_at = Current.business_time
            membership = practice.memberships.active.find_by!(user: actor)
            total_quantity = parsed_allocations.sum { |row| row.fetch(:quantity) }
            administration = MedicationAdministration.new(
              practice: practice,
              patient_id: locked_encounter.patient_id,
              encounter: locked_encounter,
              site: locked_encounter.site,
              administered_by_membership: membership,
              product: product,
              dose_text: normalized_dose,
              route_text: normalized_route,
              administration_site_text: normalized_site,
              quantity: total_quantity,
              stock_unit: product.stock_unit,
              administered_at: administered_at,
              recorded_at: recorded_at,
              request_key: request_key
            )
            administration.medication_identity = medication_identity(product, practice.id, request_key)
            administration.save!

            batches_by_id = batches.index_by(&:id)
            parsed_allocations.each do |row|
              batch = batches_by_id.fetch(row.fetch(:batch_id))
              movement = batch.movements.create!(
                practice: practice,
                actor: actor,
                profile: profile,
                kind: "adjustment_out",
                quantity: -row.fetch(:quantity),
                stock_unit: product.stock_unit,
                reason: INVENTORY_REASON,
                request_key: movement_key(request_key, batch.id),
                occurred_at: administered_at,
                created_at: recorded_at,
                updated_at: recorded_at
              )
              link = MedicationAdministrationMovement.new(
                practice: practice,
                medication_administration: administration,
                inventory_entry: movement
              )
              link.stock_identity = stock_identity(administration, movement, batch, locations_by_id.fetch(batch.location_id))
              link.save!
            end

            Clinic::AuditRecorder.record!(
              practice: practice,
              actor: actor,
              action_code: OPERATION_CODE,
              outcome: :committed,
              resource_version_ref: "Clinic::Care::MedicationAdministration/#{administration.id}"
            )
            administration
          end
        end

        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

        Result.new(medication_administration: outcome.value, replayed: outcome.replayed)
      end

      def self.normalize_allocations(allocations)
        rows = allocations
        raise ArgumentError, "Medication batch allocations must be an array." unless rows.is_a?(Array)
        raise ArgumentError, "Select at least one medication batch." if rows.empty?
        raise ArgumentError, "Select no more than #{MAX_ALLOCATIONS} medication batches." if rows.length > MAX_ALLOCATIONS

        normalized = rows.map do |allocation|
          values = allocation.to_h.symbolize_keys
          quantity = Clinic::Inventory::Quantity.parse(values[:quantity], scale: 6)
          { batch_id: positive_id!(values[:batch_id], "batch"), quantity: quantity.to_s("F") }
        end
        raise ArgumentError, "Select each medication batch only once." unless normalized.map { |row| row[:batch_id] }.uniq.length == normalized.length

        normalized.sort_by { |row| row.fetch(:batch_id) }
      end
      private_class_method :normalize_allocations

      def self.validate_batch!(batch, location, product, encounter, quantity)
        unless batch.product_id == product.id
          raise ArgumentError, "Every selected batch must contain the chosen medication."
        end
        unless location&.site_id == encounter.site_id
          raise ArgumentError, "Medication must come from inventory at the encounter facility."
        end
        unless batch.active_holds.none? && !batch.expired? && product.active? && location.stock_destination?
          raise ArgumentError, "Held, recalled, quarantined, expired, inactive, or non-stock medication cannot be administered."
        end
        raise ArgumentError, "A selected medication batch no longer has enough stock." if batch.quantity.to_d < quantity
      end
      private_class_method :validate_batch!

      def self.authorize!(practice, actor, encounter_id)
        encounter = practice.encounters.includes(:site).find(encounter_id)
        Clinic::Authorization.authorize!(actor: actor, practice: practice, action: "notes.write", site: encounter.site)
        Clinic::Authorization.authorize!(actor: actor, practice: practice, action: "inventory.adjust")
      end
      private_class_method :authorize!

      def self.medication_identity(product, practice_id, request_key)
        {
          version: 1,
          practice_id: practice_id,
          product_id: product.id,
          request_key: request_key.to_s,
          name: product.name,
          generic_name: product.generic_name,
          ndc: product.ndc,
          dosage_form: product.dosage_form,
          stock_unit: product.stock_unit
        }
      end
      private_class_method :medication_identity

      def self.stock_identity(administration, movement, batch, location)
        {
          version: 1,
          practice_id: administration.practice_id,
          medication_administration_id: administration.id,
          inventory_entry_id: movement.id,
          batch_id: batch.id,
          lot_id: batch.lot_id,
          lot_number: batch.lot.number,
          expires_on: batch.lot.expires_on.iso8601,
          location_id: batch.location_id,
          location_name: location.name,
          site_id: administration.site_id,
          quantity: movement.quantity.to_d.abs.to_s("F"),
          stock_unit: movement.stock_unit
        }
      end
      private_class_method :stock_identity

      def self.inventory_lock_key(request_key)
        digest = Digest::SHA256.hexdigest("medication-administration:#{request_key}")
        "#{digest[0, 8]}-#{digest[8, 4]}-4#{digest[13, 3]}-a#{digest[17, 3]}-#{digest[20, 12]}"
      end
      private_class_method :inventory_lock_key

      def self.movement_key(request_key, batch_id)
        "med-admin:#{Digest::SHA256.hexdigest(request_key.to_s)}:#{batch_id}"
      end
      private_class_method :movement_key

      def self.positive_id!(value, field)
        text = value.to_s
        raise ArgumentError, "Choose a valid #{field}." unless text.match?(/\A[1-9]\d*\z/)

        text.to_i
      end
      private_class_method :positive_id!

      def self.required_text!(value, field, maximum)
        text = value.to_s.strip
        raise ArgumentError, "Enter #{field}." if text.empty?
        raise ArgumentError, "Keep #{field} within #{maximum} characters." if text.length > maximum

        text
      end
      private_class_method :required_text!

      def self.optional_text!(value, field, maximum)
        return if value.nil?

        text = value.to_s.strip
        raise ArgumentError, "Keep #{field} within #{maximum} characters." if text.length > maximum

        text.presence
      end
      private_class_method :optional_text!
    end
  end
end
