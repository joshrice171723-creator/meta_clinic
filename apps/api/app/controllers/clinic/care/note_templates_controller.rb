module Clinic
  module Care
    class NoteTemplatesController < Clinic::ApiController
      before_action -> { require_capability("notes.read") }

      def index
        render json: {
          templates: NoteTemplateCatalog.all.map do |template|
            template.slice(:id, :version, :label, :note_kind, :source_label, :source_url, :caution, :sections)
          end
        }
      end
    end
  end
end
