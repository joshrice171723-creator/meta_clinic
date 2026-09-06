module Clinic
  module Scribe
    class Retention
      def self.scrub!(encounter)
        RecordingCapture.scrub_for_encounter!(encounter)
        encounter.sources.find_each do |source|
          source.segments.find_each do |segment|
            segment.update!(content: "deleted", status: "deleted")
          end
          source.update!(content: "deleted", status: "deleted", deleted_at: Current.business_time)
        end
        encounter.drafts.find_each do |draft|
          draft.sections.find_each do |section|
            section.update!(generated_content: "deleted", human_content: nil, status: "rejected", warning_codes: ["deleted"])
          end
          draft.update!(status: "deleted", deleted_at: Current.business_time)
        end
        encounter.documents.find_each { |document| document.update!(status: "deleted", current_draft: nil) }
        encounter.update!(context_content: nil, context_digest: nil, context_source_type: nil,
          context_authored_by: nil, context_updated_at: Current.business_time)
      end
    end
  end
end
