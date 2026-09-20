require "digest"

module Clinic
  module PatientPortal
    class RefillMedicationRequest
      def self.call(practice:, actor:, request:, encounter:, attributes:, prior_series_id: nil, request_key:)
        raise ActiveRecord::RecordNotFound unless encounter.practice_id == practice.id && encounter.patient_id == request.patient_id

        values = attributes.to_h.symbolize_keys.slice(
          :medication_name, :dose_text, :route_text, :frequency_text, :quantity_text, :instructions
        )
        prior = prior_series_id.present? && Clinic::Care::MedicationRequestRevision.where(
          practice:, patient: request.patient, series_id: prior_series_id
        ).order(version_number: :desc, id: :desc).first
        if prior
          copied = prior.attributes.slice(
            "inventory_product_id", "medication_name", "dose_value", "dose_unit_code", "dose_text", "route_code",
            "route_text", "frequency_text", "quantity_text", "instructions", "fulfillment_route", "medication_strength",
            "medication_form", "medication_code_system", "medication_code", "medication_code_version", "catalog_source",
            "pharmacy_name", "pharmacy_location", "pharmacy_identifier", "prescribed_quantity", "quantity_unit", "refills",
            "starts_on", "duration_text"
          ).symbolize_keys
          values = copied.merge(values.compact)
          values[:refill_of_series_id] = prior.series_id
        end
        values[:medication_name] = values[:medication_name].to_s.strip.presence
        raise ArgumentError, "Medication name is required for the refill order." unless values[:medication_name]
        values[:intent] = "order"

        draft = Clinic::Care::ClinicalPlanWorkflow.create(
          kind: :medication_requests, practice:, actor:, patient: request.patient, encounter:,
          attributes: values, request_key: derived_key(request_key, "draft")
        )
        Clinic::Care::ClinicalPlanWorkflow.revise(
          kind: :medication_requests, series_id: draft.series_id, practice:, actor:, patient: request.patient,
          encounter:, attributes: { status: "authorized" }, expected_version: draft.version_number,
          request_key: derived_key(request_key, "authorize")
        )
      end

      def self.derived_key(request_key, step)
        "refill-medication-#{step}-#{Digest::SHA256.hexdigest(request_key.to_s)[0, 32]}"
      end
      private_class_method :derived_key
    end
  end
end
