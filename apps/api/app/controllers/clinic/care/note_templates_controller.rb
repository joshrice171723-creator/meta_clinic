module Clinic
  module Care
    class NoteTemplatesController < Clinic::ApiController
      before_action -> { require_capability("notes.read", any_site: true) }

      def index
        encounter = if params[:encounter_id].present?
          current_practice.encounters.find(requested_id!(params[:encounter_id], :encounter_id))
        end
        if encounter
          Clinic::Authorization.authorize!(actor: current_user, practice: current_practice,
            action: "notes.read", site: encounter.site)
          Clinic::Authorization.authorize!(actor: current_user, practice: current_practice,
            action: "patients.read", subject: encounter.patient)
        end
        render json: {
          templates: NoteTemplateCatalog.available(practice: current_practice, site: encounter&.site).map do |template|
            template.slice(:id, :version, :label, :note_kind, :source_label, :source_url, :caution, :sections)
          end
        }
      end
    end
  end
end
