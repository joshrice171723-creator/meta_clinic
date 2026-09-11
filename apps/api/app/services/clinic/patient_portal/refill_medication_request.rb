require "digest"

module Clinic
  module PatientPortal
    class RefillMedicationRequest
      def self.call(practice:, actor:, request:, encounter:, attributes:, request_key:)
        raise ActiveRecord::RecordNotFound unless encounter.practice_id == practice.id && encounter.patient_id == request.patient_id

        values = attributes.to_h.symbolize_keys.slice(
          :medication_name, :dose_text, :route_text, :frequency_text, :quantity_text, :instructions
        )
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
