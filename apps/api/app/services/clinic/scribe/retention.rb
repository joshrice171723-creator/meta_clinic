module Clinic
  module Scribe
    class Retention
      def self.scrub!(encounter)
        encounter.sources.find_each do |source|
          source.update_columns(content: "deleted", status: "deleted", deleted_at: Time.current, updated_at: Time.current)
          source.segments.update_all(content: "deleted", status: "deleted") if SourceSegment.column_names.include?("status")
          source.segments.update_all(content: "deleted", updated_at: Time.current)
        end
        encounter.drafts.find_each do |draft|
          draft.sections.update_all(generated_content: "deleted", human_content: nil, status: "rejected", warning_codes: ["deleted"], updated_at: Time.current)
          draft.update_columns(status: "deleted", deleted_at: Time.current, updated_at: Time.current)
        end
      end
    end
  end
end
