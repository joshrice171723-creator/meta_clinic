module Clinic
  module Care
    module ClinicalHistorySerializer
      def self.call(patient, encounter:, can_write:)
        {
          schema_version: "patient-clinical-history-v1",
          patient_id: patient.id,
          encounter_id: encounter&.id,
          can_write: can_write,
          allergies: patient.allergies.recorded_details.order(recorded_at: :desc, id: :desc).map { |record| allergy(record) },
          medications: patient.medication_statements.recorded_details.order(recorded_at: :desc, id: :desc).map { |record| medication(record) },
          conditions: patient.conditions.recorded_details.order(recorded_at: :desc, id: :desc).map { |record| condition(record) },
          reviews: latest_reviews(patient, encounter)
        }
      end

      def self.record(kind, value)
        case kind.to_s
        when "allergies" then allergy(value)
        when "medications" then medication(value)
        when "conditions" then condition(value)
        else raise ArgumentError, "Choose allergies, medications, or conditions."
        end
      end

      def self.review(value)
        {
          id: value.id, patient_id: value.patient_id, encounter_id: value.encounter_id,
          topic: value.topic, outcome: value.outcome, information_source: value.information_source,
          notes: value.notes, reviewed_at: iso(value.reviewed_at)
        }
      end

      def self.allergy(value)
        {
          id: value.id, patient_id: value.patient_id, allergen_name: value.allergen_name,
          reaction: value.reaction, category: value.category, clinical_status: value.clinical_status,
          verification_status: value.verification_status, criticality: value.criticality,
          severity: value.severity, onset_at: iso(value.onset_at), recorded_at: iso(value.recorded_at),
          last_reviewed_at: iso(value.last_reviewed_at), lock_version: value.lock_version
        }
      end
      private_class_method :allergy

      def self.medication(value)
        {
          id: value.id, patient_id: value.patient_id, medication_name: value.medication_name,
          dose_text: value.dose_text, route_text: value.route_text, frequency_text: value.frequency_text,
          purpose: value.purpose, status: value.status, information_source: value.information_source,
          effective_from: iso(value.effective_from), effective_until: iso(value.effective_until),
          asserted_at: iso(value.asserted_at), recorded_at: iso(value.recorded_at),
          last_reviewed_at: iso(value.last_reviewed_at), lock_version: value.lock_version
        }
      end
      private_class_method :medication

      def self.condition(value)
        {
          id: value.id, patient_id: value.patient_id, condition_name: value.condition_name,
          care_instruction: value.care_instruction, clinical_status: value.clinical_status,
          verification_status: value.verification_status, affects_current_care: value.affects_current_care,
          onset_at: iso(value.onset_at), resolved_at: iso(value.resolved_at), recorded_at: iso(value.recorded_at),
          last_reviewed_at: iso(value.last_reviewed_at), lock_version: value.lock_version
        }
      end
      private_class_method :condition

      def self.latest_reviews(patient, encounter)
        return {} unless encounter

        patient.history_reviews.where(encounter: encounter).latest_first.each_with_object({}) do |item, result|
          result[item.topic] ||= review(item)
        end
      end
      private_class_method :latest_reviews

      def self.iso(value)
        value&.iso8601(6)
      end
      private_class_method :iso
    end
  end
end
