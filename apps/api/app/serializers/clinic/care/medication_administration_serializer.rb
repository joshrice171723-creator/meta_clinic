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
          product: {
            id: administration.product_id,
            name: medication.fetch(:name),
            generic_name: medication[:generic_name],
            ndc: medication[:ndc],
            dosage_form: medication[:dosage_form],
            stock_unit: medication.fetch(:stock_unit)
          },
          dose_text: administration.dose_text,
          route_text: administration.route_text,
          administration_site_text: administration.administration_site_text,
          quantity: administration.quantity.to_d.to_s("F"),
          stock_unit: administration.stock_unit,
          administered_at: administration.administered_at.iso8601(6),
          recorded_at: administration.recorded_at.iso8601(6),
          movements: administration.movement_links.sort_by(&:id).map { |link| movement(link) }
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
