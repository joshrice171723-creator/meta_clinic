module Clinic
  module Care
    class ClinicalPlanWorkspaceController < Clinic::ApiController
      FIELD_SETS = {
        medication_requests: %i[status intent transmission_state medication_name dose_text route_text frequency_text
          quantity_text instructions source_medication_statement_id],
        service_requests: %i[status request_kind intent priority requested_code_system requested_code requested_display
          destination reason_text due_at],
        diagnoses: %i[status classification code_system diagnosis_code diagnosis_display clinical_note],
        procedures: %i[status code_system procedure_code procedure_display performed_at outcome_text complication_state
          complication_text service_request_revision_id],
        care_plans: %i[status title description starts_on ends_on],
        care_goals: %i[status care_plan_revision_id description outcome_text target_on]
      }.freeze
      ROOTS = {
        medication_requests: :medication_request,
        service_requests: :service_request,
        diagnoses: :diagnosis,
        procedures: :procedure,
        care_plans: :care_plan,
        care_goals: :care_goal
      }.freeze

      def show
        patient, encounter = patient_and_encounter
        render json: ClinicalPlanWorkflow.workspace(
          practice: current_practice, actor: current_user, patient:, encounter:
        )
      end

      def create_medication_request = create_record(:medication_requests)
      def revise_medication_request = revise_record(:medication_requests)
      def create_service_request = create_record(:service_requests)
      def revise_service_request = revise_record(:service_requests)
      def create_diagnosis = create_record(:diagnoses)
      def revise_diagnosis = revise_record(:diagnoses)
      def create_procedure = create_record(:procedures)
      def revise_procedure = revise_record(:procedures)
      def create_care_plan = create_record(:care_plans)
      def revise_care_plan = revise_record(:care_plans)
      def create_care_goal = create_record(:care_goals)
      def revise_care_goal = revise_record(:care_goals)

      private

      def create_record(kind)
        patient, encounter = patient_and_encounter
        input = record_input(kind, revising: false)
        record = ClinicalPlanWorkflow.create(
          kind:, practice: current_practice, actor: current_user, patient:, encounter:,
          attributes: normalized_input(kind, input.except(:request_key)),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160)
        )
        render json: { ROOTS.fetch(kind) => ClinicalPlanWorkflow.serialize(kind, record) }, status: :created
      end

      def revise_record(kind)
        patient, encounter = patient_and_encounter
        input = record_input(kind, revising: true)
        record = ClinicalPlanWorkflow.revise(
          kind:, series_id: params[:series_id], practice: current_practice, actor: current_user, patient:, encounter:,
          attributes: normalized_input(kind, input.except(:request_key, :expected_version)),
          expected_version: bounded_integer!(input[:expected_version], field: :expected_version,
            min: 1, max: 2_147_483_647),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160)
        )
        render json: { ROOTS.fetch(kind) => ClinicalPlanWorkflow.serialize(kind, record) }, status: :created
      end

      def record_input(kind, revising:)
        fields = FIELD_SETS.fetch(kind) + %i[request_key]
        fields += %i[expected_version] if revising
        parameter_hash!(ROOTS.fetch(kind), fields)
      end

      def normalized_input(kind, input)
        value = input.dup
        %i[source_medication_statement_id service_request_revision_id care_plan_revision_id].each do |field|
          value[field] = optional_id(value[field], field) if value.key?(field)
        end
        %i[due_at performed_at].each do |field|
          value[field] = value[field].present? ? time_param!(value[field], field:) : nil if value.key?(field)
        end
        %i[starts_on ends_on target_on].each do |field|
          value[field] = value[field].present? ? date_param!(value[field], field:) : nil if value.key?(field)
        end
        value
      end

      def patient_and_encounter
        patient = current_practice.patients.accessible_by(current_ability, :read)
          .find(requested_id!(params[:patient_id], :patient_id))
        encounter = current_practice.encounters.where(patient:)
          .find(requested_id!(params[:encounter_id], :encounter_id))
        [ patient, encounter ]
      end
    end
  end
end
