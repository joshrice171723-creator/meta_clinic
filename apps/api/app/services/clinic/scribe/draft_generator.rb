module Clinic
  module Scribe
    class DraftGenerator
      def self.call(segments, context: nil, context_provenance: nil)
        patient = segments.select { |segment| %w[patient caregiver unknown].include?(segment.speaker) }
        clinician = segments.select { |segment| segment.speaker == "clinician" }
        subjective = grounded(patient, missing: "No patient or caregiver source segment was provided.")
        if patient.empty? && context.present?
          subjective = {
            content: context,
            status: "needs_review",
            warning_codes: ["reviewer_context_requires_review"],
            evidence_segment_ids: [],
            provenance: context_provenance || { "kind" => "reviewer_authored_context" }
          }
        end
        {
          "subjective" => subjective,
          "objective" => grounded(clinician, missing: "No clinician source segment was provided."),
          "assessment" => abstention("Professional assessment required; the scribe does not generate diagnoses or clinical conclusions."),
          "plan" => abstention("Professional plan required; the scribe does not generate treatment, prescribing, or follow-up instructions.")
        }
      end

      def self.grounded(segments, missing:)
        if segments.empty?
          { content: "", status: "needs_review", warning_codes: ["missing_source_evidence"], evidence_segment_ids: [], provenance: {} }
        else
          flags = segments.flat_map { |segment| segment.quality_flags.keys.map(&:to_s) }
          { content: segments.map(&:content).join("\n"), status: "needs_review",
            warning_codes: (flags.include?("low_confidence") ? ["low_confidence_source"] : []), evidence_segment_ids: segments.map(&:id),
            provenance: { "kind" => "transcript_segments", "segment_ids" => segments.map(&:id) } }
        end
      end

      def self.abstention(message)
        { content: message, status: "needs_review", warning_codes: ["professional_input_required"], evidence_segment_ids: [], provenance: {} }
      end
      private_class_method :grounded, :abstention
    end
  end
end
