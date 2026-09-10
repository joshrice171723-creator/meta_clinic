module Clinic
  module Care
    module MedicationAdministrationSerializer
      module_function

      def call(administration)
        medication = administration.medication_identity
        {
          id: administration.id,
          patient_id: administration.patient_id,
          encounter_id: administration.encounter_id,
          site_id: administration.site_id,
          administered_by_membership_id: administration.administered_by_membership_id,
          verified_by_membership_id: administration.verified_by_membership_id,
          medication_request_revision_id: administration.medication_request_revision_id,
          medication_request_series_id: administration.medication_request_revision&.series_id,
          ordered_by_membership_id: administration.medication_request_revision&.recorded_by_membership_id,
          status: administration.status,
          status_reason: administration.status_reason,
          product: {
            id: administration.product_id,
            name: medication.fetch(:name),
            generic_name: medication[:generic_name],
            ndc: medication[:ndc],
            dosage_form: medication[:dosage_form],
            stock_unit: medication.fetch(:stock_unit)
          },
          dose_value: administration.dose_value&.to_d&.to_s("F"),
          dose_unit_code: administration.dose_unit_code,
          dose_text: administration.dose_text,
          route_code: administration.route_code,
          route_text: administration.route_text,
          administration_site_code: administration.administration_site_code,
          administration_site_text: administration.administration_site_text,
          variance_reason: administration.variance_reason,
          precheck_status: administration.precheck_status,
          precheck_notes: administration.precheck_notes,
          verification_status: administration.verification_status,
          response_text: administration.response_text,
          education_text: administration.education_text,
          quantity: administration.quantity&.to_d&.to_s("F"),
          stock_unit: administration.stock_unit,
          administered_at: administration.administered_at.iso8601(6),
          recorded_at: administration.recorded_at.iso8601(6),
          movements: administration.movement_links.sort_by(&:id).map { |link| movement(link) }
        }
      end

      def eligible_order(order)
        product = order.inventory_product
        requester = order.requester_membership
        {
          id: order.id,
          series_id: order.series_id,
          version_number: order.version_number,
          medication_name: order.medication_name,
          dose_value: order.dose_value&.to_d&.to_s("F"),
          dose_unit_code: order.dose_unit_code,
          dose_text: order.dose_text,
          route_code: order.route_code,
          route_text: order.route_text,
          frequency_text: order.frequency_text,
          scheduled_for: order.scheduled_for&.iso8601(6),
          reason_text: order.reason_text,
          instructions: order.instructions,
          ordered_by_membership_id: requester.id,
          ordered_by_display: requester.clinician_profile&.display_name || "Clinical staff ##{requester.id}",
          product: {
            id: product.id, name: product.name, generic_name: product.generic_name, ndc: product.ndc,
            dosage_form: product.dosage_form, stock_unit: product.stock_unit
          }
        }
      end

      def eligible_batch(batch)
        {
          batch_id: batch.id,
          product_id: batch.product_id,
          product_name: batch.product.name,
          generic_name: batch.product.generic_name,
          ndc: batch.product.ndc,
          dosage_form: batch.product.dosage_form,
          stock_unit: batch.product.stock_unit,
          quantity_scale: batch.product.quantity_scale,
          available_quantity: batch.quantity.to_d.to_s("F"),
          lot_id: batch.lot_id,
          lot_number: batch.lot.number,
          expires_on: batch.lot.expires_on.iso8601,
          location_id: batch.location_id,
          location_name: batch.location_record.name
        }
      end

      def movement(link)
        stock = link.stock_identity
        {
          id: link.inventory_entry_id,
          batch_id: stock.fetch(:batch_id),
          lot_id: stock.fetch(:lot_id),
          lot_number: stock.fetch(:lot_number),
          expires_on: stock.fetch(:expires_on),
          location_id: stock.fetch(:location_id),
          location_name: stock.fetch(:location_name),
          quantity: stock.fetch(:quantity),
          stock_unit: stock.fetch(:stock_unit)
        }
      end
      private_class_method :movement
    end
  end
end
