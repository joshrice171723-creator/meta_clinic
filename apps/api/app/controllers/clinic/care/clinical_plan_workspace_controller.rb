module Clinic
  module Care
    class ClinicalPlanWorkspaceController < Clinic::ApiController
      FIELD_SETS = {
        medication_requests: %i[status intent transmission_state inventory_product_id medication_name dose_value
          dose_unit_code dose_text route_code route_text frequency_text quantity_text scheduled_for reason_text
          instructions source_medication_statement_id completion_exception fulfillment_route medication_strength medication_form
          medication_code_system medication_code medication_code_version catalog_source pharmacy_name pharmacy_location
          pharmacy_identifier prescribed_quantity quantity_unit refills starts_on duration_text refill_of_series_id],
        service_requests: %i[status request_kind intent priority requested_code_system requested_code requested_display
          destination reason_text due_at completion_exception],
        diagnoses: %i[status classification code_system diagnosis_code diagnosis_display clinical_note],
        procedures: %i[status code_system procedure_code procedure_display performed_at outcome_text complication_state
          complication_text service_request_revision_id],
        care_plans: %i[status title description starts_on ends_on],
        care_goals: %i[status care_plan_revision_id description outcome_text outcome_source outcome_recorded_at target_on],
        immunizations: %i[status vaccine_name cvx_code manufacturer manufacturer_mvx_code lot_number
          lot_expiration_date dose_text route_text administration_site_text administered_at occurrence_source
          refusal_reason source_document_id medication_administration_id vis_edition_date vis_given_date],
        assessments: %i[status category instrument_name instrument_version score_value interpretation response_summary
          follow_up_plan assessed_at response_source]
      }.freeze
      ROOTS = {
        medication_requests: :medication_request,
        service_requests: :service_request,
        diagnoses: :diagnosis,
        procedures: :procedure,
        care_plans: :care_plan,
        care_goals: :care_goal,
        immunizations: :immunization,
        assessments: :assessment
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
      def create_immunization = create_record(:immunizations)
      def revise_immunization = revise_record(:immunizations)
      def create_assessment = create_record(:assessments)
      def revise_assessment = revise_record(:assessments)

      def create_fulfillment_link
        patient, encounter = patient_and_encounter
        input = parameter_hash!(:clinical_plan_link,
          %i[source_kind source_revision_id target_kind target_id outcome_summary request_key])
        record = ClinicalPlanClosureWorkflow.link(
          practice: current_practice, actor: current_user, patient:, encounter:,
          source_kind: required_string!(input[:source_kind], field: :source_kind, maximum: 32),
          source_revision_id: requested_id!(input[:source_revision_id], :source_revision_id),
          target_kind: required_string!(input[:target_kind], field: :target_kind, maximum: 32),
          target_id: requested_id!(input[:target_id], :target_id),
          outcome_summary: optional_string(input[:outcome_summary], field: :outcome_summary, maximum: 2_000),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160)
        )
        render json: { clinical_plan_link: record }, status: :created
      end

      def create_referral_event
        patient, encounter = patient_and_encounter
        input = parameter_hash!(:referral_event,
          %i[service_request_revision_id direction stage organization_name note document_id request_key])
        record = ClinicalPlanClosureWorkflow.record_referral_event(
          practice: current_practice, actor: current_user, patient:, encounter:,
          service_request_revision_id: requested_id!(input[:service_request_revision_id], :service_request_revision_id),
          direction: required_string!(input[:direction], field: :direction, maximum: 16),
          stage: required_string!(input[:stage], field: :stage, maximum: 24),
          organization_name: optional_string(input[:organization_name], field: :organization_name, maximum: 500),
          note: optional_string(input[:note], field: :note, maximum: 2_000),
          document_id: optional_id(input[:document_id], :document_id),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160)
        )
        render json: { referral_event: record }, status: :created
      end

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
          attributes: normalized_input(kind, input.except(:request_key, :expected_version, :reconcile_completion)),
          reconcile_completion: input.fetch(:reconcile_completion, false),
          expected_version: bounded_integer!(input[:expected_version], field: :expected_version,
            min: 1, max: 2_147_483_647),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160)
        )
        render json: { ROOTS.fetch(kind) => ClinicalPlanWorkflow.serialize(kind, record) }, status: :created
      end

      def record_input(kind, revising:)
        fields = FIELD_SETS.fetch(kind) + %i[request_key]
        fields += %i[expected_version reconcile_completion] if revising
        parameter_hash!(ROOTS.fetch(kind), fields)
      end

      def normalized_input(kind, input)
        value = input.dup
        %i[inventory_product_id source_medication_statement_id service_request_revision_id care_plan_revision_id
          source_document_id medication_administration_id].each do |field|
          value[field] = optional_id(value[field], field) if value.key?(field)
        end
        %i[due_at performed_at administered_at scheduled_for assessed_at outcome_recorded_at].each do |field|
          value[field] = value[field].present? ? time_param!(value[field], field:) : nil if value.key?(field)
        end
        %i[starts_on ends_on target_on lot_expiration_date vis_edition_date vis_given_date].each do |field|
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
