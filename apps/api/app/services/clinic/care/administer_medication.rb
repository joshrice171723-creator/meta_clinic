require "digest"

module Clinic
  module Care
    class AdministerMedication
      OPERATION_CODE = "medication_administrations.create"
      INVENTORY_REASON = "Encounter medication administration"
      MAX_ALLOCATIONS = 20
      Result = Data.define(:medication_administration, :replayed)

      def self.call(practice:, actor:, encounter:, medication_request_revision_id:, status:, allocations:,
        dose_value:, dose_unit_code:, route_code:, administration_site_code:, administration_site_text:,
        status_reason:, variance_reason:, precheck_status:, precheck_notes:, verification_status:,
        verified_by_membership_id:, response_text:, education_text:, administered_at:, request_key:)
        encounter = practice.encounters.includes(:site).find(encounter.id)
        raise ArgumentError, "Choose an encounter with a facility before recording medication administration." unless encounter.site

        outcome_status = enum!(status, MedicationAdministration::STATUSES, "outcome")
        order_reference = positive_id!(medication_request_revision_id, "medication order")
        authorize!(practice, actor, encounter.id, outcome_status)
        current_order!(practice, encounter, order_reference)
        values = normalized_values(
          status: outcome_status, allocations:, dose_value:, dose_unit_code:, route_code:,
          administration_site_code:, administration_site_text:, status_reason:, variance_reason:,
          precheck_status:, precheck_notes:, verification_status:, verified_by_membership_id:,
          response_text:, education_text:, administered_at:
        )
        payload = values.merge(
          encounter_id: encounter.id, patient_id: encounter.patient_id, site_id: encounter.site_id,
          medication_request_revision_id: order_reference
        )

        execute = lambda do |inventory_profile|
          Clinic::Idempotency.execute(
            practice:, actor:, operation_code: OPERATION_CODE, request_key:, payload:,
            authorization: -> { authorize!(practice, actor, encounter.id, outcome_status) },
            result_resource: ->(administration) { administration },
            resource_resolver: ->(practice:, receipt:) {
              administration = MedicationAdministration.find_by(practice_id: practice.id, id: receipt.resource_id)
              next unless administration
              next unless administration.encounter_id == encounter.id && administration.patient_id == encounter.patient_id
              next unless administration.medication_request_revision_id == order_reference
              next unless administration.status == outcome_status && administration.request_key == request_key.to_s

              administration
            }
          ) do
            Clinic::Inventory::Access.retry_lock(practice.id, inventory_lock_key(request_key)) if inventory_profile
            locked_encounter = practice.encounters.includes(:site).lock.find(encounter.id)
            raise ArgumentError, "Choose an encounter with a facility before recording medication administration." unless locked_encounter.site
            unless locked_encounter.patient_id == encounter.patient_id && locked_encounter.site_id == encounter.site_id
              raise Clinic::Idempotency::Conflict, "The encounter context changed before the outcome was recorded."
            end

            order = current_order!(practice, locked_encounter, order_reference, lock: true)
            product = Clinic::Inventory::PharmacyProduct.where(practice_id: practice.id).lock
              .find(order.inventory_product_id)
            unless product.active? && product.category == "medication"
              raise ArgumentError, "The ordered medication is no longer active in the clinic catalog."
            end

            parsed_allocations, batches, locations_by_id = inventory_inputs(
              practice, locked_encounter, product, values.fetch(:allocations), outcome_status
            )
            recorded_at = Current.business_time
            membership = practice.memberships.active.find_by!(user: actor)
            verifier = verifier!(practice, locked_encounter, membership, values[:verified_by_membership_id],
              values[:verification_status])
            ensure_variance_reason!(order, values)
            total_quantity = parsed_allocations.sum { |row| row.fetch(:quantity) } if outcome_status == "completed"

            administration = MedicationAdministration.new(
              practice:, patient_id: locked_encounter.patient_id, encounter: locked_encounter,
              site: locked_encounter.site, administered_by_membership: membership,
              verified_by_membership: verifier, product:, medication_request_revision: order,
              status: outcome_status, status_reason: values[:status_reason], dose_value: values[:dose_value],
              dose_unit_code: values[:dose_unit_code], dose_text: dose_text(values), route_code: values[:route_code],
              route_text: route_text(values), administration_site_code: values[:administration_site_code],
              administration_site_text: site_text(values), variance_reason: values[:variance_reason],
              precheck_status: values[:precheck_status], precheck_notes: values[:precheck_notes],
              verification_status: values[:verification_status], response_text: values[:response_text],
              education_text: values[:education_text], quantity: total_quantity, stock_unit: product.stock_unit,
              administered_at: values.fetch(:administered_at), recorded_at:, request_key:
            )
            administration.medication_identity = medication_identity(product, practice.id, request_key)
            administration.save!
            ClinicalPlanLink.create!(
              practice:, patient_id: locked_encounter.patient_id, encounter: locked_encounter,
              site: locked_encounter.site, source_kind: "medication_request", target_kind: "medication_administration",
              medication_request_revision: order, medication_administration: administration,
              outcome_summary: outcome_status == "completed" ? "Medication given" : "Medication not given",
              recorded_by_membership: membership, recorded_at:, request_key:
            )

            if outcome_status == "completed"
              batches_by_id = batches.index_by(&:id)
              parsed_allocations.each do |row|
                batch = batches_by_id.fetch(row.fetch(:batch_id))
                movement = batch.movements.create!(
                  practice:, actor:, profile: inventory_profile, kind: "adjustment_out",
                  quantity: -row.fetch(:quantity), stock_unit: product.stock_unit, reason: INVENTORY_REASON,
                  request_key: movement_key(request_key, batch.id), occurred_at: values.fetch(:administered_at),
                  created_at: recorded_at, updated_at: recorded_at
                )
                link = MedicationAdministrationMovement.new(
                  practice:, medication_administration: administration, inventory_entry: movement
                )
                link.stock_identity = stock_identity(
                  administration, movement, batch, locations_by_id.fetch(batch.location_id)
                )
                link.save!
              end
            end

            Clinic::AuditRecorder.record!(
              practice:, actor:, action_code: OPERATION_CODE, outcome: :committed,
              resource_version_ref: "Clinic::Care::MedicationAdministration/#{administration.id}"
            )
            administration
          end
        end

        outcome = if outcome_status == "completed"
          Clinic::Inventory::Access.with_medication_administration(practice.id, actor, site: encounter.site) do |profile|
            execute.call(profile)
          end
        else
          execute.call(nil)
        end
        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

        Result.new(medication_administration: outcome.value, replayed: outcome.replayed)
      end

      def self.normalized_values(status:, allocations:, dose_value:, dose_unit_code:, route_code:,
        administration_site_code:, administration_site_text:, status_reason:, variance_reason:, precheck_status:,
        precheck_notes:, verification_status:, verified_by_membership_id:, response_text:, education_text:,
        administered_at:)
        unless administered_at.is_a?(Time) || administered_at.is_a?(DateTime) ||
          administered_at.is_a?(ActiveSupport::TimeWithZone)
          raise ArgumentError, "Provide the medication outcome time."
        end

        if status == "not_done"
          if Array(allocations).any? || dose_value.present? || dose_unit_code.present? || route_code.present? ||
            administration_site_code.present? || administration_site_text.present? || verified_by_membership_id.present?
            raise ArgumentError, "Do not include dose, route, site, verifier, or lot details when medication was not given."
          end
          return {
            status:, allocations: [], dose_value: nil, dose_unit_code: nil, route_code: nil,
            administration_site_code: nil, administration_site_text: nil,
            status_reason: required_text!(status_reason, "not-given reason", 2_000),
            variance_reason: nil, precheck_status: enum!(precheck_status.presence || "not_recorded",
              MedicationAdministration::PRECHECK_STATUSES, "pre-check status"),
            precheck_notes: optional_text!(precheck_notes, "pre-check notes", 2_000),
            verification_status: "not_required", verified_by_membership_id: nil,
            response_text: optional_text!(response_text, "response or reassessment", 2_000),
            education_text: optional_text!(education_text, "education", 2_000), administered_at:
          }
        end

        dose = decimal!(dose_value, "dose")
        unit = enum!(dose_unit_code, MedicationRequestRevision::DOSE_UNITS.keys, "dose unit")
        route = enum!(route_code, MedicationRequestRevision::ROUTES.keys, "route")
        site = enum!(administration_site_code, MedicationAdministration::ADMINISTRATION_SITES.keys,
          "administration site")
        custom_site = optional_text!(administration_site_text, "administration site", 160)
        if site == "other" && custom_site.blank?
          raise ArgumentError, "Document the other administration site."
        elsif site != "other" && custom_site.present?
          raise ArgumentError, "Use the selected administration site without additional free text."
        end
        verification = enum!(verification_status, MedicationAdministration::VERIFICATION_STATUSES,
          "verification status")
        precheck = enum!(precheck_status, MedicationAdministration::PRECHECK_STATUSES, "pre-check status")
        raise ArgumentError, "Record the medication pre-check outcome." if precheck == "not_recorded"
        raise ArgumentError, "Record the verification outcome." if verification == "not_recorded"

        {
          status:, allocations: normalize_allocations(allocations), dose_value: dose,
          dose_unit_code: unit, route_code: route, administration_site_code: site,
          administration_site_text: custom_site, status_reason: nil,
          variance_reason: optional_text!(variance_reason, "variance or safety exception", 2_000),
          precheck_status: precheck, precheck_notes: optional_text!(precheck_notes, "pre-check notes", 2_000),
          verification_status: verification,
          verified_by_membership_id: optional_positive_id(verified_by_membership_id, "verifier"),
          response_text: optional_text!(response_text, "response or reassessment", 2_000),
          education_text: optional_text!(education_text, "education", 2_000), administered_at:
        }
      end
      private_class_method :normalized_values

      def self.current_order!(practice, encounter, reference, lock: false)
        scope = MedicationRequestRevision.where(
          practice_id: practice.id, patient_id: encounter.patient_id, encounter_id: encounter.id
        )
        requested = lock ? scope.lock.find(reference) : scope.find(reference)
        latest_scope = scope.where(series_id: requested.series_id).order(version_number: :desc, id: :desc)
        latest = lock ? latest_scope.lock.first : latest_scope.first
        unless latest&.id == requested.id && requested.status == "authorized" && requested.intent == "order"
          raise ArgumentError, "Choose the current authorized medication order."
        end
        unless requested.site_id == encounter.site_id && requested.inventory_product_id.present?
          raise ArgumentError, "The medication order must be linked to an inventory medication at this facility."
        end
        requested
      end
      private_class_method :current_order!

      def self.inventory_inputs(practice, encounter, product, normalized_allocations, status)
        return [ [], [], {} ] if status == "not_done"

        parsed = normalized_allocations.map do |row|
          row.merge(quantity: Clinic::Inventory::Quantity.parse(row.fetch(:quantity), scale: product.quantity_scale))
        end
        batches = Clinic::Inventory::PharmacyBatch.where(
          practice_id: practice.id, id: parsed.map { |row| row.fetch(:batch_id) }
        ).includes(:lot, :product, :location_record).order(:id).lock.to_a
        raise ArgumentError, "One or more selected medication lots are unavailable." unless batches.length == parsed.length

        locations = Clinic::Inventory::Location.where(practice_id: practice.id, id: batches.map(&:location_id))
          .includes(:site, :children).order(:id).lock.index_by(&:id)
        batches.each { |batch| batch.association(:location_record).target = locations[batch.location_id] }
        batches.index_by(&:id).then do |batches_by_id|
          parsed.each do |row|
            batch = batches_by_id.fetch(row.fetch(:batch_id))
            validate_batch!(batch, locations[batch.location_id], product, encounter, row.fetch(:quantity))
          end
        end
        [ parsed, batches, locations ]
      end
      private_class_method :inventory_inputs

      def self.normalize_allocations(allocations)
        rows = allocations
        raise ArgumentError, "Medication lot allocations must be an array." unless rows.is_a?(Array)
        raise ArgumentError, "Select at least one medication lot." if rows.empty?
        raise ArgumentError, "Select no more than #{MAX_ALLOCATIONS} medication lots." if rows.length > MAX_ALLOCATIONS

        normalized = rows.map do |allocation|
          values = allocation.to_h.symbolize_keys
          quantity = Clinic::Inventory::Quantity.parse(values[:quantity], scale: 6)
          { batch_id: positive_id!(values[:batch_id], "lot"), quantity: quantity.to_s("F") }
        end
        unless normalized.map { |row| row[:batch_id] }.uniq.length == normalized.length
          raise ArgumentError, "Select each medication lot only once."
        end
        normalized.sort_by { |row| row.fetch(:batch_id) }
      end
      private_class_method :normalize_allocations

      def self.validate_batch!(batch, location, product, encounter, quantity)
        raise ArgumentError, "Every selected lot must contain the ordered medication." unless batch.product_id == product.id
        raise ArgumentError, "Medication must come from inventory at the encounter facility." unless location&.site_id == encounter.site_id
        unless batch.active_holds.none? && !batch.expired? && product.active? && location.stock_destination?
          raise ArgumentError, "Held, recalled, quarantined, expired, inactive, or non-stock medication cannot be administered."
        end
        raise ArgumentError, "A selected medication lot no longer has enough stock." if batch.quantity.to_d < quantity
      end
      private_class_method :validate_batch!

      def self.verifier!(practice, encounter, administrator, verifier_id, verification_status)
        if verification_status == "completed"
          verifier = practice.memberships.active.find(positive_id!(verifier_id, "verifier"))
          raise ArgumentError, "The verifier must be a different active staff member." if verifier.id == administrator.id
          unless Ability.new(verifier.user, practice:)
            .allowed_permission?("medication_administrations.write", site: encounter.site)
            raise ArgumentError, "The verifier must be active clinical staff for this facility."
          end
          verifier
        elsif verifier_id.present?
          raise ArgumentError, "Choose a verifier only when independent verification was completed."
        end
      end
      private_class_method :verifier!

      def self.ensure_variance_reason!(order, values)
        return if values[:status] == "not_done"

        differs = order.dose_value.present? && (
          order.dose_value.to_d != values[:dose_value].to_d ||
          order.dose_unit_code != values[:dose_unit_code] || order.route_code != values[:route_code]
        )
        safety_exception = values[:precheck_status] == "unable_to_complete" ||
          values[:verification_status] == "unable_to_complete"
        if (differs || safety_exception) && values[:variance_reason].blank?
          raise ArgumentError, "Document the variance or safety exception before recording this administration."
        end
      end
      private_class_method :ensure_variance_reason!

      def self.authorize!(practice, actor, encounter_id, _status)
        encounter = practice.encounters.includes(:site).find(encounter_id)
        Clinic::Authorization.authorize!(actor:, practice:, action: "medication_administrations.write",
          site: encounter.site)
      end
      private_class_method :authorize!

      def self.dose_text(values)
        return unless values[:status] == "completed"
        "#{values.fetch(:dose_value).to_s('F')} #{MedicationRequestRevision::DOSE_UNITS.fetch(values.fetch(:dose_unit_code))}"
      end
      private_class_method :dose_text

      def self.route_text(values)
        MedicationRequestRevision::ROUTES[values[:route_code]] if values[:status] == "completed"
      end
      private_class_method :route_text

      def self.site_text(values)
        return unless values[:status] == "completed"
        values[:administration_site_code] == "other" ? values[:administration_site_text] :
          MedicationAdministration::ADMINISTRATION_SITES.fetch(values[:administration_site_code])
      end
      private_class_method :site_text

      def self.medication_identity(product, practice_id, request_key)
        {
          version: 1, practice_id:, product_id: product.id, request_key: request_key.to_s,
          name: product.name, generic_name: product.generic_name, ndc: product.ndc,
          dosage_form: product.dosage_form, stock_unit: product.stock_unit
        }
      end
      private_class_method :medication_identity

      def self.stock_identity(administration, movement, batch, location)
        {
          version: 1, practice_id: administration.practice_id,
          medication_administration_id: administration.id, inventory_entry_id: movement.id,
          batch_id: batch.id, lot_id: batch.lot_id, lot_number: batch.lot.number,
          expires_on: batch.lot.expires_on.iso8601, location_id: batch.location_id,
          location_name: location.name, site_id: administration.site_id,
          quantity: movement.quantity.to_d.abs.to_s("F"), stock_unit: movement.stock_unit
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

      def self.enum!(value, allowed, field)
        candidate = value.to_s.strip
        raise ArgumentError, "Choose a supported #{field}." unless allowed.include?(candidate)
        candidate
      end
      private_class_method :enum!

      def self.decimal!(value, field)
        parsed = BigDecimal(value.to_s)
        raise ArgumentError unless parsed.positive? && parsed <= 1_000_000 && parsed == parsed.round(6)
        parsed
      rescue ArgumentError
        raise ArgumentError, "Enter a valid positive #{field} with no more than six decimal places."
      end
      private_class_method :decimal!

      def self.positive_id!(value, field)
        text = value.to_s
        raise ArgumentError, "Choose a valid #{field}." unless text.match?(/\A[1-9]\d*\z/)
        text.to_i
      end
      private_class_method :positive_id!

      def self.optional_positive_id(value, field)
        value.present? ? positive_id!(value, field) : nil
      end
      private_class_method :optional_positive_id

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
