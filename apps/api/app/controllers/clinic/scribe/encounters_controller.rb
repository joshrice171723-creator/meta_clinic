module Clinic
  module Scribe
    class EncountersController < Clinic::ApiController
      before_action -> { require_capability("scribe.read") }, only: :show
      before_action -> { require_capability("scribe.write") }, only: %i[create consent sources generate]
      before_action -> { require_capability("scribe.delete") }, only: :destroy

      def create
        input = parameter_hash!(:encounter, %i[patient_id site_id])
        patient = current_practice.patients.find(requested_id!(input[:patient_id], :patient_id))
        site = input[:site_id].present? ? current_practice.sites.find(requested_id!(input[:site_id], :site_id)) : nil
        encounter = Workflow.create_encounter(practice: current_practice, actor: current_user, patient: patient, site: site)
        render json: { encounter: Serializer.encounter(encounter) }, status: :created
      end

      def show
        encounter = scoped_encounter
        authorize_encounter!(encounter, "scribe.read")
        render json: { encounter: Serializer.encounter(encounter) }
      end

      def consent
        encounter = scoped_encounter
        input = parameter_hash!(:consent, %i[decision method])
        updated = Workflow.decide_consent(encounter: encounter, actor: current_user,
          decision: required_string!(input[:decision], field: :decision, maximum: 20),
          method: optional_string(input[:method], field: :method, maximum: 40) || "in_person")
        render json: { encounter: Serializer.encounter(updated) }
      end

      def sources
        encounter = scoped_encounter
        input = parameter_hash!(:source, %i[content segments metadata])
        source = Workflow.ingest_transcript(encounter: encounter, actor: current_user,
          content: required_string!(input[:content], field: :content, maximum: 250_000),
          segments: input[:segments] || [], metadata: input[:metadata] || {})
        render json: { source: Serializer.source(source), encounter: Serializer.encounter(encounter.reload) }, status: :created
      end

      def generate
        encounter = scoped_encounter
        draft = Workflow.generate_draft(encounter: encounter, actor: current_user)
        render json: { draft: Serializer.draft(draft), encounter: Serializer.encounter(encounter.reload) }, status: :created
      end

      def destroy
        encounter = scoped_encounter
        authorize_encounter!(encounter, "scribe.delete")
        encounter.with_lock do
          raise ArgumentError, "This encounter has already been deleted." if encounter.deleted_at
          encounter.update!(status: "deleted", deleted_at: Time.current)
          Retention.scrub!(encounter)
          Event.create!(practice: current_practice, encounter: encounter, actor: current_user, event_type: "encounter_deleted",
            resource_type: "Encounter", resource_id: encounter.id, metadata: { "retention" => "content_scrubbed" }, created_at: Time.current)
          Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user, action_code: "scribe.encounter_deleted",
            outcome: :committed, resource_version_ref: "Clinic::Scribe::Encounter/#{encounter.id}")
        end
        render json: { encounter: Serializer.encounter(encounter.reload) }
      end

      private

      def scoped_encounter
        current_practice.scribe_encounters.find(requested_id!(params[:id], :id))
      end

      def authorize_encounter!(encounter, action)
        Clinic::Authorization.authorize!(actor: current_user, practice: current_practice, action: action, site: encounter.site)
      end
    end
  end
end
