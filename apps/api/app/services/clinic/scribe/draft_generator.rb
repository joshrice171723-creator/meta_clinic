module Clinic
  module Scribe
    class DraftGenerator
      def self.call(segments, context: nil, context_provenance: nil, lab_versions: [])
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
        sections = {
          "subjective" => subjective,
          "objective" => grounded(clinician, missing: "No clinician source segment was provided."),
          "assessment" => abstention("Professional assessment required; the scribe does not generate diagnoses or clinical conclusions."),
          "plan" => abstention("Professional plan required; the scribe does not generate treatment, prescribing, or follow-up instructions.")
        }
        append_lab_evidence(sections, lab_versions)
      end

      def self.append_lab_results(sections, lab_versions)
        text = formatted_lab_results(lab_versions)
        return sections if text.blank?

        sections.merge("objective" => [sections.fetch("objective").presence, text].compact.join("\n\n"))
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

      def self.append_lab_evidence(sections, lab_versions)
        text = formatted_lab_results(lab_versions)
        return sections if text.blank?

        objective = sections.fetch("objective")
        objective[:content] = [objective[:content].presence, text].compact.join("\n\n")
        objective[:warning_codes] -= ["missing_source_evidence"]
        objective[:provenance] = {
          "kind" => "reviewed_source_evidence",
          "transcript" => objective[:provenance].presence,
          "lab_report_version_ids" => lab_versions.map(&:id)
        }.compact
        sections
      end

      def self.formatted_lab_results(lab_versions)
        Array(lab_versions).map do |version|
          report = version.lab_report
          heading = "#{report.source_name} — #{version.title}; collected #{version.collected_at.iso8601}; " \
            "version #{version.version_number} (#{version.status})"
          rows = version.results.map do |result|
            value = result.fetch("value").to_s
            value = "#{value} #{result['unit']}" if result["unit"].present?
            details = []
            details << "reference range: #{result['reference_range']}" if result["reference_range"].present?
            details << "flag: #{result['flag']}" if result["flag"].present?
            code = result["code"].present? ? " [#{result['code']}]" : ""
            "- #{result.fetch('name')}#{code}: #{value}#{details.any? ? " (#{details.join('; ')})" : ""}"
          end
          ([heading] + rows).join("\n")
        end.join("\n\n")
      end
      private_class_method :grounded, :abstention, :append_lab_evidence, :formatted_lab_results
    end
  end
end
