module Clinic
  module Assistant
    class WorkflowsController < Clinic::ApiController
      wrap_parameters false

      rescue_from WorkflowContext::Stale do
        invalidate_stale_context!
        audit_failure!("assistant.workflow.context.conflict", :failed)
        render json: { error: "Your clinic context changed. Reopen the assistant before continuing.", code: "stale_context" }, status: :conflict
      end

      rescue_from WorkflowExecution::Conflict do |error|
        audit_failure!("assistant.workflow.conflict", :failed)
        render json: { error: error.message, code: error.code }, status: :conflict
      end

      rescue_from WorkflowRegistry::Gated do |error|
        audit_failure!("assistant.workflow.gated", :denied)
        render json: { error: WorkflowPresenter.safe_text(error.message, maximum: 240), code: "workflow_gated" }, status: :forbidden
      end

      rescue_from Clinic::Authorization::Denied, CanCan::AccessDenied do
        audit_failure!("assistant.workflow.denied", :denied)
        render json: { error: "Your current role does not have permission for this workflow.", code: "permission_denied" }, status: :forbidden
      end

      rescue_from ActiveRecord::RecordNotFound do
        audit_failure!("assistant.workflow.not_found", :denied)
        render json: { error: "The selected clinic item is no longer available.", code: "not_found" }, status: :not_found
      end

      rescue_from Clinic::Idempotency::OutcomeUnconfirmed do
        audit_failure!("assistant.workflow.outcome_unconfirmed", :failed)
        render json: { error: "The saved result could not be confirmed. Open the proposal receipt before retrying.", code: "outcome_unconfirmed" }, status: :conflict
      end

      rescue_from ActiveRecord::Deadlocked, ActiveRecord::SerializationFailure do
        audit_failure!("assistant.workflow.concurrent_conflict", :failed)
        render json: { error: "The clinic record changed during this request. Review it before trying again.", code: "workflow_conflict" }, status: :conflict
      end

      rescue_from WorkflowSchema::Invalid, Clinic::Api::RequestParameters::Invalid do |error|
        audit_failure!("assistant.workflow.invalid", :failed)
        field = error.respond_to?(:field) ? error.field : nil
        render json: { error: WorkflowPresenter.safe_text(error.message, maximum: 240),
          code: "invalid_request", field: field }.compact, status: :unprocessable_entity
      end

      rescue_from WorkflowExecution::Unavailable, WorkflowRegistry::Unavailable do |error|
        audit_failure!("assistant.workflow.unavailable", :failed)
        render json: { error: WorkflowPresenter.safe_text(error.message, maximum: 240), code: "workflow_unavailable" }, status: :unprocessable_entity
      end

      rescue_from ActiveRecord::RecordInvalid, ArgumentError do |error|
        audit_failure!("assistant.workflow.invalid", :failed)
        message = error.is_a?(ActiveRecord::RecordInvalid) ? error.record.errors.full_messages.to_sentence : error.message
        render json: { error: WorkflowPresenter.safe_text(message, maximum: 240), code: "invalid_request" }, status: :unprocessable_entity
      end

      rescue_from WorkflowModelGateway::Unavailable do
        audit_failure!("assistant.workflow.model_unavailable", :failed)
        render json: { error: "Assistant suggestions are not available right now.", code: "assistant_unavailable" }, status: :service_unavailable
      end

      rescue_from WorkflowModelGateway::InvalidRequest do |error|
        audit_failure!("assistant.workflow.model_invalid", :failed)
        render json: { error: WorkflowPresenter.safe_text(error.message, maximum: 240), code: "invalid_request" }, status: :unprocessable_entity
      end

      rescue_from WorkflowModelGateway::BudgetExceeded, WorkflowModelGateway::ProviderQuotaExceeded do
        audit_failure!("assistant.workflow.model_quota", :failed)
        render json: { error: "The assistant has reached its request limit. Try again later.", code: "quota_exhausted" }, status: :too_many_requests
      end

      rescue_from WorkflowModelGateway::ProviderError do
        audit_failure!("assistant.workflow.model_failed", :failed)
        render json: { error: "I could not interpret that request. Please try again.", code: "assistant_request_failed" }, status: :bad_gateway
      end

      def create_context
        input = strict_input!(%i[context_id patient_id encounter_id patient_selection_id encounter_selection_id])
        context = context_service.create!(context_id: input[:context_id],
          patient_id: optional_id(input[:patient_id], :patient_id),
          patient_selection_id: input[:patient_selection_id],
          encounter_id: optional_id(input[:encounter_id], :encounter_id),
          encounter_selection_id: input[:encounter_selection_id])
        audit!("assistant.workflow.context.created", :prepared, "assistant_workflow_context/#{context.public_id}")
        render json: WorkflowContext.response(context), status: :created
      end

      def invalidate_context
        public_id = session[WorkflowContext::SESSION_CONTEXT_KEY]
        if public_id.present?
          context = WorkflowContextRecord.find_by(public_id:,
            practice: current_practice, actor_user: current_user,
            membership: clinic_membership, member_session_reference: current_member_session&.id)
          if context
            WorkflowContext.invalidate!(context, actor: current_user)
            audit!("assistant.workflow.context.cleared", :committed, "assistant_workflow_context/#{context.public_id}")
          end
          session.delete(WorkflowContext::SESSION_CONTEXT_KEY)
        end
        head :no_content
      end

      def catalog
        input = strict_input!(%i[context_id])
        context = context_for!(input[:context_id])
        return unless context
        items = WorkflowRegistry.catalog(context:)
        audit!("assistant.workflow.catalog.read", :released, "assistant_workflow_context/#{context.public_id}")
        render json: { operations: items }
      end

      def options
        input = strict_input!(%i[context_id operation field query inputs])
        context = context_for!(input[:context_id])
        return unless context
        operation = required_string!(input[:operation], :operation, 80)
        field = required_string!(input[:field], :field, 80)
        query = optional_string!(input[:query], :query, 100)
        supplied = input[:inputs] || {}
        if operation == "context"
          raw_options = WorkflowContext.context_options(context:, field:, query:,
            ability: current_ability, practice: current_practice, actor: current_user, site: context.site)
        else
          definition = WorkflowRegistry.fetch!(operation)
          WorkflowRegistry.require_available!(definition, context:)
          descriptor = definition.fetch("fields").find { |entry| entry.fetch("key") == field && entry.fetch("type") == "record" }
          raise WorkflowSchema::Invalid.new("That field does not accept a named selection.", field: :field) unless descriptor
          normalized = WorkflowSchema.normalize!(definition:, raw: supplied, context:, allow_missing: true)
          handler = WorkflowRegistry.handler_for(definition, context:)
          handler.authorize!(key: operation, inputs: normalized)
          raw_options = handler.options(key: operation, field:, query:, inputs: normalized)
        end
        tokens = WorkflowContext.issue_selections!(context:, operation:, field:, options: raw_options)
        audit!("assistant.workflow.options.read", :released, "assistant_workflow/#{operation}")
        render json: { options: tokens }
      end

      def create_message
        input = strict_input!(%i[context_id message operation])
        context = context_for!(input[:context_id])
        return unless context
        message = required_string!(input[:message], :message, 2_000)
        candidates = WorkflowRegistry.model_catalog(context:)
        if input[:operation].present?
          requested = required_string!(input[:operation], :operation, 80)
          selected = WorkflowRegistry.find(requested)
          if (gate = WorkflowRegistry.human_gate(requested))
            audit!("assistant.workflow.model.handoff", :released, "assistant_workflow/#{requested}")
            return render json: { status: "handoff", operation: selected.slice("key", "title"),
              message: gate.fetch(:reason),
              source_path: WorkflowPresenter.safe_path(gate[:source_path]) }
          end
          candidates = candidates.select { |entry| entry.fetch("key") == requested }
        end
        if candidates.empty?
          audit!("assistant.workflow.model.no_candidate", :released, "assistant_workflow_context/#{context.public_id}")
          return render json: { status: "clarify",
            message: "No assistant workflow is available for this request in the current clinic context." }
        end
        audit!("assistant.workflow.model.requested", :attempted, "assistant_workflow_context/#{context.public_id}")
        suggestion = WorkflowModelGateway.call(message:,
          operations: candidates.map { |entry| entry.slice("key", "title", "domain", "description", "fields") },
          current_date: Current.business_time.in_time_zone(site_timezone(context.site)).to_date.iso8601,
          timezone: site_timezone(context.site), user_id: current_user.id, practice_id: current_practice.id)
        context = context_for!(input[:context_id])
        return unless context
        if suggestion[:operation].present?
          definition = candidates.find { |entry| entry.fetch("key") == suggestion[:operation].to_s }
          raise WorkflowModelGateway::ProviderError unless definition
          normalized = WorkflowSchema.suggestion!(definition:, raw: suggestion[:inputs] || {}, context:)
          missing = WorkflowSchema.missing_required(definition:, inputs: normalized)
          audit!("assistant.workflow.model.suggested", :released, "assistant_workflow/#{definition.fetch('key')}")
          payload = { status: "suggestion", operation: definition.slice("key", "title", "kind", "domain"),
            inputs: normalized, missing_fields: missing.map { |field| field.slice("key", "label", "type", "required") },
            missing_context: {
              patient: definition.fetch("patient_required") && context.patient.nil?,
              encounter: definition.fetch("encounter_required") && context.encounter.nil?
            }.select { |_key, needed| needed }.keys,
            message: (safe_clarification(suggestion[:message]) if suggestion[:message].present?) }.compact
          render json: payload
        else
          audit!("assistant.workflow.model.clarified", :released, "assistant_workflow_context/#{context.public_id}")
          render json: { status: "clarify", message: safe_clarification(suggestion[:message]) }
        end
      end

      def read
        input = strict_input!(%i[context_id operation inputs])
        context = context_for!(input[:context_id])
        return unless context
        operation = required_string!(input[:operation], :operation, 80)
        result = execution(context).read!(operation:, inputs: input[:inputs] || {})
        render json: result
      end

      def create_proposal
        input = strict_input!(%i[context_id operation inputs])
        context = context_for!(input[:context_id])
        return unless context
        operation = required_string!(input[:operation], :operation, 80)
        result = execution(context).propose!(operation:, inputs: input[:inputs] || {})
        render json: result, status: :created
      end

      def confirm
        input = strict_input!(%i[context_id])
        context = context_for!(input[:context_id])
        return unless context
        render json: execution(context).confirm!(public_id: params[:id])
      end

      def show
        input = strict_input!(%i[context_id])
        context = context_for!(input[:context_id])
        return unless context
        render json: execution(context).show!(public_id: params[:id])
      end

      private

      def require_finalized_site_profile
        return if %w[invalidate_context create_context catalog options create_message].include?(action_name)
        return if %w[read create_proposal].include?(action_name) && setup_operation?(params[:operation])
        return if %w[confirm show].include?(action_name) && setup_proposal?
        super
        audit_preflight!("assistant.workflow.site.denied") if performed?
      end

      def setup_operation?(key)
        definition = WorkflowRegistry.find(key)
        definition && definition["handler"]&.name == "Clinic::Assistant::Workflows::Administration"
      end

      def setup_proposal?
        proposal = WorkflowProposal.find_by(public_id: params[:id], practice: current_practice,
          actor_user: current_user, member_session_reference: current_member_session&.id)
        proposal && setup_operation?(proposal.operation_key)
      end

      def context_service
        WorkflowContext.new(practice: current_practice, actor: current_user,
          membership: clinic_membership, member_session: current_member_session,
          site: current_clinic_site || raise(Clinic::Authorization::Denied), session:)
      end

      def context_for!(public_id)
        value = required_string!(public_id, :context_id, 64)
        context_service.find_current!(value)
      rescue WorkflowContext::Stale
        context = WorkflowContextRecord.find_by(public_id: value, actor_user: current_user,
          member_session_reference: current_member_session&.id)
        WorkflowContext.invalidate!(context, actor: current_user) if context
        audit!("assistant.workflow.context.conflict", :failed, "assistant_workflow_context/#{value}")
        render json: { error: "Your clinic context changed. Reopen the assistant before continuing.", code: "stale_context" }, status: :conflict
        nil
      end

      def execution(context)
        WorkflowExecution.new(context:, actor: current_user, session:)
      end

      def strict_input!(allowed)
        raw = request.get? ? request.query_parameters : request.request_parameters
        unknown = raw.keys.map(&:to_sym) - allowed
        if unknown.any?
          raise Clinic::Api::RequestParameters::Invalid.new("#{unknown.first} is not a supported field.", field: unknown.first)
        end
        raw.to_h.symbolize_keys
      end

      def required_string!(value, field, maximum)
        unless value.is_a?(String) && value.strip.present? && value.length <= maximum
          raise WorkflowSchema::Invalid.new("#{field} must be text no longer than #{maximum} characters.", field:)
        end
        value.strip
      end

      def optional_string!(value, field, maximum)
        return nil if value.nil? || value == ""
        required_string!(value, field, maximum)
      end

      def safe_clarification(value)
        WorkflowPresenter.safe_message(value)
      end

      def site_timezone(site)
        site.timezone_override.presence || current_practice.timezone
      end

      def audit!(action_code, outcome, resource_version_ref = nil)
        Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
          action_code:, outcome:, resource_version_ref:)
      end

      def audit_failure!(action_code, outcome)
        audit!(action_code, outcome, "assistant_workflow_context/#{session[WorkflowContext::SESSION_CONTEXT_KEY]}") if current_user && current_practice
      rescue Clinic::AuditRecorder::Unavailable
        raise
      end

      def invalidate_stale_context!
        public_id = session[WorkflowContext::SESSION_CONTEXT_KEY]
        return if public_id.blank? || !current_user || !current_practice
        context = WorkflowContextRecord.find_by(public_id:, practice: current_practice,
          actor_user: current_user, member_session_reference: current_member_session&.id)
        WorkflowContext.invalidate!(context, actor: current_user) if context
      end

      def audit_preflight!(action_code)
        return unless request.path.include?("/assistant/") && current_user && current_practice
        audit!(action_code, response.status.to_i == 403 ? :denied : :failed)
      end
    end
  end
end
