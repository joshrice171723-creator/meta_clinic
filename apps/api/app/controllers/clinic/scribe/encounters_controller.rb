module Clinic
  module Scribe
    class EncountersController < Clinic::ApiController
      before_action -> { require_capability("scribe.read") }, only: %i[index show]
      before_action -> { require_capability("scribe.write") },
        only: %i[create create_synthetic context consent sources generate bind_clinical_encounter lab_selections]
      before_action -> { require_capability("scribe.delete") }, only: :destroy

      def index
        authorized_scope = current_practice.scribe_encounters.accessible_by(current_ability, :read)
        scope = authorized_scope.includes(:patient)
        scope = scope.where(patient_id: requested_id!(params[:patient_id], :patient_id)) if params[:patient_id].present?
        if params[:clinical_encounter_id].present?
          scope = scope.where(clinical_encounter_id: requested_id!(params[:clinical_encounter_id], :clinical_encounter_id))
        end
        if params[:q].present?
          patients = Clinic::Care::PatientNameSearch.search(scope: current_practice.patients.where(id: scope.select(:patient_id)),
            practice_id: current_practice.id, query: params[:q])
          scope = scope.where(patient_id: patients.select(:id))
        end
        encounters, pagination = paginated_records(
          scope,
          order: { updated_at: :desc, id: :desc }, default_per_page: 25, maximum: 50
        )
        render json: {
          encounters: encounters.map { |encounter| Serializer.encounter(encounter, detail: false) },
          patient_options: [],
          patient_pagination: { page: 1, per_page: 0, total: 0, total_pages: 0 },
          pagination: pagination,
          documentation_worklist: DocumentationWorklist.call(
            scribe_scope: authorized_scope,
            note_scope: documentation_note_scope
          )
        }
      end

      def create
        input = params.require(:encounter).permit(:patient_id, :site_id, :clinical_encounter_id,
          context: %i[content source_type]).to_h.with_indifferent_access
        patient = current_practice.patients.find(requested_id!(input[:patient_id], :patient_id))
        site = input[:site_id].present? ? current_practice.sites.find(requested_id!(input[:site_id], :site_id)) : nil
        clinical_encounter = if input[:clinical_encounter_id].present?
          current_practice.encounters.where(patient_id: patient.id)
            .find(requested_id!(input[:clinical_encounter_id], :clinical_encounter_id))
        end
        context = input[:context]&.with_indifferent_access
        encounter = Workflow.create_encounter(practice: current_practice, actor: current_user, patient: patient, site: site,
          clinical_encounter: clinical_encounter,
          context: context && { content: context[:content].to_s, source_type: context[:source_type].to_s })
        render json: { encounter: Serializer.encounter(encounter) }, status: :created
      end

      def create_synthetic
        raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled?
        raise ActiveRecord::RecordNotFound unless Development::DemoRun.active.exists?(
          id: session[:guided_clinic_demo_run_id], practice_id: current_practice.id,
          operator_user_id: current_user.id, lesson_key: "scribe_review"
        )

        input = parameter_hash!(:encounter, %i[patient_id site_id])
        patient = current_practice.patients.find(requested_id!(input[:patient_id], :patient_id))
        site = input[:site_id].present? ? current_practice.sites.find(requested_id!(input[:site_id], :site_id)) : current_practice.sites.first!
        clinical_encounter = current_practice.encounters.create!(patient:, site:, started_at: Current.business_time, status: "open")
        encounter = Workflow.create_encounter(
          practice: current_practice, actor: current_user, patient:, site:, clinical_encounter:,
          context: {
            source_type: "reviewer_authored",
            content: "Sample follow-up encounter. The patient reports steady progress since the last visit and no new urgent concerns. Review only these supplied facts, note questions that remain, and document a follow-up plan for clinician review."
          }
        )
        encounter = Workflow.decide_consent(encounter: encounter, actor: current_user,
          decision: "accepted", method: "sample_local_encounter")
        render json: { encounter: Serializer.encounter(encounter) }, status: :created
      end

      def bind_clinical_encounter
        encounter = scoped_encounter
        input = parameter_hash!(:clinical_encounter, %i[clinical_encounter_id expected_version])
        clinical_encounter = current_practice.encounters.where(patient_id: encounter.patient_id)
          .find(requested_id!(input[:clinical_encounter_id], :clinical_encounter_id))
        updated = Workflow.bind_clinical_encounter!(encounter: encounter, actor: current_user,
          clinical_encounter: clinical_encounter,
          expected_version: bounded_integer!(input[:expected_version], field: :expected_version,
            min: 0, max: 2_147_483_647))
        render json: { encounter: Serializer.encounter(updated) }
      end

      def lab_selections
        encounter = scoped_encounter
        Clinic::Authorization.authorize!(actor: current_user, practice: current_practice, action: "patients.read",
          subject: encounter.patient)
        Clinic::Authorization.authorize!(actor: current_user, practice: current_practice, action: "notes.read",
          any_site: true)
        input = parameter_hash!(:lab_selections, %i[expected_version], arrays: %i[lab_report_version_ids])
        version_ids = input.fetch(:lab_report_version_ids, []).map.with_index do |value, index|
          requested_id!(value, "lab_report_version_ids[#{index}]")
        end
        versions_by_id = Clinic::Care::LabReportVersion.where(practice_id: current_practice.id,
          patient_id: encounter.patient_id, id: version_ids).index_by(&:id)
        versions = version_ids.map { |id| versions_by_id.fetch(id) { raise ActiveRecord::RecordNotFound } }
        updated = Workflow.replace_lab_selections!(encounter: encounter, actor: current_user,
          lab_report_versions: versions,
          expected_version: bounded_integer!(input[:expected_version], field: :expected_version,
            min: 0, max: 2_147_483_647))
        render json: { encounter: Serializer.encounter(updated) }
      end

      def context
        encounter = scoped_encounter
        input = parameter_hash!(:context, %i[content expected_version source_type])
        updated = Workflow.save_context!(encounter: encounter, actor: current_user, content: input[:content],
          source_type: input[:source_type].presence || "reviewer_authored",
          expected_version: bounded_integer!(input[:expected_version], field: :expected_version, min: 0, max: 2_147_483_647))
        render json: { encounter: Serializer.encounter(updated) }
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
        input = params[:generation].present? ? parameter_hash!(:generation,
          %i[template_id document_id expected_version telehealth_visit_public_id capture_epoch], arrays: %i[source_ids]) : {}
        if input[:telehealth_visit_public_id].present?
          visit = Clinic::Telehealth::Visit.find_by!(practice_id: current_practice.id,
            public_id: input[:telehealth_visit_public_id])
          unless visit.scribe_encounter_id == encounter.id && visit.scribe_capture_epoch == input[:capture_epoch].to_i
            raise ArgumentError, "The Scribe source set is not current for this telehealth visit."
          end
        end
        draft, document = Workflow.generate_draft(encounter: encounter, actor: current_user,
          template_id: input[:template_id].presence || Workflow::DEFAULT_TEMPLATE_ID,
          document_id: input[:document_id].presence,
          source_ids: input[:source_ids],
          expected_version: input[:expected_version].nil? ? nil : bounded_integer!(input[:expected_version], field: :expected_version, min: 0, max: 2_147_483_647))
        render json: { draft: Serializer.draft(draft), document: Serializer.document(document),
          encounter: Serializer.encounter(encounter.reload) }, status: :created
      end

      def destroy
        encounter = scoped_encounter
        authorize_encounter!(encounter, "scribe.delete")
        encounter.with_lock do
          raise ArgumentError, "This encounter has already been deleted." if encounter.deleted_at
          encounter.update!(status: "deleted", deleted_at: Current.business_time)
          Retention.scrub!(encounter)
          Event.create!(practice: current_practice, encounter: encounter, actor: current_user, event_type: "encounter_deleted",
            resource_type: "Encounter", resource_id: encounter.id, metadata: { "retention" => "content_scrubbed" }, created_at: Time.current)
          Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user, action_code: "scribe.encounter_deleted",
            outcome: :committed, resource_version_ref: "Clinic::Scribe::Encounter/#{encounter.id}")
        end
        render json: { encounter: Serializer.encounter(encounter.reload) }
      end

      private

      def documentation_note_scope
        return unless current_ability.allowed_permission?("notes.read", any_site: true) &&
          current_ability.allowed_permission?("patients.read")

        Clinic::EncounterNote.accessible_by(current_ability, :read)
      end

      def scoped_encounter
        current_practice.scribe_encounters.find(requested_id!(params[:id], :id))
      end

      def authorize_encounter!(encounter, action)
        Clinic::Authorization.authorize!(actor: current_user, practice: current_practice, action: action, site: encounter.site)
      end

      def sensitive_read_action
        return "scribe.read" if %w[index show].include?(action_name)

        super
      end
    end
  end
end
