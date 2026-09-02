module Clinic
  module Care
    module PatientCareSummarySerializer
      TOPICS = %w[allergies medications care_needs].freeze

      def self.call(patient, encounter: nil, as_of: Time.current)
        allergies = patient.allergies.active_for_summary.to_a
        medications = patient.medication_statements.active_for_summary.to_a
        care_needs = patient.care_needs.active_at(as_of).order(:category, :recorded_at, :id).to_a
        conditions = patient.conditions.active_care_alerts.to_a
        reviews = latest_reviews(patient, encounter, as_of)
        review_needed_topics = encounter ? review_needed_topics(reviews, allergies, medications, care_needs) : nil

        {
          schema_version: "patient-care-summary-v1",
          patient_id: patient.id,
          encounter_id: encounter&.id,
          as_of: as_of.iso8601(6),
          allergies: {
            state: item_state(allergies, reviews["allergies"]),
            active_count: allergies.length,
            items: allergies.map { |allergy| allergy_payload(allergy) }
          },
          medications: {
            state: item_state(medications, reviews["medications"]),
            active_count: medications.length,
            items: medications.map { |medication| medication_payload(medication) }
          },
          communication: communication_payload(patient.demographics, care_needs),
          care_needs: {
            state: item_state(care_needs, reviews["care_needs"]),
            active_count: care_needs.length,
            items: care_needs.map { |need| care_need_payload(need) }
          },
          current_care_conditions: {
            state: conditions.any? ? "known" : "not_recorded",
            active_count: conditions.length,
            items: conditions.map { |condition| condition_payload(condition) }
          },
          precautions: precaution_payload(encounter, as_of),
          reviews: TOPICS.to_h { |topic| [ topic, review_payload(reviews[topic]) ] },
          review_needed: encounter ? review_needed_topics.any? : nil,
          review_needed_topics: review_needed_topics
        }
      end

      def self.latest_reviews(patient, encounter, as_of)
        relation = patient.history_reviews.reviewed_at_or_before(as_of)
        relation = relation.where(encounter: encounter) if encounter
        relation.latest_first.each_with_object({}) { |review, latest| latest[review.topic] ||= review }
      end
      private_class_method :latest_reviews

      def self.review_needed_topics(reviews, allergies, medications, care_needs)
        items = { "allergies" => allergies, "medications" => medications, "care_needs" => care_needs }
        TOPICS.select do |topic|
          review = reviews[topic]
          next true unless review
          next true if review.outcome_follow_up_needed? || review.outcome_unable_to_obtain?
          next true if review.outcome_current_list_confirmed? && items.fetch(topic).empty?
          next true if review.outcome_none_reported? && items.fetch(topic).any?

          false
        end
      end
      private_class_method :review_needed_topics

      def self.item_state(items, review)
        return "known" if items.any?
        return "none_reported" if review&.outcome_none_reported?

        "not_recorded"
      end
      private_class_method :item_state

      def self.allergy_payload(allergy)
        {
          id: allergy.id,
          allergen: allergy.allergen_name,
          reaction: allergy.reaction,
          category: allergy.category,
          criticality: allergy.criticality,
          severity: allergy.severity,
          clinical_status: allergy.clinical_status,
          verification_status: allergy.verification_status,
          onset_at: iso(allergy.onset_at),
          recorded_at: iso(allergy.recorded_at),
          last_reviewed_at: iso(allergy.last_reviewed_at),
          lock_version: allergy.lock_version
        }
      end
      private_class_method :allergy_payload

      def self.medication_payload(medication)
        {
          id: medication.id,
          medication: medication.medication_name,
          dose: medication.dose_text,
          route: medication.route_text,
          frequency: medication.frequency_text,
          purpose: medication.purpose,
          status: medication.status,
          information_source: medication.information_source,
          effective_from: iso(medication.effective_from),
          effective_until: iso(medication.effective_until),
          asserted_at: iso(medication.asserted_at),
          recorded_at: iso(medication.recorded_at),
          last_reconciled_at: iso(medication.last_reviewed_at),
          lock_version: medication.lock_version
        }
      end
      private_class_method :medication_payload

      def self.communication_payload(demographics, care_needs)
        needs = care_needs.select(&:category_communication?)
        {
          state: demographics.present? || needs.any? ? "known" : "not_recorded",
          primary_language: demographics&.primary_language,
          interpreter_required: demographics&.interpreter_required,
          needs: needs.map { |need| care_need_payload(need) }
        }
      end
      private_class_method :communication_payload

      def self.care_need_payload(need)
        {
          id: need.id,
          category: need.category,
          code: need.need_code,
          description: need.description,
          instructions: need.instructions,
          status: need.status,
          effective_from: iso(need.effective_from),
          effective_until: iso(need.effective_until),
          recorded_at: iso(need.recorded_at),
          last_reviewed_at: iso(need.last_reviewed_at),
          lock_version: need.lock_version
        }
      end
      private_class_method :care_need_payload

      def self.condition_payload(condition)
        {
          id: condition.id,
          condition: condition.condition_name,
          clinical_status: condition.clinical_status,
          verification_status: condition.verification_status,
          instruction: condition.care_instruction,
          onset_at: iso(condition.onset_at),
          recorded_at: iso(condition.recorded_at),
          last_reviewed_at: iso(condition.last_reviewed_at),
          lock_version: condition.lock_version
        }
      end
      private_class_method :condition_payload

      def self.precaution_payload(encounter, as_of)
        return { state: "not_applicable", active_count: 0, items: [] } unless encounter

        active = encounter.precautions.active_for_summary.recorded_at_or_before(as_of).to_a
        state = if active.any?
          "known"
        elsif encounter.precautions.exists?
          "none_active"
        else
          "not_recorded"
        end
        {
          state: state,
          active_count: active.length,
          items: active.map { |precaution| {
            id: precaution.id,
            type: precaution.precaution_type,
            evidence_status: precaution.evidence_status,
            status: precaution.status,
            instructions: precaution.instructions,
            recorded_at: iso(precaution.recorded_at),
            last_reassessed_at: iso(precaution.last_reassessed_at),
            lock_version: precaution.lock_version
          } }
        }
      end
      private_class_method :precaution_payload

      def self.review_payload(review)
        return { state: "not_reviewed" } unless review

        {
          state: review.outcome,
          information_source: review.information_source,
          reviewed_at: iso(review.reviewed_at)
        }
      end
      private_class_method :review_payload

      def self.iso(value)
        value&.iso8601(6)
      end
      private_class_method :iso
    end
  end
end
